import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Keka HR adapter — Indian HRMS with recruitment module.
// Matches *.keka.com career pages.

const NAME_MAP: Record<string, ProfileKey> = {
  firstName: 'personal.firstName',
  lastName: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  mobile: 'personal.phone',
  city: 'personal.address.city',
  state: 'personal.address.state',
  country: 'personal.address.country',
  currentSalary: 'salary.expected',
  expectedSalary: 'salary.expected',
  linkedIn: 'links.linkedin',
};

export const keka: SiteAdapter = {
  id: 'keka',
  matches(url) {
    return /(^|\.)keka\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.replace(/[-_\[\]]/g, '').toLowerCase();
      for (const [pattern, key] of Object.entries(NAME_MAP)) {
        if (name === pattern.toLowerCase() || name.includes(pattern.toLowerCase())) {
          f.mappedKey = key;
          f.confidence = 0.94;
          f.source = 'adapter';
          f.reason = `Keka name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
