import { useEffect, useState } from 'react';
import { getApplications } from '@/core/storage/appTracker';
import type { TrackedApplication } from '@/core/storage/blobStore';
import {
  getLlmUsageStats,
  getLlmUsageByType,
  getDailyUsage,
  clearLlmUsageStats,
  type LlmUsageStats,
} from '@/core/storage/llmUsage';
import {
  getRecentActivity,
  clearActivityLog,
  type ActivityEntry,
} from '@/core/storage/activityLog';
import { getAtsAggregation, type AtsAggregation } from '@/core/storage/fillStats';
import { Section } from '../components/ui';

export function AnalyticsSection() {
  const [apps, setApps] = useState<TrackedApplication[]>([]);
  const [llmStats, setLlmStats] = useState<LlmUsageStats | null>(null);
  const [llmByType, setLlmByType] = useState<
    Record<string, { calls: number; tokens: number; cached: number }>
  >({});
  const [llmDaily, setLlmDaily] = useState<
    { date: string; calls: number; tokens: number; cached: number }[]
  >([]);
  const [atsStats, setAtsStats] = useState<AtsAggregation[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    void getApplications().then(setApps);
    void getLlmUsageStats().then(setLlmStats);
    void getLlmUsageByType().then(setLlmByType);
    void getDailyUsage(7).then(setLlmDaily);
    void getAtsAggregation().then(setAtsStats);
    void getRecentActivity(100).then(setActivity);
  }, []);

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const thisWeek = apps.filter((a) => a.appliedAt > weekAgo);
  const thisMonth = apps.filter((a) => a.appliedAt > monthAgo);

  // ATS breakdown
  const atsCounts: Record<string, number> = {};
  for (const a of apps) {
    atsCounts[a.atsType] = (atsCounts[a.atsType] ?? 0) + 1;
  }
  const topAts = Object.entries(atsCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const a of apps) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  // Applications per day (last 7 days)
  const dayLabels: string[] = [];
  const dayCounts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const label = d.toLocaleDateString('en', { weekday: 'short' });
    dayLabels.push(label);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    dayCounts.push(apps.filter((a) => a.appliedAt >= dayStart && a.appliedAt < dayEnd).length);
  }
  const maxDay = Math.max(...dayCounts, 1);

  // Funnel: applied → interview → offer
  const interviews = statusCounts['interview'] ?? 0;
  const offers = statusCounts['offer'] ?? 0;
  const positiveResponses = interviews + offers;
  const responseRate = apps.length > 0 ? Math.round((positiveResponses / apps.length) * 100) : 0;

  return (
    <Section title="Analytics" description="Your application activity.">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="This week" value={String(thisWeek.length)} sub="applications" />
        <StatCard label="This month" value={String(thisMonth.length)} sub="applications" />
        <StatCard label="Total" value={String(apps.length)} sub="all time" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Interviews" value={String(interviews)} sub="callbacks" />
        <StatCard label="Response rate" value={`${responseRate}%`} sub="interview + offer" />
        <StatCard
          label="Avg/day"
          value={String(Math.round((thisWeek.length / 7) * 10) / 10)}
          sub="this week"
        />
      </div>

      {/* Funnel */}
      {apps.length > 0 && (
        <div className="mb-4 rounded border border-slate-700 p-3">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Funnel</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium">{apps.length} applied</span>
            <span className="text-gray-300">→</span>
            <span className="font-medium">{interviews} interviews</span>
            <span className="text-gray-300">→</span>
            <span className="font-medium text-green-600">{offers} offers</span>
          </div>
        </div>
      )}

      {/* Weekly bar chart */}
      <h3 className="text-sm font-semibold text-slate-300 mb-2">Last 7 days</h3>
      <div className="flex items-end gap-1 h-20 mb-4">
        {dayCounts.map((count, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-indigo-500 rounded-t"
              style={{ height: `${(count / maxDay) * 100}%`, minHeight: count > 0 ? '4px' : '0' }}
            />
            <span className="text-[9px] text-slate-500 mt-1">{dayLabels[i]}</span>
          </div>
        ))}
      </div>

      {/* ATS breakdown */}
      {topAts.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Top ATS platforms</h3>
          <div className="space-y-1 mb-4">
            {topAts.map(([ats, count]) => (
              <div key={ats} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-24 truncate">{ats}</span>
                <div className="flex-1 bg-slate-800 rounded h-3">
                  <div
                    className="bg-indigo-400 rounded h-3"
                    style={{ width: `${(count / apps.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Status breakdown */}
      <h3 className="text-sm font-semibold text-slate-300 mb-2">Application status</h3>
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
            {status}: <strong>{count}</strong>
          </span>
        ))}
      </div>

      {/* Field Success Rates per ATS */}
      {atsStats.length > 0 && (
        <div className="mb-6 border-t border-slate-700 pt-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Fill Success Rate by ATS</h3>
          <div className="space-y-2">
            {atsStats.slice(0, 8).map((s) => (
              <div key={s.ats} className="rounded border border-slate-700 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-300 capitalize">{s.ats}</span>
                  <span className="text-[10px] text-slate-500">{s.totalFills} fills</span>
                </div>
                <div className="flex gap-1 h-2.5 rounded overflow-hidden bg-slate-800">
                  <div
                    className="bg-green-500"
                    style={{ width: `${s.avgFilledRate * 100}%` }}
                    title={`Filled: ${Math.round(s.avgFilledRate * 100)}%`}
                  />
                  <div
                    className="bg-yellow-500"
                    style={{ width: `${(s.avgMappedRate - s.avgFilledRate) * 100}%` }}
                    title={`Mapped but not filled: ${Math.round((s.avgMappedRate - s.avgFilledRate) * 100)}%`}
                  />
                  <div
                    className="bg-red-500"
                    style={{ width: `${s.avgFailRate * 100}%` }}
                    title={`Failed: ${Math.round(s.avgFailRate * 100)}%`}
                  />
                </div>
                <div className="flex gap-3 mt-1 text-[9px] text-slate-500">
                  <span>{Math.round(s.avgFilledRate * 100)}% filled</span>
                  <span>{Math.round(s.avgMappedRate * 100)}% mapped</span>
                  {s.avgFailRate > 0 && (
                    <span className="text-red-400">{Math.round(s.avgFailRate * 100)}% failed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LLM Usage Dashboard */}
      <div className="border-t border-slate-700 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-300">AI Usage</h3>
          {llmStats && llmStats.totalCalls > 0 && (
            <button
              onClick={async () => {
                await clearLlmUsageStats();
                setLlmStats(null);
                setLlmByType({});
                setLlmDaily([]);
              }}
              className="text-[10px] text-slate-500 hover:text-red-400"
            >
              Reset stats
            </button>
          )}
        </div>

        {llmStats && llmStats.totalCalls > 0 ? (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <StatCard
                label="API calls"
                value={String(llmStats.totalCalls - llmStats.cacheHits)}
                sub="actual"
              />
              <StatCard
                label="Cache hits"
                value={String(llmStats.cacheHits)}
                sub={`${llmStats.totalCalls > 0 ? Math.round((llmStats.cacheHits / llmStats.totalCalls) * 100) : 0}% hit rate`}
              />
              <StatCard
                label="Tokens"
                value={
                  llmStats.totalTokens > 1000
                    ? `${Math.round(llmStats.totalTokens / 1000)}K`
                    : String(llmStats.totalTokens)
                }
                sub="estimated"
              />
              <StatCard
                label="Est. cost"
                value={`$${((llmStats.totalTokens / 1_000_000) * 0.15).toFixed(3)}`}
                sub="@ gpt-mini rate"
              />
            </div>

            {/* By type */}
            {Object.keys(llmByType).length > 0 && (
              <>
                <h4 className="text-xs font-medium text-slate-400 mb-1">By type</h4>
                <div className="space-y-1 mb-3">
                  {Object.entries(llmByType)
                    .sort((a, b) => b[1].tokens - a[1].tokens)
                    .map(([type, data]) => (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-slate-400 capitalize">{type}</span>
                        <div className="flex-1 bg-slate-800 rounded h-2.5">
                          <div
                            className="bg-purple-500 rounded h-2.5"
                            style={{
                              width: `${llmStats.totalTokens > 0 ? (data.tokens / llmStats.totalTokens) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="w-16 text-right text-slate-500">{data.calls} calls</span>
                        <span className="w-16 text-right text-slate-500">
                          {data.cached > 0 && `${data.cached} cached`}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}

            {/* Daily chart */}
            {llmDaily.length > 0 && (
              <>
                <h4 className="text-xs font-medium text-slate-400 mb-1">Daily API calls (7d)</h4>
                <div className="flex items-end gap-1 h-14 mb-2">
                  {llmDaily.map((d, i) => {
                    const maxCalls = Math.max(...llmDaily.map((x) => x.calls + x.cached), 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex flex-col-reverse">
                          <div
                            className="w-full bg-purple-500 rounded-t"
                            style={{
                              height: `${(d.calls / maxCalls) * 56}px`,
                              minHeight: d.calls > 0 ? '2px' : '0',
                            }}
                          />
                          <div
                            className="w-full bg-green-600 rounded-t"
                            style={{
                              height: `${(d.cached / maxCalls) * 56}px`,
                              minHeight: d.cached > 0 ? '2px' : '0',
                            }}
                          />
                        </div>
                        <span className="text-[8px] text-slate-500 mt-0.5">
                          {new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 text-[9px] text-slate-500 mb-2">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-purple-500 rounded" /> API calls
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-green-600 rounded" /> Cache hits
                    (saved)
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500">
            No AI usage recorded yet. Stats appear after your first AI-assisted fill.
          </p>
        )}
      </div>

      {/* Activity Audit Log */}
      <div className="border-t border-slate-700 pt-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowActivity(!showActivity)}
            className="text-sm font-semibold text-slate-300 hover:text-indigo-400"
          >
            {showActivity ? '▾' : '▸'} Activity Log
            {activity.length > 0 && (
              <span className="ml-1.5 text-[10px] text-slate-500">({activity.length} entries)</span>
            )}
          </button>
          {showActivity && activity.length > 0 && (
            <button
              onClick={async () => {
                await clearActivityLog();
                setActivity([]);
              }}
              className="text-[10px] text-slate-500 hover:text-red-400"
            >
              Clear log
            </button>
          )}
        </div>
        {showActivity &&
          (activity.length === 0 ? (
            <p className="text-xs text-slate-500">No activity recorded yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {activity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 rounded px-2 py-1.5 text-[10px] hover:bg-slate-800"
                >
                  <span className="shrink-0 mt-0.5">
                    {entry.type === 'detect' && '🔍'}
                    {entry.type === 'fill' && '✏️'}
                    {entry.type === 'draft' && '🤖'}
                    {entry.type === 'wizard' && '🧙'}
                    {entry.type === 'error' && '❌'}
                    {entry.type === 'cache-hit' && '⚡'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-300">{entry.details}</div>
                    <div className="text-[9px] text-slate-500 truncate">
                      {entry.url} · {entry.ats} · {new Date(entry.ts).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </Section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border p-3 text-center">
      <div className="text-lg font-bold text-indigo-700">{value}</div>
      <div className="text-[11px] font-medium text-slate-300">{label}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}
