import type { DetectedField } from '@/core/types';
import { FieldRow } from './FieldRow';
import { needsReview } from '../lib/ui';

interface Props {
  fields: DetectedField[];
  filledMap: Record<string, { ok: boolean; error?: string }>;
  onChange: (uid: string, value: string) => void;
  onDraft: (field: DetectedField) => void;
}

export function ReviewTable({ fields, filledMap, onChange, onDraft }: Props) {
  if (fields.length === 0) {
    return (
      <div className="flex-1 p-6 text-center text-xs text-gray-500">
        No fields detected on this page yet.
      </div>
    );
  }

  // Needs-review rows float to the top.
  const sorted = [...fields].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)));
  const reviewCount = fields.filter((f) => needsReview(f)).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {reviewCount > 0 && (
        <div className="bg-amber-100 px-3 py-1 text-[11px] text-amber-800">
          {reviewCount} field{reviewCount > 1 ? 's' : ''} need review
        </div>
      )}
      <ul className="flex-1 overflow-y-auto">
        {sorted.map((f) => (
          <FieldRow
            key={f.uid}
            field={f}
            filled={filledMap[f.uid]?.ok}
            error={filledMap[f.uid]?.error}
            onChange={onChange}
            onDraft={onDraft}
          />
        ))}
      </ul>
    </div>
  );
}
