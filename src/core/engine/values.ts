import type { Profile, ProfileKey } from '../profile.schema';
import type { DetectedField } from '../types';
import { countryInText, sameCountry } from './countries';

// IMPLEMENTATION.md §11.5 / §25 — resolve the string value to fill for a mapped key.
// Returns null when the value should be supplied another way (files via FILL_FILE,
// experience/education per-row, free-text via answer-bank/LLM) or is empty.

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => {
    if (o != null && typeof o === 'object') return (o as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

// Checkboxes want a truthy token; radios/selects/text want human "Yes"/"No" label text.
function mapBool(b: boolean, field: DetectedField): string {
  if (field.kind === 'checkbox') return b ? 'yes' : 'no';
  return b ? 'Yes' : 'No';
}

// Context-aware work authorization. When the question names a country (e.g. "authorized
// to work in the United States?"), derive the answer from the countries you're authorized
// in (defaulting to your home country). Otherwise fall back to the static toggle.
function deriveWorkAuth(
  profile: Profile,
  field: DetectedField,
  kind: 'authorized' | 'sponsorship' | 'visa',
): string {
  const text = [field.signals.label, field.signals.nearbyText, field.signals.ariaLabel].join(' ');
  const jobCountry = countryInText(text);
  let value: boolean;
  if (jobCountry) {
    const allowed = profile.workAuth.authorizedCountries.length
      ? profile.workAuth.authorizedCountries
      : [profile.personal.address.country];
    const authorized = allowed.some((c) => sameCountry(c, jobCountry));
    // Sponsorship / visa are needed precisely when you're NOT authorized there.
    value = kind === 'authorized' ? authorized : !authorized;
  } else {
    value =
      kind === 'authorized'
        ? profile.workAuth.authorizedToWork
        : kind === 'sponsorship'
          ? profile.workAuth.needsSponsorship
          : profile.workAuth.requiresVisa;
  }
  return mapBool(value, field);
}

export function valueForKey(
  profile: Profile,
  key: ProfileKey,
  field: DetectedField,
): string | null {
  switch (key) {
    case 'skills':
      return profile.skills.length ? profile.skills.join(', ') : null;

    // Files are attached via FILL_FILE, not as a string value.
    case 'documents.resume':
    case 'documents.coverLetter':
      return null;

    // Repeatable rows are filled by a dedicated filler, not a single value.
    case 'experience':
    case 'education':
      return null;

    // Open questions go to the answer bank / LLM, not a profile path.
    case 'freeText':
      return null;

    case 'workAuth.authorizedToWork':
      return deriveWorkAuth(profile, field, 'authorized');
    case 'workAuth.needsSponsorship':
      return deriveWorkAuth(profile, field, 'sponsorship');
    case 'workAuth.requiresVisa':
      return deriveWorkAuth(profile, field, 'visa');

    default: {
      // Lever-style single "Full name" input (name="name"): compose first + last.
      if (key === 'personal.firstName' && field.signals.name === 'name') {
        const composed = [profile.personal.firstName, profile.personal.lastName]
          .filter(Boolean)
          .join(' ');
        return composed || null;
      }
      const v = getPath(profile, key);
      if (v == null) return null;
      if (typeof v === 'string') return v.length ? v : null;
      if (typeof v === 'boolean') return mapBool(v, field);
      if (typeof v === 'number') return String(v);
      return null;
    }
  }
}
