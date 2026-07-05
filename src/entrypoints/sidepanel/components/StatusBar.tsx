interface VariantOption {
  id: string;
  name: string;
}

interface Props {
  adapterId: string | null;
  count: number;
  busy: boolean;
  learnedCount?: number;
  variants?: VariantOption[];
  activeVariantId?: string | null;
  onSwitchVariant?: (id: string) => void;
  onRedetect: () => void;
}

export function StatusBar({
  adapterId,
  count,
  busy,
  learnedCount = 0,
  variants = [],
  activeVariantId,
  onSwitchVariant,
  onRedetect,
}: Props) {
  return (
    <header className="flex items-center justify-between gap-2 bg-linear-to-r from-indigo-600 to-purple-600 px-4 py-3 text-white shadow-md">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-xs font-bold">
          OC
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">OneClick Apply</div>
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-100">
            {adapterId ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5">{adapterId}</span>
            ) : (
              <span className="rounded-full bg-white/15 px-2 py-0.5">generic</span>
            )}
            <span>{count} fields</span>
            {learnedCount > 0 && (
              <span title="Answers OneClick has learned and will auto-fill from now on">
                · 🧠 {learnedCount} learned
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {variants.length > 1 && onSwitchVariant && (
          <select
            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] font-medium text-white backdrop-blur transition hover:bg-white/25"
            value={activeVariantId ?? ''}
            onChange={(e) => onSwitchVariant(e.target.value)}
          >
            <option value="" className="text-gray-800">
              Default
            </option>
            {variants.map((v) => (
              <option key={v.id} value={v.id} className="text-gray-800">
                {v.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={onRedetect}
          disabled={busy}
          className="rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] font-medium backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
        >
          {busy ? <span className="inline-block animate-spin">↻</span> : '↻ Detect'}
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          title="Edit profile"
          className="rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] font-medium backdrop-blur transition hover:bg-white/25"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
