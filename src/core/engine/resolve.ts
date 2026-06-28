import { detectFields } from './detect';
import { matchField } from './heuristic';
import { matchAdapter } from './adapters';
import { getProfile } from '../storage/profileStore';
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
  const adapter = matchAdapter(new URL(location.href), document);
  const threshold = profile.settings.confidenceThreshold ?? 0.6;

  // 1) detection: adapter-specific if available, else generic
  const fields = adapter?.detectFields ? adapter.detectFields(document) : detectFields();

  // 2) mapping + value resolution
  for (const f of fields) {
    // adapter may have pre-mapped during detection; respect a confident mapping
    if (!f.mappedKey || f.confidence < threshold) {
      const m = matchField(f);
      if (m.confidence >= (f.confidence ?? 0)) {
        f.mappedKey = m.key;
        f.confidence = m.confidence;
        f.source = 'heuristic';
      }
    } else {
      f.source = 'adapter';
    }
    if (f.mappedKey) {
      const v = valueForKey(profile, f.mappedKey, f);
      if (v != null) f.value = v;
    }
  }

  return {
    fields,
    adapterId: adapter?.id ?? null,
    multiStep: adapter?.isMultiStep?.(document) ?? false,
  };
}
