import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// Naukri.com adapter — India's largest job board.
// Naukri's "Quick Apply" uses a modal with custom questions.
// The application forms vary per employer but common patterns exist.

const LABEL_MAP: Record<string, ProfileKey> = {
  'enter keyword': 'freeText',
  'select experience': 'freeText',
  'enter location': 'personal.address.city',
  'current location': 'personal.address.city',
  'preferred location': 'personal.address.city',
  'full name': 'personal.firstName',
  'first name': 'personal.firstName',
  'last name': 'personal.lastName',
  'middle name': 'personal.middleName',
  'email': 'personal.email',
  'e-mail address': 'personal.email',
  'phone': 'personal.phone',
  'mobile': 'personal.phone',
  'contact number': 'personal.phone',
  'current salary': 'salary.expected',
  'expected salary': 'salary.expected',
  'current ctc': 'salary.expected',
  'expected ctc': 'salary.expected',
  'notice period': 'freeText',
  'total experience': 'freeText',
  'years of experience': 'freeText',
  'linkedin': 'links.linkedin',
  'github': 'links.github',
  'portfolio': 'links.portfolio',
  'resume': 'documents.resume',
  'upload resume': 'documents.resume',
  'date of birth': 'freeText',
  'gender': 'eeo.gender',
  'salutation': 'freeText',
  'country code': 'personal.phone',
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function mapByLabel(field: DetectedField): ProfileKey | null {
  const label = norm(field.signals.label || field.signals.ariaLabel || field.signals.placeholder);
  if (!label) return null;

  // Direct match
  for (const [phrase, key] of Object.entries(LABEL_MAP)) {
    if (label === phrase || label.includes(phrase)) return key;
  }

  // Naukri-specific patterns
  if (/keyword.*designation.*compan/i.test(label)) return 'freeText'; // search field, skip
  if (/select.*experience/i.test(label)) return 'freeText';
  if (/full\s*name.*aadhaar/i.test(label)) return 'freeText'; // legal name field
  if (/country.*code.*phone/i.test(label)) return 'personal.phone';
  if (/place.*residence|city/i.test(label)) return 'personal.address.city';

  return null;
}

export const naukri: SiteAdapter = {
  id: 'naukri',

  matches(url) {
    return /(^|\.)naukri\.com$/.test(url.hostname);
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = mapByLabel(f);
      if (key) {
        f.mappedKey = key;
        f.confidence = key === 'freeText' ? 0.5 : 0.93;
        f.source = 'adapter';
        f.reason = `Naukri label pattern`;
      }

      // Don't fill the "Enter keyword/designation/companies" search field with profile data
      const label = norm(f.signals.label || f.signals.placeholder);
      if (label.includes('keyword') || label.includes('designation') || label.includes('companies')) {
        f.mappedKey = 'freeText';
        f.confidence = 0.3; // low confidence = needs review
        f.value = null; // don't auto-fill search boxes
      }
    }
    return fields;
  },

  isMultiStep(doc) {
    return !!doc.querySelector('[class*="chatbot"], [class*="step"], [class*="wizard"]');
  },

  findNextButton(doc) {
    const buttons = Array.from(doc.querySelectorAll<HTMLElement>('button, a[role=button]'));
    return buttons.find((b) => {
      if ((b as HTMLButtonElement).disabled) return false;
      const text = (b.textContent ?? '').trim().toLowerCase();
      return /^(next|continue|proceed|save|submit answer)$/i.test(text) && !/submit.*application/i.test(text);
    }) ?? null;
  },

  findSubmitButton(doc) {
    return doc.querySelector<HTMLElement>('button[type="submit"], [class*="submit-btn"]');
  },
};
