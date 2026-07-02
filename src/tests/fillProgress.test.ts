import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DetectedField } from '@/core/types';

// Minimal in-memory chrome.storage.session mock (MV3 promise API).
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      },
      remove: async (key: string) => {
        delete store[key];
      },
    },
  },
});

// Imported AFTER the mock so the module sees `chrome`.
const { saveFillProgress, loadFillProgress, clearFillProgress } =
  await import('@/core/storage/fillProgress');

function field(uid: string, value: string): DetectedField {
  return {
    uid,
    kind: 'text',
    signals: {
      label: '',
      name: '',
      id: '',
      placeholder: '',
      ariaLabel: '',
      autocomplete: '',
      nearbyText: '',
      required: false,
    },
    mappedKey: null,
    confidence: 1,
    value,
    source: 'manual',
    filled: false,
  };
}

const JOB_A = 'https://boards.greenhouse.io/acme/jobs/1?utm=x';
const JOB_B = 'https://jobs.lever.co/globex/2';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('fillProgress — per-URL isolation (multi-tab)', () => {
  it('keeps each job’s progress separate; filling B never clobbers A', async () => {
    await saveFillProgress(JOB_A, [field('a1', 'Ada')]);
    await saveFillProgress(JOB_B, [field('b1', 'Grace')]);

    const a = await loadFillProgress(JOB_A);
    const b = await loadFillProgress(JOB_B);
    expect(a?.fields[0].value).toBe('Ada');
    expect(b?.fields[0].value).toBe('Grace');
  });

  it('normalizes the URL (query/hash ignored) so the same job matches', async () => {
    await saveFillProgress(JOB_A, [field('a1', 'Ada')]);
    const loaded = await loadFillProgress('https://boards.greenhouse.io/acme/jobs/1#apply');
    expect(loaded?.fields[0].value).toBe('Ada');
  });

  it('clearFillProgress(url) clears only that job; the other survives', async () => {
    await saveFillProgress(JOB_A, [field('a1', 'Ada')]);
    await saveFillProgress(JOB_B, [field('b1', 'Grace')]);

    await clearFillProgress(JOB_A);
    expect(await loadFillProgress(JOB_A)).toBeNull();
    expect((await loadFillProgress(JOB_B))?.fields[0].value).toBe('Grace');
  });

  it('clearFillProgress() with no argument clears everything', async () => {
    await saveFillProgress(JOB_A, [field('a1', 'Ada')]);
    await saveFillProgress(JOB_B, [field('b1', 'Grace')]);
    await clearFillProgress();
    expect(await loadFillProgress(JOB_A)).toBeNull();
    expect(await loadFillProgress(JOB_B)).toBeNull();
  });
});
