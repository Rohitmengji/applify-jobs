import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.4 — Lever reference adapter. Uses name-attribute fields.
// Note: Lever's primary field is a single full-name input (name="name"), not
// first/last. valueForKey composes "first last" when the mapped key is
// personal.firstName and signals.name === 'name'.
const NAME_MAP: Record<string, ProfileKey> = {
  name: 'personal.firstName', // single "Full name" → composed in values.ts
  email: 'personal.email',
  phone: 'personal.phone',
  org: 'experience', // "Current company" — handled by the experience filler
  'urls[LinkedIn]': 'links.linkedin',
  'urls[GitHub]': 'links.github',
  'urls[Portfolio]': 'links.portfolio',
  'urls[Other]': 'links.website',
  resume: 'documents.resume',
};

export const lever: SiteAdapter = {
  id: 'lever',

  matches(url, doc) {
    // Anchor to the hostname end so e.g. "lever.co.evil.com" does NOT match.
    return (
      /(^|\.)lever\.co$/.test(url.hostname) ||
      !!doc.querySelector('form[action*="lever"], .application-form[data-qa]')
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = NAME_MAP[f.signals.name];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.97;
        f.source = 'adapter';
      }
    }
    return fields;
  },
};
