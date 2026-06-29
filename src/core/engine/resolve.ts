import { detectFields } from './detect';
import { matchField } from './heuristic';
import { matchAdapter } from './adapters';
import { getProfile } from '../storage/profileStore';
import { getLearned } from '../storage/learnStore';
import { applyLearned } from './learn';
import { valueForKey } from './values';
import type { DetectedField } from '../types';

// IMPLEMENTATION.md §11.5 — the orchestrator (runs in the content script).
// Deterministic-first: adapter detection → heuristic mapping → value resolution.
// Low-confidence + free-text fields are returned unresolved; the side panel asks
// the background for LLM mapping/drafting, then sends ResolvedFill[] via FILL.
export async function resolveAll(): Promise<{
  fields: DetectedField[];
  adapterId: string | null;
  multiStep: boolean;
}> {
  const profile = await getProfile();
  const learned = await getLearned();
  const adapter = matchAdapter(new URL(location.href), document);
  const threshold = profile.settings.confidenceThreshold ?? 0.6;

  // 1) detection: adapter-specific if available, else generic
  const fields = adapter?.detectFields ? adapter.detectFields(document) : detectFields();

  // 2) mapping + value resolution
  for (const f of fields) {
    // adapter may have pre-mapped during detection; respect a confident mapping
    if (!f.mappedKey || f.confidence < threshold) {
      const m = matchField(f);
      // Only adopt a heuristic result when it actually mapped to a key — a null match
      // must leave the field as source:'none' so it's flagged "needs review", not
      // mislabeled as a (failed) heuristic mapping.
      if (m.key && m.confidence >= (f.confidence ?? 0)) {
        f.mappedKey = m.key;
        f.confidence = m.confidence;
        f.source = 'heuristic';
        f.reason = m.reason;
      }
    } else {
      f.source = 'adapter';
      f.reason = 'Matched by site-specific adapter';
    }
    if (f.mappedKey) {
      const v = valueForKey(profile, f.mappedKey, f);
      if (v != null) f.value = v;
    }
  }

  // 3) learned overrides: the user's remembered corrections/answers fill the gaps the
  // heuristic missed (and override wrong heuristic mappings), without touching adapters.
  // Prefer answers learned on this ATS, then the global fallback.
  applyLearned(fields, learned, profile, adapter?.id ?? null);

  return {
    fields,
    adapterId: adapter?.id ?? null,
    multiStep: adapter?.isMultiStep?.(document) ?? false,
  };
}
