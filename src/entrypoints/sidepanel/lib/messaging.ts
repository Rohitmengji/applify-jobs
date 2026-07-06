import type { ToContent, FromContent, ToBackground, FromBackground } from '@/core/messages';

// Resolve the active tab and talk to its content script. Pass the panel's OWN windowId so a
// per-window side panel never binds to another window's active tab (`currentWindow` follows
// the focused window, which is wrong when multiple windows each have a panel open).
export async function activeTabId(windowId?: number): Promise<number> {
  const [tab] = await chrome.tabs.query(
    windowId != null ? { active: true, windowId } : { active: true, currentWindow: true },
  );
  if (!tab?.id) throw new Error('No active tab');
  return tab.id;
}

// The window this side-panel document belongs to (captured once on open).
export async function currentWindowId(): Promise<number | undefined> {
  try {
    return (await chrome.windows.getCurrent()).id;
  } catch {
    return undefined;
  }
}

export async function sendToTab<R = FromContent>(msg: ToContent): Promise<R> {
  return chrome.tabs.sendMessage(await activeTabId(), msg) as Promise<R>;
}

// Send to one specific frame of a tab (frameId 0 = top frame).
export async function sendToFrame<R = FromContent>(
  tabId: number,
  frameId: number,
  msg: ToContent,
): Promise<R> {
  return chrome.tabs.sendMessage(tabId, msg, { frameId }) as Promise<R>;
}

// Enumerate the frame ids of a tab so we can detect/fill inside iframes (§25).
// Falls back to just the top frame if webNavigation is unavailable.
export async function frameIds(tabId: number): Promise<number[]> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const ids = (frames ?? []).map((f) => f.frameId);
    return ids.length ? ids : [0];
  } catch {
    return [0];
  }
}

export async function sendToBackground<R = FromBackground>(msg: ToBackground): Promise<R> {
  return chrome.runtime.sendMessage(msg) as Promise<R>;
}

// Generic / self-hosted career sites aren't in the content-script `matches` list
// (atsHosts.ts), so the script isn't auto-injected there. When no frame responds to
// DETECT, inject it on demand into every frame. Host access is covered by `activeTab`
// (granted when the user opened the panel from the toolbar), so this needs no extra
// prompt on the tab the user is looking at. Returns false if injection isn't permitted
// (e.g. a chrome:// page, or host access not granted) so the caller can show guidance.
export async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content-scripts/content.js'],
    });
    return true;
  } catch {
    // activeTab may have expired (user navigated after opening panel).
    // Try requesting host permission for this specific tab's URL.
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.url) {
        const origin = new URL(tab.url).origin + '/*';
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (granted) {
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content-scripts/content.js'],
          });
          return true;
        }
      }
    } catch {
      // Truly failed — no permission granted
    }
    return false;
  }
}

/**
 * Heartbeat check: ping a frame's content script; if it doesn't respond within 1s,
 * re-inject and retry once. Returns true if the frame is alive after the check.
 */
export async function ensureContentScript(tabId: number, frameId = 0): Promise<boolean> {
  const ping = () =>
    chrome.tabs
      .sendMessage(tabId, { type: 'PING' }, { frameId })
      .then((r) => r?.type === 'PONG')
      .catch(() => false);

  if (await withTimeout(ping(), 1000)) return true;
  // Content script dead — reinject and retry
  const injected = await injectContentScript(tabId);
  if (!injected) return false;
  await new Promise((r) => setTimeout(r, 500));
  return withTimeout(ping(), 1000);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | false> {
  return Promise.race([p, new Promise<false>((r) => setTimeout(() => r(false), ms))]);
}

// base64-encode a File, chunked to avoid the call-stack limit on large résumés (§25).
export async function fileToB64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
