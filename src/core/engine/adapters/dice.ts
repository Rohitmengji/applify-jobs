import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Dice.com adapter. One of the largest tech job boards.
// Uses standard inputs with name/id attributes.

const NAME_MAP: Record<string, ProfileKey> = {
  firstName: 'personal.firstName',
  lastName: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  city: 'personal.address.city',
  state: 'personal.address.state',
  zipCode: 'personal.address.zip',
};

export const dice: SiteAdapter = {
  id: 'dice',
  matches(url) {
    return /(^|\.)dice\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.replace(/[-_]/g, '').toLowerCase();
      for (const [pattern, key] of Object.entries(NAME_MAP)) {
        if (name === pattern.toLowerCase() || name.includes(pattern.toLowerCase())) {
          f.mappedKey = key;
          f.confidence = 0.93;
          f.source = 'adapter';
          f.reason = `Dice name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
