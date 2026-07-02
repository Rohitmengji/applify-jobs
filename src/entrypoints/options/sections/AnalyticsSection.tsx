import { useEffect, useState } from 'react';
import { getApplications } from '@/core/storage/appTracker';
import type { TrackedApplication } from '@/core/storage/blobStore';
import { Section } from '../components/ui';

export function AnalyticsSection() {
  const [apps, setApps] = useState<TrackedApplication[]>([]);

  useEffect(() => {
    void getApplications().then(setApps);
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

  // Estimated time saved (15 min per app manually, 30 sec with extension)
  const timeSavedMin = Math.round(apps.length * 14.5); // 14.5 min saved per app
  const timeSavedHrs = Math.round((timeSavedMin / 60) * 10) / 10;

  return (
    <Section title="Analytics" description="Your application activity and time saved.">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="This week" value={String(thisWeek.length)} sub="applications" />
        <StatCard label="This month" value={String(thisMonth.length)} sub="applications" />
        <StatCard label="Total" value={String(apps.length)} sub="all time" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Time saved" value={`${timeSavedHrs}h`} sub={`${timeSavedMin} min total`} />
        <StatCard
          label="Response rate"
          value={`${apps.length > 0 ? Math.round(((statusCounts['interview'] ?? 0) / apps.length) * 100) : 0}%`}
          sub="got interviews"
        />
        <StatCard
          label="Avg/day"
          value={String(Math.round((thisWeek.length / 7) * 10) / 10)}
          sub="this week"
        />
      </div>

      {/* Weekly bar chart */}
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Last 7 days</h3>
      <div className="flex items-end gap-1 h-20 mb-4">
        {dayCounts.map((count, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-indigo-500 rounded-t"
              style={{ height: `${(count / maxDay) * 100}%`, minHeight: count > 0 ? '4px' : '0' }}
            />
            <span className="text-[9px] text-gray-400 mt-1">{dayLabels[i]}</span>
          </div>
        ))}
      </div>

      {/* ATS breakdown */}
      {topAts.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Top ATS platforms</h3>
          <div className="space-y-1 mb-4">
            {topAts.map(([ats, count]) => (
              <div key={ats} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-24 truncate">{ats}</span>
                <div className="flex-1 bg-gray-100 rounded h-3">
                  <div
                    className="bg-indigo-400 rounded h-3"
                    style={{ width: `${(count / apps.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Status breakdown */}
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Application status</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
            {status}: <strong>{count}</strong>
          </span>
        ))}
      </div>
    </Section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border p-3 text-center">
      <div className="text-lg font-bold text-indigo-700">{value}</div>
      <div className="text-[11px] font-medium text-gray-700">{label}</div>
      <div className="text-[10px] text-gray-400">{sub}</div>
    </div>
  );
}
