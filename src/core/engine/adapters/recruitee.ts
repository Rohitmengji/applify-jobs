import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Recruitee adapter. Matches *.recruitee.com career pages.
// Recruitee forms use standard inputs with name attributes.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  city: 'personal.address.city',
  country: 'personal.address.country',
  linkedin: 'links.linkedin',
  portfolio: 'links.portfolio',
};

export const recruitee: SiteAdapter = {
  id: 'recruitee',
  matches(url) {
    return /(^|\.)recruitee\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase();
      const key = NAME_MAP[name];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.95;
        f.source = 'adapter';
        f.reason = `Recruitee name="${f.signals.name}"`;
      }
    }
    return fields;
  },
};
