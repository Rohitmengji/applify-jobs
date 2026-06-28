interface Props {
  adapterId: string | null;
  count: number;
  busy: boolean;
  onRedetect: () => void;
}

export function StatusBar({ adapterId, count, busy, onRedetect }: Props) {
  return (
    <header className="flex items-center justify-between gap-2 border-b bg-indigo-600 px-3 py-2 text-white">
      <div className="flex items-center gap-2">
        <span className="font-semibold">OneClick Apply</span>
        {adapterId ? (
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {adapterId}
          </span>
        ) : (
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">generic</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-indigo-100">{count} fields</span>
        <button
          onClick={onRedetect}
          disabled={busy}
          className="rounded bg-white/20 px-2 py-0.5 text-[11px] hover:bg-white/30 disabled:opacity-50"
        >
          {busy ? '…' : 'Re-detect'}
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          title="Edit profile"
          className="rounded bg-white/20 px-2 py-0.5 text-[11px] hover:bg-white/30"
        >
          Profile
        </button>
      </div>
    </header>
  );
}
