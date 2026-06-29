import type { DetectedField } from '../types';

// Auto-save: persist partially-filled application state so the user can resume
// if the browser crashes or they navigate away accidentally.
// Uses chrome.storage.session (per-browser-session, cleared on close) for speed.

const KEY = 'fillProgress';

interface FillProgress {
  url: string;
  fields: Array<{ uid: string; value: string | null; mappedKey: string | null }>;
  savedAt: number;
}

export async function saveFillProgress(
  url: string,
  fields: DetectedField[],
): Promise<void> {
  const progress: FillProgress = {
    url: normalizeUrl(url),
    fields: fields
      .filter((f) => f.value != null)
      .map((f) => ({ uid: f.uid, value: f.value, mappedKey: f.mappedKey })),
    savedAt: Date.now(),
  };
  await chrome.storage.session.set({ [KEY]: progress });
}

export async function loadFillProgress(url: string): Promise<FillProgress | null> {
  const raw = await chrome.storage.session.get(KEY);
  const progress = raw[KEY] as FillProgress | undefined;
  if (!progress) return null;

  // Only restore if same URL and saved within the last hour
  const hourAgo = Date.now() - 60 * 60 * 1000;
  if (normalizeUrl(url) !== progress.url || progress.savedAt < hourAgo) return null;
  return progress;
}

export async function clearFillProgress(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    return u.origin + u.pathname;
  } catch {
    return raw;
  }
}
