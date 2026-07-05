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
        className="mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-left text-[11px] text-gray-500 transition hover:border-indigo-300 hover:text-indigo-600"
      >
        <span>📋</span>
        <span>Batch queue{queued.length > 0 ? ` (${queued.length} queued)` : ''}</span>
      </button>
    );
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700">Batch Queue</h3>
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-gray-400 hover:text-gray-600"
        >
          ✕ Close
        </button>
      </div>

      {/* Add URLs */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste job URLs (one per line)…"
        rows={3}
        className="mb-2 w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-[11px] text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none"
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
            className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-500 transition hover:bg-gray-50"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <p className="text-[10px] text-gray-400">
          No jobs queued. Paste URLs above to batch-fill multiple applications.
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded px-2 py-1 text-[10px] hover:bg-gray-50"
            >
              <span className="shrink-0">
                {item.status === 'queued' && '⏳'}
                {item.status === 'in-progress' && '▶️'}
                {item.status === 'filled' && '✅'}
                {item.status === 'skipped' && '⏭️'}
                {item.status === 'error' && '❌'}
              </span>
              <button
                onClick={() => onNavigate(item.url)}
                className="flex-1 truncate text-left text-indigo-600 hover:underline"
                title={item.url}
              >
                {item.title || new URL(item.url).hostname + new URL(item.url).pathname.slice(0, 30)}
              </button>
              <button
                onClick={() => handleRemove(item.id)}
                className="shrink-0 text-gray-300 hover:text-red-500"
                title="Remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {filled.length > 0 && (
        <p className="mt-2 text-[10px] text-green-600">
          {filled.length} filled — review each before submitting.
        </p>
      )}
    </div>
  );
}
