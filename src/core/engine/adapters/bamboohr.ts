import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// BambooHR adapter. Matches *.bamboohr.com career pages.
// BambooHR uses relatively standard HTML forms with name/id attributes.

const NAME_MAP: Record<string, ProfileKey> = {
  firstName: 'personal.firstName',
  lastName: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  city: 'personal.address.city',
  state: 'personal.address.state',
  zip: 'personal.address.zip',
  country: 'personal.address.country',
  streetAddress: 'personal.address.line1',
  linkedinUrl: 'links.linkedin',
  websiteUrl: 'links.website',
};

export const bamboohr: SiteAdapter = {
  id: 'bamboohr',
  matches(url) {
    return /(^|\.)bamboohr\.com$/.test(url.hostname);
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase().replace(/[-_]/g, '');
      for (const [pattern, key] of Object.entries(NAME_MAP)) {
        if (name === pattern.toLowerCase() || name.includes(pattern.toLowerCase())) {
          f.mappedKey = key;
          f.confidence = 0.95;
          f.source = 'adapter';
          f.reason = `BambooHR name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
