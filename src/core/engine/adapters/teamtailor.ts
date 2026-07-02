import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// Teamtailor adapter. Matches *.teamtailor.com and career.* sites using Teamtailor.
// Teamtailor uses data-field attributes and standard form inputs.

const FIELD_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  linkedin: 'links.linkedin',
  portfolio: 'links.portfolio',
  city: 'personal.address.city',
  country: 'personal.address.country',
};

function mapField(f: DetectedField): ProfileKey | null {
  // Check data-field attribute (Teamtailor-specific)
  const el = document.querySelector(`[data-oca-uid="${f.uid}"]`);
  const dataField = el?.getAttribute('data-field') ?? '';
  if (dataField && FIELD_MAP[dataField]) return FIELD_MAP[dataField];

  // Check name
  const name = f.signals.name.toLowerCase().replace(/[-_[\]]/g, '');
  for (const [pattern, key] of Object.entries(FIELD_MAP)) {
    if (name.includes(pattern.replace(/_/g, ''))) return key;
  }
  return null;
}

export const teamtailor: SiteAdapter = {
  id: 'teamtailor',
  matches(url, doc) {
    return (
      /(^|\.)teamtailor\.com$/.test(url.hostname) ||
      !!doc.querySelector('[data-controller*="teamtailor"], meta[content*="teamtailor"]')
    );
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = mapField(f);
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.94;
        f.source = 'adapter';
        f.reason = 'Teamtailor field pattern';
      }
    }
    return fields;
  },
};
