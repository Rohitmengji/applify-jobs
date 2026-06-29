// Batch apply: queue multiple job URLs, process them one by one.
// The user reviews each application before submitting — never auto-submits.
// Stored in chrome.storage.session (cleared on browser close).

const KEY = 'batchQueue';

export interface BatchItem {
  id: string;
  url: string;
  title?: string;
  status: 'queued' | 'in-progress' | 'filled' | 'skipped' | 'error';
  addedAt: number;
}

export async function getBatchQueue(): Promise<BatchItem[]> {
  const raw = await chrome.storage.session.get(KEY);
  return (raw[KEY] as BatchItem[] | undefined) ?? [];
}

export async function addToQueue(urls: string[]): Promise<BatchItem[]> {
  const queue = await getBatchQueue();
  const newItems: BatchItem[] = urls
    .filter((url) => url.trim() && !queue.some((q) => q.url === url.trim()))
    .map((url) => ({
      id: crypto.randomUUID(),
      url: url.trim(),
      status: 'queued' as const,
      addedAt: Date.now(),
    }));
  const updated = [...queue, ...newItems];
  await chrome.storage.session.set({ [KEY]: updated });
  return updated;
}

export async function updateBatchItem(
  id: string,
  patch: Partial<Pick<BatchItem, 'status' | 'title'>>,
): Promise<void> {
  const queue = await getBatchQueue();
  const item = queue.find((q) => q.id === id);
  if (item) Object.assign(item, patch);
  await chrome.storage.session.set({ [KEY]: queue });
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getBatchQueue();
  await chrome.storage.session.set({ [KEY]: queue.filter((q) => q.id !== id) });
}

export async function clearQueue(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}

export async function getNextQueued(): Promise<BatchItem | null> {
  const queue = await getBatchQueue();
  return queue.find((q) => q.status === 'queued') ?? null;
}
