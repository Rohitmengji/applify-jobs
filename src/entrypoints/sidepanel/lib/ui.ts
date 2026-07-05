import type { DetectedField, FillSource } from '@/core/types';

// Source badge palette (IMPLEMENTATION.md §17).
export const SOURCE_BADGE: Record<FillSource, { label: string; cls: string }> = {
  adapter: { label: 'adapter', cls: 'bg-green-900/50 text-green-300' },
  heuristic: { label: 'heuristic', cls: 'bg-blue-900/50 text-blue-300' },
  answerBank: { label: 'saved', cls: 'bg-teal-900/50 text-teal-300' },
  llm: { label: 'AI', cls: 'bg-purple-900/50 text-purple-300' },
  learned: { label: 'learned', cls: 'bg-fuchsia-900/50 text-fuchsia-300' },
  manual: { label: 'you', cls: 'bg-amber-900/50 text-amber-300' },
  none: { label: '—', cls: 'bg-slate-700 text-slate-400' },
};

// Confidence overlay (§17 / vision §5): 🟢 95–100 · 🟡 70–94 · 🔴 <70.
export function confidenceColor(c: number): string {
  if (c >= 0.95) return 'bg-conf-high';
  if (c >= 0.7) return 'bg-conf-med';
  return 'bg-conf-low';
}

export function needsReview(f: DetectedField, threshold = 0.6): boolean {
  // User-derived values are trusted: their current edit (manual) or a remembered
  // correction/answer (learned).
  if (f.source === 'manual' || f.source === 'learned') return false;
  // A free-text field mapped but not yet drafted still needs the user's attention (#6).
  if (f.mappedKey === 'freeText' && !f.value) return true;
  return f.mappedKey === null || f.source === 'none' || f.confidence < threshold;
}

export function fieldLabel(f: DetectedField): string {
  const s = f.signals;
  return (
    s.label ||
    s.ariaLabel ||
    s.placeholder ||
    s.nearbyText ||
    humanize(s.name) ||
    humanize(s.id) ||
    '(unlabeled field)'
  );
}

// Turn a name/id token into readable words; returns '' for auto-generated ids (long hex
// runs, "--" separators, pure numbers) so we never show gibberish like "primaryQuestionnaire b493…".
function humanize(raw: string): string {
  if (!raw || /--|[0-9a-f]{8,}|^\d+$/i.test(raw)) return '';
  const words = raw
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length < 2) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
