// Activity audit log — records what the extension did on each page.
// Provides debugging visibility and user confidence that fills happened correctly.
// Stored in chrome.storage.local, capped to prevent unbounded growth.

const KEY = 'activityLog';
const MAX_ENTRIES = 500;

export type ActivityType = 'detect' | 'fill' | 'draft' | 'wizard' | 'error' | 'cache-hit';

export interface ActivityEntry {
  id: string;
  ts: number;
  type: ActivityType;
  url: string; // job page URL (hostname + path, no query params for privacy)
  ats: string; // adapter ID or 'generic'
  details: string; // human-readable description
  fieldsCount?: number; // number of fields involved
}

async function getLog(): Promise<ActivityEntry[]> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as ActivityEntry[] | undefined) ?? [];
}

async function saveLog(entries: ActivityEntry[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: entries });
}

/** Add an activity entry to the log. */
export async function logActivity(
  type: ActivityType,
  url: string,
  ats: string,
  details: string,
  fieldsCount?: number,
): Promise<void> {
  const entries = await getLog();
  // Normalize URL: keep only hostname + pathname for privacy
  let cleanUrl = url;
  try {
    const u = new URL(url);
    cleanUrl = u.hostname + u.pathname;
  } catch {
    /* keep as-is */
  }

  entries.push({
    id: crypto.randomUUID(),
    ts: Date.now(),
    type,
    url: cleanUrl,
    ats,
    details,
    fieldsCount,
  });

  // Cap at MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  await saveLog(entries);
}

/** Get the full activity log (most recent first). */
export async function getActivityLog(): Promise<ActivityEntry[]> {
  const entries = await getLog();
  return entries.slice().reverse();
}

/** Get recent activity (last N entries). */
export async function getRecentActivity(limit = 50): Promise<ActivityEntry[]> {
  const entries = await getLog();
  return entries.slice(-limit).reverse();
}

/** Clear the activity log. */
export async function clearActivityLog(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
