import type { DetectedField } from '@/core/types';
import { SOURCE_BADGE, confidenceColor, needsReview, fieldLabel } from '../lib/ui';

interface Props {
  field: DetectedField;
  threshold?: number;
  filled?: boolean;
  error?: string;
  onChange: (uid: string, value: string) => void;
  onDraft: (field: DetectedField) => void;
}

const TRUTHY = ['yes', 'true', '1', 'on'];

export function FieldRow({ field, threshold, filled, error, onChange, onDraft }: Props) {
  const s = field.signals;
  const badge = SOURCE_BADGE[field.source];
  const review = needsReview(field, threshold);
  // Free-text: explicitly mapped to freeText, OR an unmapped textarea/text field that
  // an open question would land in. Either way, offer "Draft with AI" (§17/§20, #13).
  const isFreeText =
    field.mappedKey === 'freeText' ||
    (field.mappedKey === null && (field.kind === 'textarea' || field.kind === 'text'));

  return (
    <li className={`flex flex-col gap-1 border-b px-3 py-2 ${review ? 'bg-amber-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-gray-700" title={fieldLabel(field)}>
          {fieldLabel(field)}
          {s.required && <span className="text-red-500"> *</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {filled && (
            <span title="filled" className="text-green-600">
              ✓
            </span>
          )}
          <span
            className={`h-2 w-2 rounded-full ${confidenceColor(field.confidence)}`}
            title={`${Math.round(field.confidence * 100)}% confident`}
          />
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        </span>
      </div>

      <ValueEditor field={field} onChange={onChange} />

      {isFreeText && (
        <button
          onClick={() => onDraft(field)}
          className="self-start text-[11px] text-purple-700 hover:underline"
        >
          ✨ Draft with AI
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </li>
  );
}

function ValueEditor({
  field,
  onChange,
}: {
  field: DetectedField;
  onChange: (uid: string, value: string) => void;
}) {
  const v = field.value ?? '';
  const set = (val: string) => onChange(field.uid, val);

  if (field.kind === 'file') {
    return (
      <div className="rounded border bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
        {v || 'Résumé will be attached on Fill'}
      </div>
    );
  }

  if (field.kind === 'checkbox') {
    const checked = TRUTHY.includes(v.toLowerCase());
    return (
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => set(e.target.checked ? 'yes' : 'no')}
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
        onChange={(e) => set(e.target.value)}
        className="w-full rounded border px-2 py-1 text-xs"
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
        rows={3}
        className="w-full rounded border px-2 py-1 text-xs"
      />
    );
  }

  return (
    <input
      type="text"
      value={v}
      onChange={(e) => set(e.target.value)}
      className="w-full rounded border px-2 py-1 text-xs"
    />
  );
}
