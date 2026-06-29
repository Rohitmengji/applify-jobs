import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Join.com adapter — European hiring platform.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  city: 'personal.address.city',
  country: 'personal.address.country',
  linkedin_url: 'links.linkedin',
  website_url: 'links.website',
};

export const joincom: SiteAdapter = {
  id: 'join',
  matches(url) {
    return /(^|\.)join\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase();
      for (const [pattern, key] of Object.entries(NAME_MAP)) {
        if (name === pattern || name.includes(pattern)) {
          f.mappedKey = key;
          f.confidence = 0.94;
          f.source = 'adapter';
          f.reason = `Join.com name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
