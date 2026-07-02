import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Personio adapter. Matches *.personio.de and *.jobs.personio.de career pages.
// German-origin ATS, used widely in EU. Standard form inputs.

const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  city: 'personal.address.city',
  country: 'personal.address.country',
  street: 'personal.address.line1',
  zip_code: 'personal.address.zip',
  linkedin: 'links.linkedin',
};

export const personio: SiteAdapter = {
  id: 'personio',
  matches(url) {
    return (
      /(^|\.)personio\.(de|com)$/.test(url.hostname) ||
      /(^|\.)jobs\.personio\.(de|com)$/.test(url.hostname)
    );
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name.toLowerCase().replace(/[-[\]]/g, '_');
      for (const [pattern, key] of Object.entries(NAME_MAP)) {
        if (name.includes(pattern)) {
          f.mappedKey = key;
          f.confidence = 0.94;
          f.source = 'adapter';
          f.reason = `Personio name="${f.signals.name}"`;
          break;
        }
      }
    }
    return fields;
  },
};
