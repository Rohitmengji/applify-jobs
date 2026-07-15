// LLM response cache — avoids redundant API calls for identical field signals.
// Stores mapping results keyed on a hash of the field signals in chrome.storage.local.
// TTL-based eviction keeps storage bounded (~200KB cap).

const CACHE_KEY = 'llmCache';
const MAX_ENTRIES = 2000;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CachedMapping {
  key: string | null;
  confidence: number;
  ts: number; // timestamp when cached
}

type CacheStore = Record<string, CachedMapping>;

// FNV-1a 64-bit hash (split into two 32-bit halves for JS) — much lower collision
// rate than djb2 for structurally similar JSON strings. No crypto overhead needed
// for a local-only cache key.
function hashSignals(signals: unknown): string {
  const str = JSON.stringify(signals);
  // FNV-1a constants (32-bit version, applied twice with different seeds for 64-bit-like output)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return 'mc_' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

async function loadCache(): Promise<CacheStore> {
  const raw = await chrome.storage.local.get(CACHE_KEY);
  return (raw[CACHE_KEY] as CacheStore | undefined) ?? {};
}

async function saveCache(store: CacheStore): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: store });
}

function evict(store: CacheStore): void {
  const now = Date.now();
  // 1) Remove expired entries
  for (const k of Object.keys(store)) {
    if (now - store[k].ts > TTL_MS) delete store[k];
  }
  // 2) If still over cap, drop oldest
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => store[a].ts - store[b].ts);
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[k];
  }
}

/** Look up cached mapping results for a batch of field signals. */
export async function getCachedMappings(
  fields: { uid: string; signals: unknown }[],
): Promise<{ hits: Map<string, CachedMapping>; misses: { uid: string; signals: unknown }[] }> {
  const store = await loadCache();
  const hits = new Map<string, CachedMapping>();
  const misses: { uid: string; signals: unknown }[] = [];

  // Evict stale entries once up front instead of checking TTL per-item
  evict(store);

  for (const f of fields) {
    const hash = hashSignals(f.signals);
    const cached = store[hash];
    if (cached) {
      hits.set(f.uid, cached);
    } else {
      misses.push(f);
    }
  }
  return { hits, misses };
}

/** Store mapping results in the cache. */
export async function setCachedMappings(
  fields: { uid: string; signals: unknown }[],
  results: { uid: string; key: string | null; confidence: number }[],
): Promise<void> {
  const store = await loadCache();
  const now = Date.now();
  const resultByUid = new Map(results.map((r) => [r.uid, r]));

  for (const f of fields) {
    const r = resultByUid.get(f.uid);
    if (!r) continue;
    const hash = hashSignals(f.signals);
    store[hash] = { key: r.key, confidence: r.confidence, ts: now };
  }
  evict(store);
  await saveCache(store);
}

/** Deduplicate a batch of fields by signal fingerprint. Returns unique fields and a map to fan out results. */
export function deduplicateBatch(fields: { uid: string; signals: unknown }[]): {
  unique: { uid: string; signals: unknown }[];
  fanout: Map<string, string[]>;
} {
  const seen = new Map<string, string>(); // hash → representative uid
  const fanout = new Map<string, string[]>(); // representative uid → [all uids with same signals]
  const unique: { uid: string; signals: unknown }[] = [];

  for (const f of fields) {
    const hash = hashSignals(f.signals);
    const existing = seen.get(hash);
    if (existing) {
      fanout.get(existing)!.push(f.uid);
    } else {
      seen.set(hash, f.uid);
      fanout.set(f.uid, [f.uid]);
      unique.push(f);
    }
  }
  return { unique, fanout };
}
