import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// Jobvite adapter. Jobvite career sites use stable field names and IDs.
// Matches *.jobvite.com and embedded Jobvite forms.

const NAME_MAP: Record<string, ProfileKey> = {
  firstName: 'personal.firstName',
  'first-name': 'personal.firstName',
  lastName: 'personal.lastName',
  'last-name': 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  'phone-number': 'personal.phone',
  address: 'personal.address.line1',
  city: 'personal.address.city',
  state: 'personal.address.state',
  zip: 'personal.address.zip',
  country: 'personal.address.country',
  linkedin: 'links.linkedin',
  resume: 'documents.resume',
};

const ID_MAP: Record<string, ProfileKey> = {
  jv_first_name: 'personal.firstName',
  jv_last_name: 'personal.lastName',
  jv_email: 'personal.email',
  jv_phone: 'personal.phone',
  jv_address: 'personal.address.line1',
  jv_city: 'personal.address.city',
  jv_state: 'personal.address.state',
  jv_zip: 'personal.address.zip',
  jv_country: 'personal.address.country',
  jv_linkedin: 'links.linkedin',
};

// Split an attribute value into word tokens (camelCase + separators), e.g. "jv_first_name" or
// "firstName" → ["jv","first","name"]. Used for whole-token matching so a short pattern like
// "city" can't match inside an unrelated word like "ethni-city" / "ethnicity".
function tokens(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function attrMatches(attr: string, pattern: string): boolean {
  const collapsed = attr.replace(/[^a-z0-9]/g, '');
  const pcol = pattern.replace(/[^a-z0-9]/g, '');
  if (collapsed === pcol) return true;
  // Multi-word patterns (first-name, phone-number): allow a contiguous collapsed match.
  if (/[-_]/.test(pattern)) return collapsed.includes(pcol);
  // Single-word patterns: a token that EQUALS or STARTS WITH the pattern. Prefix admits glued
  // names like "zipcode"→zip, "address1"→address, "emailaddress"→email, while still rejecting
  // a suffix collision like "city" inside "ethnicity".
  return tokens(attr).some((t) => t === pattern || t.startsWith(pattern));
}

function mapField(f: DetectedField): ProfileKey | null {
  const name = f.signals.name.toLowerCase();
  for (const [pattern, key] of Object.entries(NAME_MAP)) {
    if (attrMatches(name, pattern)) return key;
  }
  const id = f.signals.id.toLowerCase();
  for (const [pattern, key] of Object.entries(ID_MAP)) {
    if (attrMatches(id, pattern)) return key;
  }
  return null;
}

export const jobvite: SiteAdapter = {
  id: 'jobvite',

  matches(url, doc) {
    return (
      /(^|\.)jobvite\.com$/.test(url.hostname) ||
      /(^|\.)jobs\.jobvite\.com$/.test(url.hostname) ||
      !!doc.querySelector('[class*="jobvite"], [id*="jobvite"], form[action*="jobvite"]')
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = mapField(f);
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.95;
        f.source = 'adapter';
      }
    }
    return fields;
  },

  isMultiStep(doc) {
    // Some Jobvite applications are multi-step
    return !!doc.querySelector('[class*="step"], [class*="wizard"], [data-step]');
  },

  findNextButton(doc) {
    const buttons = Array.from(
      doc.querySelectorAll<HTMLElement>('button, input[type=submit], a[role=button]'),
    );
    return (
      buttons.find((b) => {
        if ((b as HTMLButtonElement).disabled) return false;
        const text = (b.textContent ?? '').trim().toLowerCase();
        return /^(next|continue|save|proceed)$/i.test(text) && !/submit/i.test(text);
      }) ?? null
    );
  },

  findSubmitButton(doc) {
    return doc.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]');
  },
};
