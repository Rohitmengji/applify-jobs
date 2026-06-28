import type { DetectedField, FillSource } from '@/core/types';

// Source badge palette (IMPLEMENTATION.md §17).
export const SOURCE_BADGE: Record<FillSource, { label: string; cls: string }> = {
  adapter: { label: 'adapter', cls: 'bg-green-100 text-green-800' },
  heuristic: { label: 'heuristic', cls: 'bg-blue-100 text-blue-800' },
  answerBank: { label: 'saved', cls: 'bg-teal-100 text-teal-800' },
  llm: { label: 'AI', cls: 'bg-purple-100 text-purple-800' },
  manual: { label: 'you', cls: 'bg-amber-100 text-amber-800' },
  none: { label: '—', cls: 'bg-gray-100 text-gray-500' },
};

// Confidence overlay (§17 / vision §5): 🟢 95–100 · 🟡 70–94 · 🔴 <70.
export function confidenceColor(c: number): string {
  if (c >= 0.95) return 'bg-conf-high';
  if (c >= 0.7) return 'bg-conf-med';
  return 'bg-conf-low';
}

export function needsReview(f: DetectedField, threshold = 0.6): boolean {
  return f.mappedKey === null || f.source === 'none' || f.confidence < threshold;
}

export function fieldLabel(f: DetectedField): string {
  const s = f.signals;
  return s.label || s.ariaLabel || s.placeholder || s.name || s.id || '(unlabeled field)';
}
