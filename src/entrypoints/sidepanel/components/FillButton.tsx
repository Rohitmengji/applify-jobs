interface Props {
  busy: boolean;
  hasFields: boolean;
  multiStep: boolean;
  onFill: () => void;
  onFillAndNext: () => void;
  onNext: () => void;
  onRun: () => void;
}

export function FillButton({
  busy,
  hasFields,
  multiStep,
  onFill,
  onFillAndNext,
  onNext,
  onRun,
}: Props) {
  return (
    <div className="space-y-1.5 border-t border-slate-700/50 bg-slate-900/80 p-3">
      <div className="flex gap-2">
        <button
          onClick={onFill}
          disabled={busy || !hasFields}
          className="flex-1 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 py-2 text-sm font-bold text-white shadow-sm transition hover:shadow-md hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? '⏳ Filling...' : 'Fill all'}
        </button>
        <button
          onClick={onFillAndNext}
          disabled={busy || !hasFields}
          title="Fill all fields and click Next/Continue"
          className="rounded-xl bg-linear-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          Fill & Next →
        </button>
      </div>

      {multiStep && (
        <div className="flex gap-2">
          <button
            onClick={onNext}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-800 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            Next step
          </button>
          <button
            onClick={onRun}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-800 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            Run to review
          </button>
        </div>
      )}

      <p className="text-center text-[9px] text-slate-500">
        Review on the page and submit it yourself — OneClick Apply never submits for you.
      </p>
    </div>
  );
}
