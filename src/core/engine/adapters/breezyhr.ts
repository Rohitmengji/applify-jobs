import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// BreezyHR adapter. Matches *.breezy.hr career pages.
// BreezyHR uses name attributes on standard form inputs.

const NAME_MAP: Record<string, ProfileKey> = {
  name: 'personal.firstName', // full name — composed in values.ts
  email: 'personal.email',
  phone: 'personal.phone',
  address: 'personal.address.line1',
  city: 'personal.address.city',
  state: 'personal.address.state',
  country: 'personal.address.country',
  linkedin: 'links.linkedin',
  website: 'links.website',
  portfolio: 'links.portfolio',
};

export const breezyhr: SiteAdapter = {
  id: 'breezyhr',
  matches(url) {
    return /(^|\.)breezy\.hr$/.test(url.hostname);
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
        f.reason = `BreezyHR name="${f.signals.name}"`;
      }
    }
    return fields;
  },
};
