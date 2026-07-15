// LLM usage tracking — persists call counts, estimated tokens, and cache hit rates
// across service worker restarts. Used to show the user how their API budget is being
// spent and where caching is saving money.

const KEY = 'llmUsageStats';

export interface LlmCallRecord {
  type: 'mapping' | 'draft' | 'extract' | 'tailor' | 'coverLetter';
  tokens: number; // estimated input+output tokens
  cached: boolean; // true if served from cache (no API call)
  ts: number;
}

export interface LlmUsageStats {
  calls: LlmCallRecord[];
  totalCalls: number;
  totalTokens: number;
  cacheHits: number;
  cacheMisses: number;
}

const MAX_RECORDS = 1000; // keep last 1000 call records

async function getStats(): Promise<LlmUsageStats> {
  const raw = await chrome.storage.local.get(KEY);
  return (
    (raw[KEY] as LlmUsageStats | undefined) ?? {
      calls: [],
      totalCalls: 0,
      totalTokens: 0,
      cacheHits: 0,
      cacheMisses: 0,
    }
  );
}

async function saveStats(stats: LlmUsageStats): Promise<void> {
  await chrome.storage.local.set({ [KEY]: stats });
}

/** Record an LLM call (or cache hit). */
export async function recordLlmCall(
  type: LlmCallRecord['type'],
  tokens: number,
  cached: boolean,
): Promise<void> {
  const stats = await getStats();
  stats.calls.push({ type, tokens, cached, ts: Date.now() });
  // Cap stored records
  if (stats.calls.length > MAX_RECORDS) {
    stats.calls = stats.calls.slice(-MAX_RECORDS);
  }
  stats.totalCalls++;
  stats.totalTokens += tokens;
  if (cached) stats.cacheHits++;
  else stats.cacheMisses++;
  await saveStats(stats);
}

/** Get usage stats for display. */
export async function getLlmUsageStats(): Promise<LlmUsageStats> {
  return getStats();
}

/** Get stats aggregated by call type. */
export async function getLlmUsageByType(): Promise<
  Record<string, { calls: number; tokens: number; cached: number }>
> {
  const stats = await getStats();
  const byType: Record<string, { calls: number; tokens: number; cached: number }> = {};
  for (const r of stats.calls) {
    if (!byType[r.type]) byType[r.type] = { calls: 0, tokens: 0, cached: 0 };
    byType[r.type].calls++;
    byType[r.type].tokens += r.tokens;
    if (r.cached) byType[r.type].cached++;
  }
  return byType;
}

/** Get daily usage for the last N days. */
export async function getDailyUsage(
  days = 14,
): Promise<{ date: string; calls: number; tokens: number; cached: number }[]> {
  const stats = await getStats();
  const now = Date.now();
  const result: { date: string; calls: number; tokens: number; cached: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const dayRecords = stats.calls.filter((r) => r.ts >= dayStart && r.ts < dayEnd);
    result.push({
      date: dateStr,
      calls: dayRecords.filter((r) => !r.cached).length,
      tokens: dayRecords.reduce((s, r) => s + r.tokens, 0),
      cached: dayRecords.filter((r) => r.cached).length,
    });
  }
  return result;
}

/** Reset all usage stats. */
export async function clearLlmUsageStats(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
