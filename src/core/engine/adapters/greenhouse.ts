import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.3 — Greenhouse reference adapter. Stable, semantic IDs.
// canonical Greenhouse field ids → profile keys
const MAP: Record<string, ProfileKey> = {
  first_name: 'personal.firstName',
  last_name: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  // common custom-link question ids vary; heuristics catch LinkedIn/website.
};

export const greenhouse: SiteAdapter = {
  id: 'greenhouse',

  matches(url, doc) {
    // Anchor to the hostname end so e.g. "greenhouse.io.evil.com" does NOT match.
    return (
      /(^|\.)greenhouse\.io$/.test(url.hostname) ||
      !!doc.querySelector('#grnhse_app, form[action*="greenhouse"], #application_form')
    );
  },

  detectFields(doc) {
    const fields: DetectedField[] = detectFields(doc); // generic pass first
    // upgrade confidence/mapping for known ids
    for (const f of fields) {
      const key = MAP[f.signals.id];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.99;
        f.source = 'adapter';
      }
    }
    return fields;
  },

  async fillField(_field, _value) {
    // Greenhouse résumé is a drag-zone with a hidden input near #resume / "Attach".
    // Handled by attachFile/dropFileOnZone in the content script; nothing special here.
    return false; // fall back to the default dispatcher for everything else
  },
};
