import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import { findButtonByText } from './util';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.6 — iCIMS (*.icims.com). Often embedded in an iframe
// (#icims_content_iframe); multi-page; dated markup. With allFrames:true the content
// script runs inside the iCIMS iframe, where location.host is *.icims.com.
// Field hooks drift — verify against a live posting; heuristic covers the rest.
const NAME_MAP: Record<string, ProfileKey> = {
  firstname: 'personal.firstName',
  lastname: 'personal.lastName',
  email: 'personal.email',
  phone: 'personal.phone',
  addressline1: 'personal.address.line1',
  city: 'personal.address.city',
  zip: 'personal.address.zip',
  postalcode: 'personal.address.zip',
};

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export const icims: SiteAdapter = {
  id: 'icims',

  matches(url, doc) {
    return (
      /(^|\.)icims\.com$/.test(url.hostname) ||
      !!doc.querySelector('#icims_content_iframe, [id^="icims"]')
    );
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const key = NAME_MAP[normName(f.signals.name || f.signals.id)];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.93;
        f.source = 'adapter';
      }
    }
    return fields;
  },

  isMultiStep() {
    return true;
  },
  isReviewStep(doc) {
    return !!findButtonByText(doc, /^submit( application)?$/i);
  },
  findNextButton(doc) {
    return findButtonByText(doc, /continue|next|save & continue|save and continue/i);
  },
  findSubmitButton(doc) {
    return findButtonByText(doc, /^submit( application)?$/i);
  },
};
