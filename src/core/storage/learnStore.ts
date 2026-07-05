import type { LearnedMap } from '../engine/learn';
import { scopeKey, GLOBAL_SCOPE } from '../engine/learn';
import type { ProfileKey } from '../profile.schema';

// IMPLEMENTATION.md "Learning Engine" — persistence for learned field mappings, in
// chrome.storage.local (local-only, like the profile). The pure logic is in engine/learn.ts.
// Entries are stored under a scope key: per-ATS (adapterId) AND a global fallback, so the
// same question can carry an ATS-specific answer while still being reusable elsewhere.

const KEY = 'learnedFields';
const MAX_ENTRIES = 4000; // ~2 keys/answer (global + per-ATS) → ~2000 learned answers

export async function getLearned(): Promise<LearnedMap> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as LearnedMap | undefined) ?? {};
}

// Bound growth: when over cap, evict the stalest (least-recently-updated, then least-used).
function capMap(map: LearnedMap): void {
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES) return;
  keys.sort((a, b) => map[a].updatedAt - map[b].updatedAt || map[a].uses - map[b].uses);
  for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
}

// Serialize writes within this JS context so concurrent recordLearned calls (e.g. several
// blur auto-saves in a row) don't read-modify-write over each other and drop entries/uses.
// (Cross-context writes — panel + background — are rare; the passive observer routes through
// the background, and the panel's own saves are chained here.)
let writeChain: Promise<void> = Promise.resolve();

export async function recordLearned(
  entries: { fingerprint: string; key: ProfileKey | null; value: string }[],
  adapterId: string | null = null,
): Promise<void> {
  if (entries.length === 0) return;
  const run = writeChain.then(async () => {
    const map = await getLearned();
    const now = Date.now();
    const write = (k: string, key: ProfileKey | null, value: string) => {
      const prev = map[k];
      map[k] = { key, value, uses: (prev?.uses ?? 0) + 1, updatedAt: now };
    };
    for (const { fingerprint, key, value } of entries) {
      if (adapterId) write(scopeKey(adapterId, fingerprint), key, value); // per-ATS
      write(scopeKey(null, fingerprint), key, value); // global fallback
    }
    capMap(map);
    await chrome.storage.local.set({ [KEY]: map });
  });
  writeChain = run.catch(() => {}); // keep the chain alive even if one write fails
  return run;
}

export async function clearLearned(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/** Export learned data as a JSON-serializable object (for backup/transfer). */
export async function exportLearned(): Promise<LearnedMap> {
  return getLearned();
}

/** Import learned data (merges with existing — newer entries win on conflict). */
export async function importLearned(incoming: LearnedMap): Promise<number> {
  const existing = await getLearned();
  let imported = 0;
  for (const [key, entry] of Object.entries(incoming)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.value || typeof entry.value !== 'string') continue;
    const prev = existing[key];
    // Keep the entry with the newer updatedAt, or import if new
    if (!prev || (entry.updatedAt && entry.updatedAt > (prev.updatedAt ?? 0))) {
      existing[key] = entry;
      imported++;
    }
  }
  capMap(existing);
  await chrome.storage.local.set({ [KEY]: existing });
  return imported;
}

// Distinct learned fields (count the global entries — one per fingerprint).
export async function countLearned(): Promise<number> {
  const map = await getLearned();
  return Object.keys(map).filter((k) => k.startsWith(`${GLOBAL_SCOPE}::`)).length;
}
