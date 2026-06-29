import { useCallback, useEffect, useState } from 'react';
import {
  getApplications,
  updateApplication,
  deleteApplication,
  applicationsToCSV,
} from '@/core/storage/appTracker';
import type { TrackedApplication, ApplicationStatus } from '@/core/storage/blobStore';
import { Section, Button } from '../components/ui';

const STATUS_OPTIONS: ApplicationStatus[] = [
  'applied',
  'in-progress',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: 'bg-blue-100 text-blue-800',
  'in-progress': 'bg-yellow-100 text-yellow-800',
  interview: 'bg-purple-100 text-purple-800',
  offer: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-800',
};

export function ApplicationsSection() {
  const [apps, setApps] = useState<TrackedApplication[]>([]);
  const [filter, setFilter] = useState<ApplicationStatus | ''>('');

  const load = useCallback(async () => {
    setApps(await getApplications());
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = filter ? apps.filter((a) => a.status === filter) : apps;

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    await updateApplication(id, { status });
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteApplication(id);
    await load();
  };

  const exportCSV = () => {
    const csv = applicationsToCSV(apps);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section
      title="Applications"
      description={`${apps.length} applications tracked. Logged automatically when you fill a form.`}
    >
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ApplicationStatus | '')}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500">{filtered.length} shown</span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={exportCSV}>Export CSV</Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          No applications yet. Fill a job form and it'll be logged here automatically.
        </p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((app) => (
            <div key={app.id} className="rounded border p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{app.role}</div>
                <div className="text-xs text-gray-600 truncate">{app.company}</div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {new Date(app.appliedAt).toLocaleDateString()} · {app.atsType}
                </div>
              </div>
              <select
                value={app.status}
                onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status]}`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <a
                href={app.url}
                target="_blank"
                rel="noopener"
                className="text-xs text-indigo-600 hover:underline shrink-0"
              >
                Open
              </a>
              <button
                onClick={() => handleDelete(app.id)}
                className="text-xs text-red-500 hover:text-red-700 shrink-0"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
