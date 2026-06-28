import type { LearnedMap } from '../engine/learn';
import { scopeKey, GLOBAL_SCOPE } from '../engine/learn';
import type { ProfileKey } from '../profile.schema';

// IMPLEMENTATION.md "Learning Engine" — persistence for learned field mappings, in
// chrome.storage.local (local-only, like the profile). The pure logic is in engine/learn.ts.
// Entries are stored under a scope key: per-ATS (adapterId) AND a global fallback, so the
// same question can carry an ATS-specific answer while still being reusable elsewhere.

const KEY = 'learnedFields';

export async function getLearned(): Promise<LearnedMap> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as LearnedMap | undefined) ?? {};
}

export async function recordLearned(
  entries: { fingerprint: string; key: ProfileKey | null; value: string }[],
  adapterId: string | null = null,
): Promise<void> {
  if (entries.length === 0) return;
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
  await chrome.storage.local.set({ [KEY]: map });
}

export async function clearLearned(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

// Distinct learned fields (count the global entries — one per fingerprint).
export async function countLearned(): Promise<number> {
  const map = await getLearned();
  return Object.keys(map).filter((k) => k.startsWith(`${GLOBAL_SCOPE}::`)).length;
}
