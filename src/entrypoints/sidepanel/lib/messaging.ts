import type { ToContent, FromContent, ToBackground, FromBackground } from '@/core/messages';

// Resolve the active tab and talk to its content script.
export async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab.id;
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
    return false;
  }
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
