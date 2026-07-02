import type { DetectedField } from '../types';
import type { ProfileKey } from '../profile.schema';
import { SYNONYMS, AUTOCOMPLETE_MAP } from './synonyms';

// IMPLEMENTATION.md §11.3 — score each field against the synonym dictionary.
// Signal sources are weighted (autocomplete + label strongest, nearby text weakest).

const WEIGHTS = {
  autocomplete: 1.0,
  label: 0.9,
  ariaLabel: 0.85,
  name: 0.7,
  id: 0.6,
  placeholder: 0.6,
  nearbyText: 0.4,
} as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function matchField(field: DetectedField): {
  key: ProfileKey | null;
  confidence: number;
  reason?: string;
} {
  const s = field.signals;

  // 1) autocomplete is authoritative when present
  if (s.autocomplete && AUTOCOMPLETE_MAP[s.autocomplete]) {
    return {
      key: AUTOCOMPLETE_MAP[s.autocomplete],
      confidence: 0.98,
      reason: `autocomplete="${s.autocomplete}"`,
    };
  }

  const haystacks: [keyof typeof WEIGHTS, string][] = [
    ['label', norm(s.label)],
    ['ariaLabel', norm(s.ariaLabel)],
    ['name', norm(s.name)],
    ['id', norm(s.id)],
    ['placeholder', norm(s.placeholder)],
    ['nearbyText', norm(s.nearbyText)],
  ];

  let best: { key: ProfileKey | null; confidence: number; reason?: string } = {
    key: null,
    confidence: 0,
  };

  for (const [key, syns] of Object.entries(SYNONYMS) as [ProfileKey, string[]][]) {
    let score = 0;
    let matchReason = '';
    for (const [src, text] of haystacks) {
      if (!text) continue;
      for (const syn of syns) {
        let thisScore = 0;
        if (text === syn) {
          thisScore = WEIGHTS[src]; // exact match: full weight
        } else if (text.includes(syn)) {
          const ratio = syn.length / text.length;
          if (ratio > 0.15 || syn.includes(' ')) {
            thisScore = WEIGHTS[src] * 0.9 * Math.min(ratio * 3, 1);
          }
        }
        if (thisScore > score) {
          score = thisScore;
          matchReason = `${src}="${text}" matched "${syn}"`;
        }
      }
    }
    if (score > best.confidence) best = { key, confidence: score, reason: matchReason };
  }
  return best;
}
