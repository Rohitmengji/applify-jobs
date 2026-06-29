import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// ZipRecruiter adapter. Major US job board.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  city: 'personal.address.city',
  state: 'personal.address.state',
  zip: 'personal.address.zip',
};

export const ziprecruiter: SiteAdapter = {
  id: 'ziprecruiter',
  matches(url) {
    return /(^|\.)ziprecruiter\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase();
      const key = NAME_MAP[name];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.93;
        f.source = 'adapter';
        f.reason = `ZipRecruiter name="${f.signals.name}"`;
      }
    }
    return fields;
  },
};
