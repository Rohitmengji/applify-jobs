import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Rippling adapter. Matches *.rippling.com career pages.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  linkedin: 'links.linkedin',
  location: 'personal.address.city',
};

export const rippling: SiteAdapter = {
  id: 'rippling',
  matches(url) {
    return /(^|\.)rippling\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase();
      for (const [pattern, key] of Object.entries(NAME_MAP)) {
        if (name === pattern || name.includes(pattern)) {
          f.mappedKey = key;
          f.confidence = 0.93;
          f.source = 'adapter';
          f.reason = `Rippling name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
