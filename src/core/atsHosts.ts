// Enumerated ATS domains the extension auto-injects into. This is the SINGLE SOURCE OF
// TRUTH for both the content-script `matches` (entrypoints/content.ts) and the manifest
// `host_permissions` (wxt.config.ts).
//
// Why this exists (IMPLEMENTATION.md §21): shipping with `host_permissions: https://*/*`
// makes Chrome show the install-time warning "Read and change all your data on all the
// websites you visit" and triggers heavy Web Store review. Narrowing to this known list
// makes the prompt list recognizable job sites instead — the difference between a
// rejected submission and an approved one.
//
// Generic / self-hosted career sites (e.g. a company embedding a Greenhouse iframe on its
// own domain, or a bespoke Workday-less careers page) are intentionally NOT in this list.
// They are handled on demand: when no frame responds to DETECT, the side panel injects the
// content script into the active tab via chrome.scripting (host access covered by
// `activeTab`, granted when the user opens the panel from the toolbar). See
// entrypoints/sidepanel/lib/messaging.ts `injectContentScript` and App.tsx `detect`.
//
// Each entry is a Chrome match pattern. Per Chrome's semantics, `*.host/*` matches the
// bare host AND every subdomain, so one entry covers boards.greenhouse.io,
// job-boards.greenhouse.io, etc.
export const ATS_MATCH_PATTERNS: string[] = [
  'https://*.greenhouse.io/*',
  'https://*.lever.co/*',
  'https://*.workable.com/*',
  'https://*.ashbyhq.com/*',
  'https://*.smartrecruiters.com/*',
  'https://*.applytojob.com/*', // JazzHR apply domain
  'https://*.jazz.co/*',
  'https://*.indeed.com/*', // includes smartapply.indeed.com
  'https://*.jobvite.com/*',
  'https://*.linkedin.com/*',
  'https://*.bamboohr.com/*',
  'https://*.recruitee.com/*',
  'https://*.teamtailor.com/*',
  'https://*.breezy.hr/*',
  'https://*.comeet.com/*',
  'https://*.comeet.co/*',
  'https://*.pinpointhq.com/*',
  'https://*.personio.de/*', // includes jobs.personio.de
  'https://*.personio.com/*',
  'https://*.rippling.com/*',
  'https://*.wellfound.com/*',
  'https://*.angel.co/*', // legacy Wellfound domain
  'https://*.naukri.com/*',
  'https://*.join.com/*',
  'https://*.zohorecruit.com/*',
  'https://recruit.zoho.com/*', // ONLY the recruit subdomain — not mail/crm/the whole Zoho suite
  'https://*.keka.com/*',
  'https://*.dice.com/*',
  'https://*.ziprecruiter.com/*',
  'https://*.myworkdayjobs.com/*', // Workday (acme.wd1.myworkdayjobs.com)
  'https://*.icims.com/*',
  'https://*.successfactors.com/*',
  'https://*.sapsf.com/*',
  'https://*.oraclecloud.com/*',
  'https://*.taleo.net/*',
];
