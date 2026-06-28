import type { SiteAdapter } from './types';

// IMPLEMENTATION.md §14.6 — Ashby (jobs.ashbyhq.com). A React app whose inputs carry
// good labels/aria, so the generic detector + heuristic matcher handle the core fields
// well; we omit detectFields and let the orchestrator fall back to the generic pass.
// Ashby's custom selects are standard [role=option] popups, which the generic
// setCustomDropdown already drives — no fillField override needed yet.
export const ashby: SiteAdapter = {
  id: 'ashby',

  matches(url, doc) {
    return (
      /(^|\.)ashbyhq\.com$/.test(url.hostname) ||
      !!doc.querySelector(
        '.ashby-application-form-container, [class*="ashby"][class*="application"]',
      )
    );
  },
};
