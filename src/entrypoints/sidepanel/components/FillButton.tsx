interface Props {
  busy: boolean;
  hasFields: boolean;
  multiStep: boolean;
  onFill: () => void;
  onNext: () => void;
  onRun: () => void;
}

export function FillButton({ busy, hasFields, multiStep, onFill, onNext, onRun }: Props) {
  return (
    <div className="space-y-2 border-t p-3">
      <button
        onClick={onFill}
        disabled={busy || !hasFields}
        className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? 'Filling…' : 'Fill all'}
      </button>

      {multiStep && (
        <div className="flex gap-2">
          <button
            onClick={onNext}
            disabled={busy}
            className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Next step
          </button>
          <button
            onClick={onRun}
            disabled={busy}
            className="flex-1 rounded-lg border py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Run to review
          </button>
        </div>
      )}

      <p className="text-center text-[11px] text-amber-700">
        Review on the page and submit it yourself — OneClick Apply never submits for you.
      </p>
    </div>
  );
}
