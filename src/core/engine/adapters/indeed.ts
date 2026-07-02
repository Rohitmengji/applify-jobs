import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// Indeed Smart Apply (smartapply.indeed.com) adapter.
// Indeed's application flow is a multi-step wizard with standard HTML inputs.
// Fields use `name`, `id`, and `aria-label` attributes.

const LABEL_MAP: Record<string, ProfileKey> = {
  'first name': 'personal.firstName',
  'last name': 'personal.lastName',
  'email address': 'personal.email',
  'phone number': 'personal.phone',
  'city, state': 'personal.address.city',
  city: 'personal.address.city',
  state: 'personal.address.state',
  'zip code': 'personal.address.zip',
  'street address': 'personal.address.line1',
  country: 'personal.address.country',
  linkedin: 'links.linkedin',
  'your name': 'personal.firstName', // Indeed's "Your Name" is full name
  'salary expectation': 'salary.expected',
  'salary expectation per year': 'salary.expected',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function mapByLabel(field: DetectedField): ProfileKey | null {
  const label = norm(field.signals.label);
  if (!label) return null;

  // Direct match
  if (LABEL_MAP[label]) return LABEL_MAP[label];

  // Partial match — check if label contains a key phrase
  for (const [phrase, key] of Object.entries(LABEL_MAP)) {
    if (label.includes(phrase)) return key;
  }

  // Indeed-specific patterns
  if (/authorized.*work|legally.*authorized/.test(label)) return 'workAuth.authorizedToWork';
  if (/sponsorship|sponsor/.test(label)) return 'workAuth.needsSponsorship';
  if (/visa/.test(label)) return 'workAuth.requiresVisa';
  if (/salary|compensation|pay/.test(label)) return 'salary.expected';

  return null;
}

export const indeed: SiteAdapter = {
  id: 'indeed',

  matches(url) {
    return (
      /(^|\.)indeed\.com$/.test(url.hostname) || /(^|\.)smartapply\.indeed\.com$/.test(url.hostname)
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = mapByLabel(f);
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.95;
        f.source = 'adapter';
      }

      // Indeed "Your Name" is a full name field — compose first + last
      if (f.signals.label.toLowerCase().includes('your name') && !f.mappedKey) {
        f.mappedKey = 'personal.firstName';
        f.confidence = 0.93;
        f.source = 'adapter';
      }
    }
    return fields;
  },

  isMultiStep(doc) {
    // Indeed's Smart Apply is always multi-step
    return !!doc.querySelector(
      '[class*="questions-module"], [class*="step"], [data-testid*="step"]',
    );
  },

  isReviewStep(doc) {
    // Indeed shows a review/submit page at the end
    return (
      !!doc.querySelector(
        'button[type="submit"]:not([disabled]), [data-testid*="review"], [data-testid*="submit"]',
      ) && !doc.querySelector('button:not([disabled])')
    );
  },

  findNextButton(doc) {
    // Indeed uses "Continue" buttons
    const buttons = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'button, a[role=button], [data-testid*="continue"], [data-testid*="next"]',
      ),
    );
    return (
      buttons.find((b) => {
        if ((b as HTMLButtonElement).disabled) return false;
        const text = (b.textContent ?? '').trim().toLowerCase();
        return /^(continue|next|save|proceed)$/i.test(text) && !/submit/i.test(text);
      }) ?? null
    );
  },

  findSubmitButton(doc) {
    return doc.querySelector<HTMLElement>('button[type="submit"], [data-testid*="submit"]');
  },
};
