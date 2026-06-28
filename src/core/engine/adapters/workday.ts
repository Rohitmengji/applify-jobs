import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import { setCustomDropdown } from '../fill';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.5 — Workday (*.myworkdayjobs.com, *.wdN.*). A thick SPA with
// auto-generated, unstable element IDs. The one stable hook is `data-automation-id`.
// Multi-step wizard; we advance to review and never submit.
//
// These automation ids drift between tenants/versions — verify against a live page.
const DA_MAP: Record<string, ProfileKey> = {
  legalNameSection_firstName: 'personal.firstName',
  legalNameSection_lastName: 'personal.lastName',
  email: 'personal.email',
  'phone-number': 'personal.phone',
  addressSection_addressLine1: 'personal.address.line1',
  addressSection_city: 'personal.address.city',
  addressSection_countryRegion: 'personal.address.state',
  addressSection_postalCode: 'personal.address.zip',
  addressSection_countryDropdown: 'personal.address.country',
};

const da = (doc: Document, id: string) =>
  doc.querySelector<HTMLElement>(`[data-automation-id="${id}"]`);

export const workday: SiteAdapter = {
  id: 'workday',

  matches(url) {
    return /(^|\.)myworkdayjobs\.com$/.test(url.hostname) || /\.wd\d\d?\./.test(url.hostname);
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const el = doc.querySelector(`[data-oca-uid="${f.uid}"]`);
      const id = el?.getAttribute('data-automation-id') ?? '';
      const key = DA_MAP[id];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.97;
        f.source = 'adapter';
      }
    }
    return fields;
  },

  // Workday custom dropdowns are a button + popup of [data-automation-id*=promptOption].
  async fillField(field: DetectedField, value: string): Promise<boolean> {
    if (field.kind !== 'select-custom') return false;
    const el = document.querySelector<HTMLElement>(`[data-oca-uid="${field.uid}"]`);
    if (!el) return false;
    return setCustomDropdown(el, value, {
      optionSelector: '[data-automation-id*="promptOption"], [role=option]',
    });
  },

  isMultiStep() {
    return true;
  },

  isReviewStep(doc) {
    return !!doc.querySelector(
      '[data-automation-id*="reviewSubmit"], [data-automation-id*="reviewPreview"]',
    );
  },

  findNextButton(doc) {
    return (
      da(doc, 'bottom-navigation-next-button') ??
      Array.from(doc.querySelectorAll('button')).find((b) =>
        /save and continue|continue|next/i.test(b.textContent ?? ''),
      ) ??
      null
    );
  },

  findSubmitButton(doc) {
    return (
      Array.from(doc.querySelectorAll('button')).find((b) =>
        /^submit$/i.test((b.textContent ?? '').trim()),
      ) ?? null
    );
  },
};
