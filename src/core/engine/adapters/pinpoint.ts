import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Pinpoint adapter. Matches *.pinpointhq.com career pages.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone_number: 'personal.phone',
  city: 'personal.address.city',
  country: 'personal.address.country',
  linkedin_profile_url: 'links.linkedin',
};

export const pinpoint: SiteAdapter = {
  id: 'pinpoint',
  matches(url) {
    return /(^|\.)pinpointhq\.com$/.test(url.hostname);
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
          f.reason = `Pinpoint name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
