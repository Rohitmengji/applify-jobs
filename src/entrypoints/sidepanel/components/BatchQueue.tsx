import { useState, useEffect, useCallback } from 'react';
import {
  getBatchQueue,
  addToQueue,
  removeFromQueue,
  clearQueue,
  type BatchItem,
} from '@/core/storage/batchQueue';

interface Props {
  onNavigate: (url: string) => void;
}

export function BatchQueue({ onNavigate }: Props) {
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void getBatchQueue().then(setQueue);
  }, []);

  const handleAdd = useCallback(async () => {
    const urls = input
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('http'));
    if (urls.length === 0) return;
    const updated = await addToQueue(urls);
    setQueue(updated);
    setInput('');
  }, [input]);

  const handleRemove = useCallback(async (id: string) => {
    await removeFromQueue(id);
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const handleClear = useCallback(async () => {
    await clearQueue();
    setQueue([]);
  }, []);

  const queued = queue.filter((q) => q.status === 'queued');
  const filled = queue.filter((q) => q.status === 'filled');

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg border border-dashed border-slate-600 px-3 py-2 text-left text-[11px] text-slate-400 transition hover:border-indigo-500 hover:text-indigo-400"
      >
        <span>{'\u{1F4CB}'}</span>
        <span>Batch queue{queued.length > 0 ? ` (${queued.length} queued)` : ''}</span>
      </button>
    );
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-200">Batch Queue</h3>
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-slate-500 hover:text-slate-300"
        >
          {'\u2715'} Close
        </button>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste job URLs (one per line)\u2026"
        rows={3}
        className="mb-2 w-full resize-none rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
      />
      <div className="mb-3 flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          Add to queue
        </button>
        {queue.length > 0 && (
          <button
            onClick={handleClear}
            className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-400 transition hover:bg-slate-700"
          >
            Clear all
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="text-[10px] text-slate-500">
          No jobs queued. Paste URLs above to batch-fill multiple applications.
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded px-2 py-1 text-[10px] hover:bg-slate-700"
            >
              <span className="shrink-0">
                {item.status === 'queued' && '\u23F3'}
                {item.status === 'in-progress' && '\u25B6\uFE0F'}
                {item.status === 'filled' && '\u2705'}
                {item.status === 'skipped' && '\u23ED\uFE0F'}
                {item.status === 'error' && '\u274C'}
              </span>
              <button
                onClick={() => onNavigate(item.url)}
                className="flex-1 truncate text-left text-indigo-400 hover:underline"
                title={item.url}
              >
                {item.title || new URL(item.url).hostname + new URL(item.url).pathname.slice(0, 30)}
              </button>
              <button
                onClick={() => handleRemove(item.id)}
                className="shrink-0 text-slate-500 hover:text-red-400"
                title="Remove"
              >
                {'\u2715'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {filled.length > 0 && (
        <p className="mt-2 text-[10px] text-green-400">
          {filled.length} filled \u2014 review each before submitting.
        </p>
      )}
    </div>
  );
}
