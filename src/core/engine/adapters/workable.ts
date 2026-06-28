import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.6 — Workable (apply.workable.com). Mostly native inputs with
// stable `name`/aria-label; résumé is a clear file input. Map the high-confidence
// names; the heuristic layer covers labelled custom questions.
const NAME_MAP: Record<string, ProfileKey> = {
  firstname: 'personal.firstName',
  lastname: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  address: 'personal.address.line1',
  resume: 'documents.resume',
};

export const workable: SiteAdapter = {
  id: 'workable',

  matches(url, doc) {
    return (
      /(^|\.)workable\.com$/.test(url.hostname) ||
      !!doc.querySelector('[data-ui="application-form"], form[action*="workable"]')
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
