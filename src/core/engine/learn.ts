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

/**
 * Generate multiple fingerprints for a field — increases match probability.
 * The primary fingerprint uses the best label; secondary uses alternative signals.
 */
export function fieldFingerprints(field: DetectedField): string[] {
  const s = field.signals;
  const fps: string[] = [];
  const kind = field.kind;

  // Primary: best label
  const primary = norm(s.label || s.ariaLabel || s.placeholder || s.name || s.id);
  if (primary.length > 1) fps.push(`${kind}|${primary}`);

  // Secondary: other signals that might differ across sites
  if (s.label && s.ariaLabel && norm(s.ariaLabel) !== primary) {
    fps.push(`${kind}|${norm(s.ariaLabel)}`);
  }
  if (s.placeholder && norm(s.placeholder) !== primary && norm(s.placeholder).length > 3) {
    fps.push(`${kind}|${norm(s.placeholder)}`);
  }
  // Nearby text as a last resort (often contains the question on custom forms)
  if (s.nearbyText && norm(s.nearbyText) !== primary && norm(s.nearbyText).length > 5) {
    fps.push(`${kind}|${norm(s.nearbyText).slice(0, 60)}`);
  }

  return fps;
}

function hasLabel(fingerprint: string): boolean {
  return (fingerprint.split('|')[1] ?? '').length > 1;
}

export const GLOBAL_SCOPE = 'global';

// Learned entries are stored under a scope key so the same question can have a
// per-ATS answer (e.g. Greenhouse vs Workday) plus a cross-ATS global fallback.
export function scopeKey(adapterId: string | null | undefined, fingerprint: string): string {
  return `${adapterId || GLOBAL_SCOPE}::${fingerprint}`;
}

// Tokenize for fuzzy matching — extract meaningful words (3+ chars)
function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// Apply learned entries to fields. Prefer an answer learned on THIS ATS, then the
// global one. Learned reflects explicit user feedback, so it overrides heuristic/llm/
// none — but NOT a tuned adapter mapping, nor the user's current-session manual edit.
//
// FUZZY MATCHING: if the exact fingerprint isn't found, search all stored fingerprints
// for a similar one (Jaccard similarity > 0.5 on the label tokens). This handles
// "Are you authorized to work?" matching "Are you legally authorized to work in the US?"
export function applyLearned(
  fields: DetectedField[],
  learned: LearnedMap,
  profile: Profile,
  adapterId: string | null = null,
): DetectedField[] {
  // Build an index of all fingerprint labels for fuzzy matching
  const allKeys = Object.keys(learned);

  for (const f of fields) {
    if (f.source === 'adapter' || f.source === 'manual') continue;

    // Try all fingerprints (primary + secondary) for exact match
    const fps = fieldFingerprints(f);
    let entry: LearnedEntry | undefined;

    for (const fp of fps) {
      entry = (adapterId ? learned[scopeKey(adapterId, fp)] : undefined) ?? learned[scopeKey(null, fp)];
      if (entry) break;
    }

    // 2) Fuzzy match — search all stored fingerprints for a similar label
    if (!entry) {
      const fpLabel = fps[0]?.split('|')[1] ?? '';
      const fpKind = fps[0]?.split('|')[0] ?? '';
      if (fpLabel.length > 3) {
        const fpTokens = tokenize(fpLabel);
        let bestScore = 0;
        let bestEntry: LearnedEntry | undefined;

        for (const key of allKeys) {
          const storedFp = key.split('::')[1] ?? '';
          const storedKind = storedFp.split('|')[0] ?? '';
          const storedLabel = storedFp.split('|')[1] ?? '';
          if (storedKind !== fpKind || storedLabel.length <= 3) continue;

          const score = jaccardSimilarity(fpTokens, tokenize(storedLabel));
          // Boost score for entries with more uses (battle-tested answers)
          const usageBoost = Math.min((learned[key]?.uses ?? 1) * 0.02, 0.1);
          if (score + usageBoost > bestScore && score >= 0.4) {
            bestScore = score + usageBoost;
            bestEntry = learned[key];
          }
        }
        if (bestEntry) entry = bestEntry;
      }
    }

    if (!entry) continue;

    if (entry.key) {
      const v = valueForKey(profile, entry.key, f);
      f.mappedKey = entry.key;
      f.confidence = Math.min(0.97, 0.85 + (entry.uses * 0.02)); // confidence grows with uses
      f.source = 'learned';
      f.reason = `Learned (used ${entry.uses}x)`;
      if (v != null) f.value = v;
    } else if (entry.value) {
      f.value = entry.value;
      f.confidence = Math.min(0.97, 0.85 + (entry.uses * 0.02));
      f.source = 'learned';
      f.reason = `Learned answer (used ${entry.uses}x)`;
    }
  }
  return fields;
}

// Which of the just-filled fields are worth remembering: the user's own edits, accepted
// AI/answer-bank drafts, and custom/unmapped fields — i.e. the ones the deterministic
// layers couldn't resolve on their own. Also learn adapter/heuristic fills so non-adapter
// sites with similar questions benefit from confirmed answers.
export function learnableEntries(
  fields: DetectedField[],
): { fingerprint: string; key: ProfileKey | null; value: string }[] {
  const out: { fingerprint: string; key: ProfileKey | null; value: string }[] = [];
  for (const f of fields) {
    if (f.value == null) continue;
    const key = f.mappedKey && f.mappedKey !== 'freeText' ? f.mappedKey : null;

    // Record ALL fingerprints for this field (primary + secondary) so future matching
    // can find it via any signal — label, ariaLabel, placeholder, or nearbyText.
    const fps = fieldFingerprints(f);
    for (const fingerprint of fps) {
      if (!hasLabel(fingerprint)) continue;
      out.push({ fingerprint, key, value: f.value });
    }
  }
  return out;
}
