import type { SiteAdapter } from './types';
import { findButtonByText } from './util';

// IMPLEMENTATION.md §14.6 — Oracle. Two distinct products:
//   • Taleo (*.taleo.net) — legacy multi-page.
//   • Oracle Recruiting Cloud / Redwood (*.oraclecloud.com/hcmUI) — ADF/Redwood SPA.
// Both are multi-step. Generated ids → rely on the generic detector + heuristic on
// labels; the value here is correct ATS identification + wizard navigation.
const NEXT_RE = /continue|next|save and continue/i;
const SUBMIT_RE = /^submit( application)?$/i;

export const oracle: SiteAdapter = {
  id: 'oracle',

  matches(url, doc) {
    return (
      /(^|\.)taleo\.net$/.test(url.hostname) ||
      /(^|\.)oraclecloud\.com$/.test(url.hostname) ||
      !!doc.querySelector('#requisitionDescriptionInterface, [id^="apply-flow"], .taleo')
    );
  },

  isMultiStep() {
    return true;
  },
  isReviewStep(doc) {
    return !findButtonByText(doc, NEXT_RE) && !!findButtonByText(doc, SUBMIT_RE);
  },
  findNextButton(doc) {
    return findButtonByText(doc, NEXT_RE);
  },
  findSubmitButton(doc) {
    return findButtonByText(doc, SUBMIT_RE);
  },
};
