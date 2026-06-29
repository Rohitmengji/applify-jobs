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

function mapField(f: DetectedField): ProfileKey | null {
  // Check name attribute
  const name = f.signals.name.toLowerCase();
  for (const [pattern, key] of Object.entries(NAME_MAP)) {
    if (name === pattern || name.includes(pattern)) return key;
  }
  // Check id attribute
  const id = f.signals.id.toLowerCase();
  for (const [pattern, key] of Object.entries(ID_MAP)) {
    if (id === pattern || id.includes(pattern)) return key;
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
    const buttons = Array.from(doc.querySelectorAll<HTMLElement>(
      'button, input[type=submit], a[role=button]'
    ));
    return buttons.find((b) => {
      if ((b as HTMLButtonElement).disabled) return false;
      const text = (b.textContent ?? '').trim().toLowerCase();
      return /^(next|continue|save|proceed)$/i.test(text) && !/submit/i.test(text);
    }) ?? null;
  },

  findSubmitButton(doc) {
    return doc.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"]'
    );
  },
};
