import type { DetectedField } from '@/core/types';
import type { SavedAnswer } from '@/core/profile.schema';
import { FieldRow } from './FieldRow';
import { needsReview } from '../lib/ui';
import { findTopAnswers } from '@/core/llm/answerBank';

interface Props {
  fields: DetectedField[];
  filledMap: Record<string, { ok: boolean; error?: string }>;
  threshold: number;
  answerBank: SavedAnswer[];
  onChange: (uid: string, value: string) => void;
  onDraft: (field: DetectedField) => void;
}

export function ReviewTable({ fields, filledMap, threshold, answerBank, onChange, onDraft }: Props) {
  if (fields.length === 0) {
    return (
      <div className="flex-1 p-6 text-center text-xs text-gray-500">
        No fields detected on this page yet.
      </div>
    );
  }

  // Needs-review rows float to the top (using the user's configured threshold, #19).
  const sorted = [...fields].sort(
    (a, b) => Number(needsReview(b, threshold)) - Number(needsReview(a, threshold)),
  );
  const reviewCount = fields.filter((f) => needsReview(f, threshold)).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {reviewCount > 0 && (
        <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-700">
          <span className="font-bold">{reviewCount}</span> field{reviewCount > 1 ? 's' : ''} need review
        </div>
      )}
      <ul className="flex-1 overflow-y-auto mt-1">
        {sorted.map((f) => {
          const label = f.signals.label || f.signals.ariaLabel || f.signals.placeholder || '';
          const isFreeText =
            f.mappedKey === 'freeText' ||
            (f.mappedKey === null && (f.kind === 'textarea' || f.kind === 'text'));
          const suggestions = isFreeText && label ? findTopAnswers(label, answerBank) : [];
          return (
            <FieldRow
              key={f.uid}
              field={f}
              threshold={threshold}
              filled={filledMap[f.uid]?.ok}
              error={filledMap[f.uid]?.error}
              suggestions={suggestions}
              onChange={onChange}
              onDraft={onDraft}
            />
          );
        })}
      </ul>
    </div>
  );
}
