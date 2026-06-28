import type { LearnedMap } from '../engine/learn';

// IMPLEMENTATION.md "Learning Engine" — persistence for learned field mappings, in
// chrome.storage.local (local-only, like the profile). The pure logic is in engine/learn.ts.

const KEY = 'learnedFields';

export async function getLearned(): Promise<LearnedMap> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as LearnedMap | undefined) ?? {};
}

export async function recordLearned(
  entries: {
    fingerprint: string;
    key: import('../profile.schema').ProfileKey | null;
    value: string;
  }[],
): Promise<void> {
  if (entries.length === 0) return;
  const map = await getLearned();
  const now = Date.now();
  for (const { fingerprint, key, value } of entries) {
    const prev = map[fingerprint];
    map[fingerprint] = { key, value, uses: (prev?.uses ?? 0) + 1, updatedAt: now };
  }
  await chrome.storage.local.set({ [KEY]: map });
}

export async function clearLearned(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export async function countLearned(): Promise<number> {
  return Object.keys(await getLearned()).length;
}
