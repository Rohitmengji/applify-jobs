interface Props {
  busy: boolean;
  hasFields: boolean;
  multiStep: boolean;
  onFill: () => void;
  onFillAndNext: () => void;
  onNext: () => void;
  onRun: () => void;
}

export function FillButton({ busy, hasFields, multiStep, onFill, onFillAndNext, onNext, onRun }: Props) {
  return (
    <div className="space-y-2 border-t border-gray-100 bg-gray-50/50 p-3">
      <div className="flex gap-2">
        <button
          onClick={onFill}
          disabled={busy || !hasFields}
          className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Filling...
            </span>
          ) : (
            'Fill all'
          )}
        </button>
        <button
          onClick={onFillAndNext}
          disabled={busy || !hasFields}
          title="Fill all fields and click Next/Continue"
          className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          Fill & Next →
        </button>
      </div>

      {multiStep && (
        <div className="flex gap-2">
          <button
            onClick={onNext}
            disabled={busy}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
          >
            Next step
          </button>
          <button
            onClick={onRun}
            disabled={busy}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
          >
            Run to review
          </button>
        </div>
      )}

      <p className="text-center text-[10px] text-gray-400">
        Review on the page and submit it yourself — OneClick Apply never submits for you.
      </p>
    </div>
  );
}
