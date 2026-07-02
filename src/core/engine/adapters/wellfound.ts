import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Wellfound (formerly AngelList) adapter. Matches wellfound.com.
// Wellfound is a React SPA with aria-labels as the stable hooks.

const LABEL_MAP: Record<string, ProfileKey> = {
  'first name': 'personal.firstName',
  'last name': 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  linkedin: 'links.linkedin',
  github: 'links.github',
  portfolio: 'links.portfolio',
  website: 'links.website',
  location: 'personal.address.city',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const wellfound: SiteAdapter = {
  id: 'wellfound',
  matches(url) {
    return /(^|\.)wellfound\.com$/.test(url.hostname) || /(^|\.)angel\.co$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const label = norm(f.signals.label || f.signals.ariaLabel);
      for (const [pattern, key] of Object.entries(LABEL_MAP)) {
        if (label === pattern || label.includes(pattern)) {
          f.mappedKey = key;
          f.confidence = 0.93;
          f.source = 'adapter';
          f.reason = `Wellfound label="${label}" matched "${pattern}"`;
          break;
        }
      }
    }
    return fields;
  },
};
