import type { DetectedField } from '../types';

// Auto-save: persist partially-filled application state so the user can resume if the
// browser crashes or they navigate away. Uses chrome.storage.session (per-browser-session).
//
// Keyed BY normalized URL (a map), so multiple open jobs each keep their own progress —
// filling job B never clobbers job A's saved state. clearFillProgress(url) clears one job;
// clearFillProgress() clears everything.

const KEY = 'fillProgress';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

interface FillProgress {
  url: string;
  fields: Array<{ uid: string; value: string | null; mappedKey: string | null }>;
  savedAt: number;
}

type ProgressMap = Record<string, FillProgress>;

async function getMap(): Promise<ProgressMap> {
  const raw = await chrome.storage.session.get(KEY);
  return (raw[KEY] as ProgressMap | undefined) ?? {};
}

// Drop entries older than MAX_AGE so the session store doesn't grow unbounded across
// many jobs in one browsing session.
function prune(map: ProgressMap): ProgressMap {
  const cutoff = Date.now() - MAX_AGE_MS;
  const out: ProgressMap = {};
  for (const [url, p] of Object.entries(map)) if (p.savedAt >= cutoff) out[url] = p;
  return out;
}

export async function saveFillProgress(url: string, fields: DetectedField[]): Promise<void> {
  const key = normalizeUrl(url);
  const map = prune(await getMap());
  map[key] = {
    url: key,
    fields: fields
      .filter((f) => f.value != null)
      .map((f) => ({ uid: f.uid, value: f.value, mappedKey: f.mappedKey })),
    savedAt: Date.now(),
  };
  await chrome.storage.session.set({ [KEY]: map });
}

export async function loadFillProgress(url: string): Promise<FillProgress | null> {
  const key = normalizeUrl(url);
  const progress = (await getMap())[key];
  if (!progress) return null;
  if (progress.savedAt < Date.now() - MAX_AGE_MS) return null;
  return progress;
}

// Clear one job's progress (pass its URL) or ALL progress (no argument).
export async function clearFillProgress(url?: string): Promise<void> {
  if (!url) {
    await chrome.storage.session.remove(KEY);
    return;
  }
  const map = await getMap();
  delete map[normalizeUrl(url)];
  await chrome.storage.session.set({ [KEY]: map });
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
