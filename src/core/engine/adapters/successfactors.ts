import type { SiteAdapter } from './types';
import { findButtonByText } from './util';

// IMPLEMENTATION.md §14.6 — SAP SuccessFactors (*.successfactors.com, career*.sapsf.com).
// Heavy SAP UI5 controls with generated ids, so we don't map by attribute — the generic
// detector + heuristic matcher key off the visible labels. Multi-step.
export const successfactors: SiteAdapter = {
  id: 'successfactors',

  matches(url, doc) {
    return (
      /(^|\.)successfactors\.com$/.test(url.hostname) ||
      /(^|\.)sapsf\.com$/.test(url.hostname) ||
      !!doc.querySelector('[id^="careersJobApply"], [data-sap-ui]')
    );
  },

  isMultiStep() {
    return true;
  },
  isReviewStep(doc) {
    return !!findButtonByText(doc, /^submit( application)?$/i);
  },
  findNextButton(doc) {
    return findButtonByText(doc, /continue|next/i);
  },
  findSubmitButton(doc) {
    return findButtonByText(doc, /^submit( application)?$/i);
  },
};
