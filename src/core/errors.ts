// Local-only structured error log — ring buffer of the last N errors stored in
// chrome.storage.session (cleared on browser close, no PII leaks across sessions).
// Surfaced in the options Analytics tab for debugging. Never sent externally.

const KEY = 'errorLog';
const MAX_ENTRIES = 50;

export interface ErrorEntry {
  timestamp: number;
  component: 'fill' | 'detect' | 'llm' | 'adapter' | 'wizard' | 'content' | 'background';
  message: string;
  fieldUid?: string;
  adapterId?: string;
}

export async function getErrorLog(): Promise<ErrorEntry[]> {
  const raw = await chrome.storage.session.get(KEY);
  return (raw[KEY] as ErrorEntry[] | undefined) ?? [];
}

export async function logError(entry: Omit<ErrorEntry, 'timestamp'>): Promise<void> {
  const log = await getErrorLog();
  log.push({ ...entry, timestamp: Date.now() });
  // Ring buffer: keep only the last MAX_ENTRIES
  const trimmed = log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log;
  await chrome.storage.session.set({ [KEY]: trimmed });
}

export async function clearErrorLog(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}
