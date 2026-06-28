import type { DetectedField } from '../types';
import type { Profile, ProfileKey } from '../profile.schema';
import { valueForKey } from './values';

// IMPLEMENTATION.md "Learning Engine" / "Knowledge Graph" — remember how the user
// resolved a field (by a stable, site-independent fingerprint) so the next form with
// that field auto-fills without re-asking. This module is PURE (no storage/DOM) so it's
// fully unit-tested; persistence lives in storage/learnStore.ts.

export interface LearnedEntry {
  /** Profile key, when the field maps to a structured profile value (re-resolved each fill). */
  key: ProfileKey | null;
  /** Literal answer, for custom/free-text fields with no profile key. */
  value: string;
  uses: number;
  updatedAt: number;
}
export type LearnedMap = Record<string, LearnedEntry>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// A field's identity, independent of volatile ids — `kind | best-label`. Site-independent
// on purpose: a "Visa status" question learned on one ATS fills on the next.
export function fieldFingerprint(field: DetectedField): string {
  const s = field.signals;
  const label = norm(s.label || s.ariaLabel || s.placeholder || s.name || s.id);
  return `${field.kind}|${label}`;
}

function hasLabel(fingerprint: string): boolean {
  return (fingerprint.split('|')[1] ?? '').length > 1;
}

// Apply learned entries to fields. Learned reflects explicit user feedback, so it
// overrides heuristic/llm/none — but NOT a tuned adapter mapping, nor the user's
// current-session manual edit.
export function applyLearned(
  fields: DetectedField[],
  learned: LearnedMap,
  profile: Profile,
): DetectedField[] {
  for (const f of fields) {
    if (f.source === 'adapter' || f.source === 'manual') continue;
    const entry = learned[fieldFingerprint(f)];
    if (!entry) continue;
    if (entry.key) {
      const v = valueForKey(profile, entry.key, f);
      f.mappedKey = entry.key;
      f.confidence = 0.97;
      f.source = 'learned';
      if (v != null) f.value = v;
    } else if (entry.value) {
      f.value = entry.value;
      f.confidence = 0.97;
      f.source = 'learned';
    }
  }
  return fields;
}

// Which of the just-filled fields are worth remembering: the user's own edits, accepted
// AI/answer-bank drafts, and custom/unmapped fields — i.e. the ones the deterministic
// layers couldn't resolve on their own. (Adapter/heuristic hits don't need learning.)
export function learnableEntries(
  fields: DetectedField[],
): { fingerprint: string; key: ProfileKey | null; value: string }[] {
  const out: { fingerprint: string; key: ProfileKey | null; value: string }[] = [];
  for (const f of fields) {
    if (f.value == null) continue;
    const worth =
      f.source === 'manual' ||
      f.source === 'llm' ||
      f.source === 'answerBank' ||
      f.mappedKey === null ||
      f.mappedKey === 'freeText';
    if (!worth) continue;
    const fingerprint = fieldFingerprint(f);
    if (!hasLabel(fingerprint)) continue; // need a real label to be reusable
    const key = f.mappedKey && f.mappedKey !== 'freeText' ? f.mappedKey : null;
    out.push({ fingerprint, key, value: f.value });
  }
  return out;
}
