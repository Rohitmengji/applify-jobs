import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Comeet adapter. Matches *.comeet.com career pages.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  linkedin_url: 'links.linkedin',
  city: 'personal.address.city',
};

export const comeet: SiteAdapter = {
  id: 'comeet',
  matches(url) {
    return /(^|\.)comeet\.com$/.test(url.hostname) || /(^|\.)comeet\.co$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase();
      const key = NAME_MAP[name];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.94;
        f.source = 'adapter';
        f.reason = `Comeet name="${f.signals.name}"`;
      }
    }
    return fields;
  },
};
