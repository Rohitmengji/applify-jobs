import { useState } from 'react';
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
  onCommit?: (field: DetectedField, value: string) => void;
  onDraft: (field: DetectedField) => void;
  onSaveAnswer?: (question: string, answer: string) => void;
}

export function ReviewTable({
  fields,
  filledMap,
  threshold,
  answerBank,
  onChange,
  onCommit,
  onDraft,
  onSaveAnswer,
}: Props) {
  const [filter, setFilter] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-sm font-medium text-gray-700 mb-1">No fields detected</div>
        <div className="text-xs text-gray-400 max-w-50">
          Navigate to a job application page, then click Detect to find form fields.
        </div>
      </div>
    );
  }

  // Needs-review rows float to the top (using the user's configured threshold, #19).
  const sorted = [...fields].sort(
    (a, b) => Number(needsReview(b, threshold)) - Number(needsReview(a, threshold)),
  );
  const reviewCount = fields.filter((f) => needsReview(f, threshold)).length;

  const displayed = sorted.filter((f) => {
    if (onlyReview && !needsReview(f, threshold)) return false;
    if (filter) {
      const label = (
        f.signals.label ||
        f.signals.ariaLabel ||
        f.signals.placeholder ||
        ''
      ).toLowerCase();
      if (!label.includes(filter.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="mx-3 mt-2 flex items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter fields…"
          className="flex-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none"
        />
        {reviewCount > 0 && (
          <button
            onClick={() => setOnlyReview(!onlyReview)}
            className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium transition ${
              onlyReview
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-amber-50'
            }`}
          >
            {onlyReview ? `⚠ ${reviewCount}` : `⚠ ${reviewCount}`}
          </button>
        )}
      </div>
      {reviewCount > 0 && !onlyReview && (
        <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-700">
          <span className="font-bold">{reviewCount}</span> field{reviewCount > 1 ? 's' : ''} need
          review
        </div>
      )}
      <ul className="flex-1 overflow-y-auto mt-1">
        {displayed.map((f) => {
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
              onCommit={onCommit}
              onDraft={onDraft}
              onSaveAnswer={onSaveAnswer}
            />
          );
        })}
      </ul>
    </div>
  );
}
