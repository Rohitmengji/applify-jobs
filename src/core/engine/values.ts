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

// Approximate exchange rates (updated periodically; good enough for salary ranges).
// These are intentionally conservative for applicants (slightly lower conversion).
const RATES_TO_USD: Record<string, number> = {
  USD: 1,
  INR: 0.012,
  GBP: 1.27,
  EUR: 1.09,
  CAD: 0.74,
  AUD: 0.66,
  SGD: 0.74,
  AED: 0.27,
  JPY: 0.0067,
};

// Detect if the field is asking for a specific currency from the label text.
function detectCurrency(text: string): string | null {
  const t = text.toLowerCase();
  if (/\busd\b|\bus\s*dollars?\b|\$/.test(t)) return 'USD';
  if (/\binr\b|\brupees?\b|\u20b9/.test(t)) return 'INR';
  if (/\bgbp\b|\bpounds?\b|\u00a3/.test(t)) return 'GBP';
  if (/\beur\b|\beuros?\b|\u20ac/.test(t)) return 'EUR';
  if (/\bcad\b|\bcanadian\s*dollars?\b/.test(t)) return 'CAD';
  if (/\baud\b|\baustralian\s*dollars?\b/.test(t)) return 'AUD';
  return null;
}

function deriveSalary(profile: Profile, field: DetectedField): string | null {
  const labelText = [field.signals.label, field.signals.nearbyText, field.signals.ariaLabel].join(
    ' ',
  );
  const labelLower = labelText.toLowerCase();

  // Determine if this is asking for CURRENT or EXPECTED salary
  const isCurrent = /current\s*(ctc|salary|compensation|pay)|present\s*(ctc|salary)/.test(
    labelLower,
  );
  const raw = isCurrent
    ? profile.salary?.current || profile.salary?.expected
    : profile.salary?.expected || profile.salary?.current;

  if (!raw) return null;
  const amount = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  if (!amount || isNaN(amount)) return null;

  // Home currency is only known if the user set it — we DON'T assume INR, or a non-INR
  // user's number would be mis-converted. When unknown, never convert (fill the raw amount).
  const homeCurrency = profile.salary?.currency?.toUpperCase();
  const targetCurrency = detectCurrency(labelText);

  // Detect LPA (Lakhs Per Annum) — Indian format, only when the user is explicitly INR.
  if (/\blpa\b|\blakhs?\b/i.test(labelText) && homeCurrency === 'INR') {
    const lpa = Math.round((amount / 100000) * 100) / 100;
    return String(lpa);
  }

  // Convert only when we KNOW the home currency AND the field asks for a different one.
  if (homeCurrency && targetCurrency && homeCurrency !== targetCurrency) {
    const homeRate = RATES_TO_USD[homeCurrency] ?? 1;
    const targetRate = RATES_TO_USD[targetCurrency] ?? 1;
    return String(Math.round((amount * homeRate) / targetRate));
  }
  return String(amount);
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

    case 'salary.expected':
      return deriveSalary(profile, field);

    default: {
      // Single "Full name" input: compose first + last. Triggered by name="name" (Lever) OR
      // autocomplete="name" (the standard full-name token — heuristic maps it to firstName;
      // autocomplete="given-name" carries a different token so it won't wrongly compose).
      if (
        key === 'personal.firstName' &&
        (field.signals.name === 'name' || field.signals.autocomplete === 'name')
      ) {
        const composed = [profile.personal.firstName, profile.personal.lastName]
          .filter(Boolean)
          .map(capitalize)
          .join(' ');
        return composed || null;
      }
      const v = getPath(profile, key);
      if (v == null) return null;
      if (typeof v === 'string') {
        if (!v.length) return null;
        // Auto-capitalize name fields (many forms require "First letter should be capital")
        if (
          key.startsWith('personal.firstName') ||
          key.startsWith('personal.lastName') ||
          key.startsWith('personal.middleName') ||
          key.startsWith('personal.preferredName')
        ) {
          return capitalize(v);
        }
        return v;
      }
      if (typeof v === 'boolean') return mapBool(v, field);
      if (typeof v === 'number') return String(v);
      return null;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
