import { detectFields } from './detect';
import { matchField } from './heuristic';
import { matchAdapter } from './adapters';
import { getProfile } from '../storage/profileStore';
import { getLearned } from '../storage/learnStore';
import { applyLearned } from './learn';
import { valueForKey } from './values';
import type { DetectedField } from '../types';
import type { Profile } from '../profile.schema';

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

    // Auto-compute special fields that don't map to a profile key but have deterministic values
    if (!f.value && !f.mappedKey) {
      const auto = autoComputeValue(f, profile);
      if (auto) {
        f.value = auto.value;
        f.confidence = auto.confidence;
        f.source = 'heuristic';
        f.reason = auto.reason;
      }
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

// Auto-compute values for fields that have deterministic answers based on context,
// even without a profile key mapping. These are common questions with obvious answers.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function autoComputeValue(
  field: DetectedField,
  profile: Profile,
): { value: string; confidence: number; reason: string } | null {
  const label = norm(
    field.signals.label || field.signals.ariaLabel || field.signals.placeholder || field.signals.nearbyText,
  );
  if (!label) return null;

  // "Today's date" / "Date" / "Current date"
  if (/today.s date|current date|date of application/.test(label) || (label === 'date' && field.kind === 'text')) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return { value: today, confidence: 0.95, reason: 'Auto-computed: today\'s date' };
  }

  // "Full name" / "Your name" (compose from first + last)
  if (/^(full name|your name|candidate name|applicant name|name)$/.test(label)) {
    const name = [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ');
    if (name) return { value: name, confidence: 0.93, reason: 'Composed: firstName + lastName' };
  }

  // "Years of experience" / "Total experience" — calculate from earliest start date
  if (/years? of experience|total experience|work experience/.test(label) && field.kind === 'text') {
    if (profile.experience.length > 0) {
      const earliest = profile.experience
        .map((e) => parseInt(e.startDate.slice(0, 4), 10))
        .filter((y) => !isNaN(y))
        .sort()[0];
      if (earliest) {
        const years = new Date().getFullYear() - earliest;
        return { value: String(years), confidence: 0.88, reason: `Auto-computed: ${years} years from ${earliest}` };
      }
    }
  }

  // "Notice period" — common in Indian applications
  if (/notice period/.test(label) && field.kind === 'text') {
    // Default to "Immediate" if no specific info (user can edit)
    return { value: 'Immediate', confidence: 0.6, reason: 'Default notice period' };
  }

  // "Current location" / "Location"
  if (/^(current location|your location|location|city)$/.test(label) && field.kind === 'text') {
    const city = profile.personal.address.city;
    if (city) return { value: city, confidence: 0.9, reason: 'Profile city' };
  }

  // "Current company" / "Current employer"
  if (/current company|current employer|present company|present employer/.test(label)) {
    const current = profile.experience.find((e) => e.current);
    if (current) return { value: current.company, confidence: 0.92, reason: 'Current experience company' };
  }

  // "Current designation" / "Current role" / "Job title"
  if (/current designation|current role|current title|job title|current position/.test(label)) {
    const current = profile.experience.find((e) => e.current);
    if (current) return { value: current.title, confidence: 0.92, reason: 'Current experience title' };
  }

  return null;
}
