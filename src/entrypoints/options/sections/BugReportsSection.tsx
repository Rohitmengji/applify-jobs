import { useEffect, useState } from 'react';
import {
  getBugReports,
  saveBugReport,
  updateReportStatus,
  deleteReport,
  reportToGitHubIssue,
  type BugReport,
} from '@/core/storage/bugReports';

export function BugReportsSection() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    void getBugReports().then(setReports);
  }, []);

  const refresh = async () => setReports(await getBugReports());

  const submitReport = async () => {
    if (!title.trim()) return;
    const ua = navigator.userAgent;
    const os = /Mac/.test(ua)
      ? 'macOS'
      : /Win/.test(ua)
        ? 'Windows'
        : /Linux/.test(ua)
          ? 'Linux'
          : 'Other';
    const browser = /Edg/.test(ua)
      ? 'Edge'
      : /Chrome\/(\d+)/.test(ua)
        ? `Chrome ${RegExp.$1}`
        : 'Unknown';
    const manifest = chrome.runtime.getManifest();
    await saveBugReport({
      title: title.trim(),
      description: description.trim(),
      url: 'chrome-extension://options',
      adapterId: null,
      fieldsDetected: 0,
      fieldsFilled: 0,
      browser,
      os,
      extensionVersion: manifest.version,
    });
    setTitle('');
    setDescription('');
    setShowForm(false);
    await refresh();
  };

  const approve = async (id: string) => {
    await updateReportStatus(id, 'approved');
    await refresh();
  };

  const dismiss = async (id: string) => {
    await updateReportStatus(id, 'dismissed');
    await refresh();
  };

  const remove = async (id: string) => {
    await deleteReport(id);
    await refresh();
  };

  const copyAsIssue = (report: BugReport) => {
    const md = reportToGitHubIssue(report);
    navigator.clipboard.writeText(md);
  };

  const createGitHubIssue = (report: BugReport) => {
    const md = reportToGitHubIssue(report);
    const title = encodeURIComponent(`[Bug] ${report.title}`);
    const body = encodeURIComponent(md);
    const labels = encodeURIComponent('bug');
    const url = `https://github.com/Rohitmengji/applify-jobs/issues/new?title=${title}&body=${body}&labels=${labels}`;
    window.open(url, '_blank');
  };

  const exportAll = () => {
    const approved = reports.filter((r) => r.status === 'approved');
    const blob = new Blob([JSON.stringify(approved, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bug-reports-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pending = reports.filter((r) => r.status === 'pending');
  const approved = reports.filter((r) => r.status === 'approved');
  const dismissed = reports.filter((r) => r.status === 'dismissed');

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Bug Reports</h2>
        <p className="text-sm text-slate-400">
          User-submitted reports. Review, approve to create GitHub issues, or dismiss.
        </p>
      </div>

      {/* Quick submit form */}
      {showForm ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-200">Submit a Bug Report</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What went wrong?"
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Steps to reproduce, which page/section, what you expected..."
            rows={3}
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 resize-none focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={submitReport}
              disabled={!title.trim()}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Submit
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Auto-attaches: browser, OS, extension version
          </p>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg border border-dashed border-slate-600 px-4 py-2 text-xs text-slate-400 transition hover:border-indigo-500 hover:text-indigo-400"
        >
          + Submit a new bug report
        </button>
      )}

      {reports.length === 0 && <p className="text-xs text-slate-500">No bug reports yet.</p>}

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-amber-300 mb-2">
            ⏳ Pending Review ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                onApprove={approve}
                onDismiss={dismiss}
                onDelete={remove}
                onCopy={copyAsIssue}
                onCreateIssue={createGitHubIssue}
              />
            ))}
          </div>
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-green-300">✓ Approved ({approved.length})</h3>
            <button
              onClick={exportAll}
              className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
            >
              Export all as JSON
            </button>
          </div>
          <div className="space-y-2">
            {approved.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                onApprove={approve}
                onDismiss={dismiss}
                onDelete={remove}
                onCopy={copyAsIssue}
                onCreateIssue={createGitHubIssue}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dismissed */}
      {dismissed.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">
            {dismissed.length} dismissed report(s)
          </summary>
          <div className="mt-2 space-y-2">
            {dismissed.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                onApprove={approve}
                onDismiss={dismiss}
                onDelete={remove}
                onCopy={copyAsIssue}
                onCreateIssue={createGitHubIssue}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function ReportCard({
  report,
  onApprove,
  onDismiss,
  onDelete,
  onCopy,
  onCreateIssue,
}: {
  report: BugReport;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (r: BugReport) => void;
  onCreateIssue: (r: BugReport) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-xs font-medium text-slate-200">{report.title}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {report.adapterId ?? 'generic'} · {new Date(report.createdAt).toLocaleDateString()} ·{' '}
            {report.browser} / {report.os}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
            report.status === 'pending'
              ? 'bg-amber-900/50 text-amber-300'
              : report.status === 'approved'
                ? 'bg-green-900/50 text-green-300'
                : 'bg-slate-700 text-slate-400'
          }`}
        >
          {report.status}
        </span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 text-[10px]">
          <p className="text-slate-300">{report.description || 'No description'}</p>
          <div className="text-slate-500">
            <div>URL: {report.url}</div>
            <div>
              Fields: {report.fieldsDetected} detected, {report.fieldsFilled} filled
            </div>
            <div>Version: v{report.extensionVersion}</div>
          </div>
          {report.failedFields && report.failedFields.length > 0 && (
            <div>
              <div className="text-red-400 font-medium">Failed fields:</div>
              {report.failedFields.map((f, i) => (
                <div key={i} className="text-slate-400 ml-2">
                  • {f.label} ({f.mappedKey ?? 'unmapped'}){f.error ? ` — ${f.error}` : ''}
                </div>
              ))}
            </div>
          )}
          {report.screenshotDataUrl && (
            <img
              src={report.screenshotDataUrl}
              alt="Bug screenshot"
              className="mt-1 rounded border border-slate-600 max-h-40 object-contain"
            />
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-slate-400 hover:text-slate-200"
        >
          {expanded ? '▲ Less' : '▼ Details'}
        </button>
        {report.status === 'pending' && (
          <>
            <button
              onClick={() => onApprove(report.id)}
              className="text-[10px] text-green-400 hover:text-green-300"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => onDismiss(report.id)}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              ✗ Dismiss
            </button>
          </>
        )}
        {report.status === 'approved' && (
          <>
            <button
              onClick={() => onCreateIssue(report)}
              className="text-[10px] text-green-400 hover:text-green-300 font-medium"
            >
              🚀 Create GitHub Issue
            </button>
            <button
              onClick={() => onCopy(report)}
              className="text-[10px] text-indigo-400 hover:text-indigo-300"
            >
              📋 Copy
            </button>
          </>
        )}
        <button
          onClick={() => onDelete(report.id)}
          className="text-[10px] text-red-500/60 hover:text-red-400 ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
