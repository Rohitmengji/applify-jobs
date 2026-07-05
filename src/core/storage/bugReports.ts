// Bug report storage — stores user-submitted reports locally in chrome.storage.local.
// Reports include device info, screenshots, and ATS context. The developer reviews them
// in the options "Bug Reports" tab and can export as GitHub issues.

const KEY = 'bugReports';

export interface BugReport {
  id: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'dismissed';
  // User-provided
  title: string;
  description: string;
  screenshotDataUrl?: string; // base64 PNG
  // Auto-collected context
  url: string;
  adapterId: string | null;
  fieldsDetected: number;
  fieldsFilled: number;
  // Environment
  browser: string;
  os: string;
  extensionVersion: string;
  // Optional: field-level detail for debugging
  failedFields?: { label: string; mappedKey: string | null; error?: string }[];
}

export async function getBugReports(): Promise<BugReport[]> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as BugReport[] | undefined) ?? [];
}

export async function saveBugReport(
  report: Omit<BugReport, 'id' | 'createdAt' | 'status'>,
): Promise<BugReport> {
  const reports = await getBugReports();
  const entry: BugReport = {
    ...report,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'pending',
  };
  reports.unshift(entry); // newest first
  // Cap at 50 reports to avoid bloating storage
  const capped = reports.slice(0, 50);
  await chrome.storage.local.set({ [KEY]: capped });
  return entry;
}

export async function updateReportStatus(id: string, status: BugReport['status']): Promise<void> {
  const reports = await getBugReports();
  const report = reports.find((r) => r.id === id);
  if (report) report.status = status;
  await chrome.storage.local.set({ [KEY]: reports });
}

export async function deleteReport(id: string): Promise<void> {
  const reports = await getBugReports();
  await chrome.storage.local.set({ [KEY]: reports.filter((r) => r.id !== id) });
}

/**
 * Export an approved report as a GitHub issue markdown body.
 * Ready to paste into `gh issue create` or the GitHub web UI.
 */
export function reportToGitHubIssue(report: BugReport): string {
  const lines = [
    `## Bug Report: ${report.title}`,
    '',
    `**URL:** ${report.url}`,
    `**ATS:** ${report.adapterId ?? 'generic/internal'}`,
    `**Fields:** ${report.fieldsDetected} detected, ${report.fieldsFilled} filled`,
    '',
    '### Description',
    report.description,
    '',
    '### Environment',
    `- **Browser:** ${report.browser}`,
    `- **OS:** ${report.os}`,
    `- **Extension:** v${report.extensionVersion}`,
    `- **Date:** ${new Date(report.createdAt).toISOString().slice(0, 10)}`,
  ];
  if (report.failedFields?.length) {
    lines.push('', '### Failed Fields');
    for (const f of report.failedFields) {
      lines.push(
        `- \`${f.label}\` (mapped: ${f.mappedKey ?? 'none'})${f.error ? ` — ${f.error}` : ''}`,
      );
    }
  }
  if (report.screenshotDataUrl) {
    lines.push('', '### Screenshot', '*(attached as image)*');
  }
  return lines.join('\n');
}
