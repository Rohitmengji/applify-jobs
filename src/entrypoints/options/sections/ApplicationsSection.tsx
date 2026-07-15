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
  withdrawn: 'bg-slate-800 text-slate-200',
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  'in-progress': 'In Progress',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const KANBAN_COLUMNS: ApplicationStatus[] = [
  'applied',
  'in-progress',
  'interview',
  'offer',
  'rejected',
];

type ViewMode = 'list' | 'board';

export function ApplicationsSection() {
  const [apps, setApps] = useState<TrackedApplication[]>([]);
  const [filter, setFilter] = useState<ApplicationStatus | ''>('');
  const [view, setView] = useState<ViewMode>('board');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const load = useCallback(async () => {
    setApps(await getApplications());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = filter ? apps.filter((a) => a.status === filter) : apps;

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    await updateApplication(id, { status });
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteApplication(id);
    await load();
  };

  const handleSaveNotes = async (id: string) => {
    await updateApplication(id, { notes: notesDraft });
    setEditingNotes(null);
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

  // Stats for the header
  const counts = STATUS_OPTIONS.reduce(
    (acc, s) => {
      acc[s] = apps.filter((a) => a.status === s).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <Section
      title="Applications"
      description={`${apps.length} applications tracked. Logged automatically when you fill a form.`}
    >
      {/* Stats pills */}
      {apps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {STATUS_OPTIONS.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[s]}`}
            >
              {STATUS_LABELS[s]}: {counts[s]}
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded border border-slate-600 overflow-hidden">
          <button
            onClick={() => setView('board')}
            className={`px-2.5 py-1 text-xs ${view === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
          >
            Board
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-2.5 py-1 text-xs ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
          >
            List
          </button>
        </div>
        {view === 'list' && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ApplicationStatus | '')}
            className="rounded border border-slate-600 px-2 py-1 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-slate-400">
          {view === 'list' ? `${filtered.length} shown` : `${apps.length} total`}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={exportCSV}>
          Export CSV
        </Button>
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          No applications yet. Fill a job form and it&apos;ll be logged here automatically.
        </p>
      ) : view === 'board' ? (
        /* Kanban Board */
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ minHeight: '300px' }}>
          {KANBAN_COLUMNS.map((col) => {
            const colApps = apps.filter((a) => a.status === col);
            return (
              <div
                key={col}
                className="flex-shrink-0 w-48 rounded-lg border border-slate-700 bg-slate-900 p-2"
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <h4 className="text-[11px] font-semibold text-slate-300">{STATUS_LABELS[col]}</h4>
                  <span className="text-[10px] text-slate-500 bg-slate-800 rounded-full px-1.5">
                    {colApps.length}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                  {colApps.map((app) => (
                    <div
                      key={app.id}
                      className="rounded border border-slate-700 bg-slate-800 p-2 hover:border-indigo-500 transition cursor-default"
                    >
                      <div className="text-[11px] font-medium text-slate-200 truncate">
                        {app.role}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{app.company}</div>
                      <div className="text-[9px] text-slate-500 mt-1">
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </div>
                      {app.notes && (
                        <div className="text-[9px] text-slate-500 mt-0.5 truncate italic">
                          {app.notes}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-1.5">
                        <select
                          value={app.status}
                          onChange={(e) =>
                            handleStatusChange(app.id, e.target.value as ApplicationStatus)
                          }
                          className="rounded bg-slate-900 border border-slate-600 px-1 py-0.5 text-[9px] text-slate-300 flex-1"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setEditingNotes(app.id);
                            setNotesDraft(app.notes);
                          }}
                          className="text-[9px] text-slate-500 hover:text-indigo-400"
                          title="Edit notes"
                        >
                          ✎
                        </button>
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener"
                          className="text-[9px] text-indigo-400 hover:underline"
                          title="Open job"
                        >
                          ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((app) => (
            <div key={app.id} className="rounded border p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{app.role}</div>
                <div className="text-xs text-slate-400 truncate">{app.company}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {new Date(app.appliedAt).toLocaleDateString()} · {app.atsType}
                </div>
                {app.notes && (
                  <div className="text-[10px] text-slate-500 mt-0.5 italic">{app.notes}</div>
                )}
              </div>
              <select
                value={app.status}
                onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status]}`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setEditingNotes(app.id);
                  setNotesDraft(app.notes);
                }}
                className="text-xs text-slate-500 hover:text-indigo-400 shrink-0"
                title="Notes"
              >
                ✎
              </button>
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

      {/* Notes editor modal */}
      {editingNotes && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-4 w-96 border border-slate-600">
            <h4 className="text-sm font-medium text-slate-200 mb-2">Edit Notes</h4>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Interview date, recruiter name, feedback..."
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setEditingNotes(null)}
                className="rounded px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveNotes(editingNotes)}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
