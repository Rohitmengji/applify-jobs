// Field success rate tracking — records per-ATS fill statistics so the user
// (and developer) can see which platforms have the most unmapped/failed fields.
// Stored in chrome.storage.local, capped to prevent unbounded growth.

const KEY = 'fillStats';
const MAX_ENTRIES = 500;

export interface FillStat {
  ats: string; // adapter ID or 'generic'
  url: string; // job URL (normalized)
  ts: number;
  totalFields: number;
  mapped: number; // fields that got a profile key
  filled: number; // fields successfully filled
  failed: number; // fields that threw during fill
  unmapped: number; // fields with no mapping (needs review)
}

export interface AtsAggregation {
  ats: string;
  totalFills: number;
  avgMappedRate: number; // 0-1
  avgFilledRate: number; // 0-1
  avgFailRate: number; // 0-1
  totalFields: number;
}

async function getStats(): Promise<FillStat[]> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as FillStat[] | undefined) ?? [];
}

async function saveStats(stats: FillStat[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: stats });
}

/** Record a fill session's stats. */
export async function recordFillStats(stat: FillStat): Promise<void> {
  const stats = await getStats();
  stats.push(stat);
  // Cap at MAX_ENTRIES (drop oldest)
  if (stats.length > MAX_ENTRIES) {
    stats.splice(0, stats.length - MAX_ENTRIES);
  }
  await saveStats(stats);
}

/** Get aggregated stats per ATS. */
export async function getAtsAggregation(): Promise<AtsAggregation[]> {
  const stats = await getStats();
  const byAts: Record<string, FillStat[]> = {};
  for (const s of stats) {
    const key = s.ats || 'generic';
    if (!byAts[key]) byAts[key] = [];
    byAts[key].push(s);
  }

  return Object.entries(byAts)
    .map(([ats, entries]) => {
      const totalFields = entries.reduce((s, e) => s + e.totalFields, 0);
      const totalMapped = entries.reduce((s, e) => s + e.mapped, 0);
      const totalFilled = entries.reduce((s, e) => s + e.filled, 0);
      const totalFailed = entries.reduce((s, e) => s + e.failed, 0);
      return {
        ats,
        totalFills: entries.length,
        avgMappedRate: totalFields > 0 ? totalMapped / totalFields : 0,
        avgFilledRate: totalFields > 0 ? totalFilled / totalFields : 0,
        avgFailRate: totalFields > 0 ? totalFailed / totalFields : 0,
        totalFields,
      };
    })
    .sort((a, b) => b.totalFills - a.totalFills);
}

/** Get raw stats for export/debugging. */
export async function getFillStats(): Promise<FillStat[]> {
  return getStats();
}

/** Clear all fill stats. */
export async function clearFillStats(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
