import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.6 — SmartRecruiters (jobs/careers.smartrecruiters.com).
// Sectioned form; `data-test` attributes are the stable hook. Map the well-known
// data-test ids; everything else falls through to the heuristic matcher.
const DATA_TEST_MAP: Record<string, ProfileKey> = {
  'firstName-input': 'personal.firstName',
  'lastName-input': 'personal.lastName',
  'email-input': 'personal.email',
  'phoneNumber-input': 'personal.phone',
};

export const smartrecruiters: SiteAdapter = {
  id: 'smartrecruiters',

  matches(url, doc) {
    return (
      /(^|\.)smartrecruiters\.com$/.test(url.hostname) ||
      !!doc.querySelector('[data-test="application-form"], form[action*="smartrecruiters"]')
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      // detect() stores attributes in signals; re-read data-test off the live element.
      const el = doc.querySelector(`[data-oca-uid="${f.uid}"]`);
      const dt = el?.getAttribute('data-test') ?? '';
      const key = DATA_TEST_MAP[dt];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.95;
        f.source = 'adapter';
      }
    }
    return fields;
  },
};
