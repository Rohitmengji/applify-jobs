import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// LinkedIn Easy Apply adapter.
//
// IMPORTANT LEGAL NOTE: LinkedIn's ToS explicitly prohibits automation of their platform.
// This adapter ONLY assists with filling visible form fields that the user reviews and
// submits manually. It NEVER auto-submits, NEVER clicks "Submit application", and
// NEVER performs any action without the user's explicit click in our side panel.
//
// The extension stops at the review step. The user submits themselves.
// This is consistent with browser autofill behavior.

// LinkedIn Easy Apply uses a modal with multiple steps.
// Fields have aria-labels and data-test-* attributes as stable hooks.

const LABEL_MAP: Record<string, ProfileKey> = {
  'first name': 'personal.firstName',
  'last name': 'personal.lastName',
  'email address': 'personal.email',
  'mobile phone number': 'personal.phone',
  'phone number': 'personal.phone',
  'phone country code': 'personal.phone',
  'city': 'personal.address.city',
  'city, state, or zip code': 'personal.address.city',
  'linkedin profile': 'links.linkedin',
  'website': 'links.website',
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function mapByLabel(field: DetectedField): ProfileKey | null {
  const label = norm(field.signals.label || field.signals.ariaLabel);
  if (!label) return null;

  for (const [phrase, key] of Object.entries(LABEL_MAP)) {
    if (label === phrase || label.includes(phrase)) return key;
  }

  // Common LinkedIn patterns
  if (/how many years.*experience/i.test(label)) return 'freeText';
  if (/salary|compensation/i.test(label)) return 'salary.expected';
  if (/authorized.*work|legally.*authorized/i.test(label)) return 'workAuth.authorizedToWork';
  if (/sponsorship|visa/i.test(label)) return 'workAuth.needsSponsorship';

  return null;
}

export const linkedin: SiteAdapter = {
  id: 'linkedin',

  matches(url) {
    return /(^|\.)linkedin\.com$/.test(url.hostname);
  },

  detectFields(doc) {
    // LinkedIn Easy Apply modal
    const modal = doc.querySelector('.jobs-easy-apply-content, [class*="easy-apply"], [data-test-modal]');
    const root = modal ?? doc;

    const fields = detectFields(root);
    for (const f of fields) {
      const key = mapByLabel(f);
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.93;
        f.source = 'adapter';
        f.reason = 'LinkedIn Easy Apply field pattern';
      }
    }
    return fields;
  },

  isMultiStep(doc) {
    // LinkedIn Easy Apply is always multi-step (Contact → Questions → Resume → Review)
    return !!doc.querySelector(
      '.jobs-easy-apply-content, [class*="easy-apply"], [aria-label*="Easy Apply"]'
    );
  },

  isReviewStep(doc) {
    // The review step has a "Submit application" button (which we NEVER click)
    const submit = doc.querySelector(
      'button[aria-label*="Submit application"], button[data-easy-apply-submit]'
    );
    return submit !== null;
  },

  findNextButton(doc) {
    // LinkedIn uses "Next", "Review", "Continue" buttons
    const buttons = Array.from(doc.querySelectorAll<HTMLElement>(
      '.jobs-easy-apply-content button, [class*="easy-apply"] button'
    ));
    return buttons.find((b) => {
      if ((b as HTMLButtonElement).disabled) return false;
      const text = (b.textContent ?? '').trim().toLowerCase();
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase();
      // Match Next/Review/Continue but NEVER Submit
      return (
        (/^(next|review|continue|save)$/i.test(text) || /next|review|continue/i.test(label)) &&
        !/submit/i.test(text) &&
        !/submit/i.test(label)
      );
    }) ?? null;
  },

  findSubmitButton(doc) {
    // We identify it but NEVER click it — the user must submit themselves
    return doc.querySelector<HTMLElement>(
      'button[aria-label*="Submit application"], button[data-easy-apply-submit]'
    );
  },
};
