import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.6 — JazzHR (app.jazz.co, *.applytojob.com). Classic
// server-rendered forms; name/id are reliable.
const NAME_MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  resume: 'documents.resume',
  city: 'personal.address.city',
  state: 'personal.address.state',
};

export const jazzhr: SiteAdapter = {
  id: 'jazzhr',

  matches(url, doc) {
    return (
      /(^|\.)applytojob\.com$/.test(url.hostname) ||
      /(^|\.)jazz\.co$/.test(url.hostname) ||
      !!doc.querySelector('form#new_applicant, form[action*="applytojob"]')
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = NAME_MAP[f.signals.name.toLowerCase()];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.96;
        f.source = 'adapter';
      }
    }
    return fields;
  },
};
