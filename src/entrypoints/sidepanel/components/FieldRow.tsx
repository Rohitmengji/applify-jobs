import { useRef } from 'react';
import type { DetectedField } from '@/core/types';
import type { SavedAnswer } from '@/core/profile.schema';
import { SOURCE_BADGE, confidenceColor, needsReview, fieldLabel } from '../lib/ui';

interface Props {
  field: DetectedField;
  threshold?: number;
  filled?: boolean;
  error?: string;
  suggestions?: SavedAnswer[];
  onChange: (uid: string, value: string) => void;
  /** Fires when the user COMMITS an edit (blur after typing, or picking a choice) — used to
   *  auto-save the answer for future reuse. */
  onCommit?: (field: DetectedField, value: string) => void;
  onDraft: (field: DetectedField) => void;
  onSaveAnswer?: (question: string, answer: string) => void;
}

const TRUTHY = ['yes', 'true', '1', 'on'];

export function FieldRow({
  field,
  threshold,
  filled,
  error,
  suggestions,
  onChange,
  onCommit,
  onDraft,
  onSaveAnswer,
}: Props) {
  const s = field.signals;
  const badge = SOURCE_BADGE[field.source];
  const review = needsReview(field, threshold);
  // Free-text: explicitly mapped to freeText, OR an unmapped textarea/text field that
  // an open question would land in. Either way, offer "Draft with AI" (§17/§20, #13).
  const isFreeText =
    field.mappedKey === 'freeText' ||
    field.mappedKey === 'documents.coverLetter' ||
    (field.mappedKey === null && (field.kind === 'textarea' || field.kind === 'text'));

  // Detect cover letter fields specifically for the prominent "Generate from JD" button
  const label = (s.label || s.ariaLabel || s.placeholder || '').toLowerCase();
  const isCoverLetter =
    field.mappedKey === 'documents.coverLetter' ||
    /cover letter|covering letter|motivation letter|why .* (this|the) (role|position|company|job)|tell us why|why.*join/i.test(
      label,
    );

  return (
    <li
      className={`flex flex-col gap-1.5 border-b border-slate-700/50 px-3 py-2.5 transition-colors ${review ? 'bg-amber-900/20' : 'hover:bg-slate-800/30'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-200" title={fieldLabel(field)}>
          {fieldLabel(field)}
          {s.required && <span className="ml-0.5 text-red-400">*</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {filled && (
            <span title="filled" className="text-xs text-green-500">
              ✓
            </span>
          )}
          <span
            className={`h-2 w-2 rounded-full ${confidenceColor(field.confidence)} ring-1 ring-white`}
            title={`${Math.round(field.confidence * 100)}% confident`}
          />
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${badge.cls} cursor-help`}
            title={field.reason ?? `Source: ${field.source}`}
          >
            {badge.label}
          </span>
        </span>
      </div>

      <ValueEditor field={field} onChange={onChange} onCommit={onCommit} />

      {isFreeText && isCoverLetter && !field.value && (
        <button
          onClick={() => onDraft(field)}
          className="mt-1 w-full rounded-lg bg-linear-to-r from-purple-900/40 to-pink-900/40 border border-purple-600/50 px-3 py-2 text-[11px] font-medium text-purple-300 transition hover:border-purple-500 hover:shadow-sm"
        >
          ✨ Generate Cover Letter from Job Description
        </button>
      )}
      {isFreeText && !isCoverLetter && (
        <button
          onClick={() => onDraft(field)}
          className="self-start text-[11px] text-purple-400 hover:underline"
        >
          ✨ Draft with AI
        </button>
      )}
      {suggestions && suggestions.length > 0 && !field.value && (
        <div className="mt-1 space-y-1">
          <span className="text-[10px] text-slate-500">Saved answers:</span>
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange(field.uid, s.answer)}
              className="block w-full truncate rounded bg-slate-800 px-2 py-1 text-left text-[11px] text-slate-300 hover:bg-indigo-900/40"
              title={s.answer}
            >
              {s.answer.length > 80 ? s.answer.slice(0, 80) + '…' : s.answer}
            </button>
          ))}
        </div>
      )}
      {/* Save to Training — prominent prompt for new questions the user answered */}
      {field.value &&
        (field.source === 'llm' || field.source === 'manual') &&
        isFreeText &&
        onSaveAnswer && (
          <button
            onClick={() =>
              onSaveAnswer(
                field.signals.label || field.signals.ariaLabel || field.signals.placeholder || '',
                field.value!,
              )
            }
            className="self-start flex items-center gap-1 rounded-md bg-teal-900/30 border border-teal-700/50 px-2 py-1 text-[10px] font-medium text-teal-300 transition hover:bg-teal-900/50"
          >
            <span>🧠</span> Save to Training — auto-fills next time
          </button>
        )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </li>
  );
}

function ValueEditor({
  field,
  onChange,
  onCommit,
}: {
  field: DetectedField;
  onChange: (uid: string, value: string) => void;
  onCommit?: (field: DetectedField, value: string) => void;
}) {
  const v = field.value ?? '';
  const set = (val: string) => onChange(field.uid, val);
  // Auto-save a discrete choice immediately; auto-save typed text only when it actually
  // changed during this focus (so tabbing through an auto-filled field doesn't re-learn it).
  const commit = (val: string) => onCommit?.(field, val);
  const focusValue = useRef(v);

  if (field.kind === 'file') {
    return (
      <div className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-400">
        {v || 'Résumé will be attached on Fill'}
      </div>
    );
  }

  if (field.kind === 'checkbox') {
    const checked = TRUTHY.includes(v.toLowerCase());
    return (
      <label className="flex items-center gap-2 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            const val = e.target.checked ? 'yes' : 'no';
            set(val);
            commit(val);
          }}
        />
        {checked ? 'Yes' : 'No'}
      </label>
    );
  }

  const opts = field.signals.options;
  const isChoice =
    field.kind === 'select-native' ||
    field.kind === 'select-custom' ||
    field.kind === 'radio-group';
  if (isChoice && opts && opts.length > 0) {
    // If the resolved value isn't an exact option (common: fuzzy native-select fills),
    // surface it as a selectable entry instead of silently showing blank (#11).
    const unmatched = v !== '' && !opts.includes(v);
    return (
      <select
        value={unmatched ? v : opts.includes(v) ? v : ''}
        onChange={(e) => {
          set(e.target.value);
          commit(e.target.value);
        }}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
      >
        <option value="">— select —</option>
        {unmatched && <option value={v}>{v} (no exact match)</option>}
        {opts.map((o, i) => (
          <option key={`${o}-${i}`} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <textarea
        value={v}
        onChange={(e) => set(e.target.value)}
        onFocus={() => (focusValue.current = v)}
        onBlur={() => {
          if (v !== focusValue.current) commit(v);
        }}
        rows={3}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
      />
    );
  }

  return (
    <input
      type="text"
      value={v}
      onChange={(e) => set(e.target.value)}
      onFocus={() => (focusValue.current = v)}
      onBlur={() => {
        if (v !== focusValue.current) commit(v);
      }}
      className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
    />
  );
}
