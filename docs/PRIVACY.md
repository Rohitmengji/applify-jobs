# Privacy Policy — OneClick Apply

_Last updated: 2026-07-02_

OneClick Apply is a **local-first** browser extension. Your data stays on your device. We do
not run a server that receives your personal data, we do not sell or share your data, and we
do not include analytics or tracking.

## What the extension stores, and where

- **Your profile** (name, contact details, work authorization, experience, education, skills,
  saved answers) — stored in `chrome.storage.local` **on your device only**. It is never
  synced to our servers (we have none).
- **Your résumé / cover letter files** — stored as bytes in your browser's IndexedDB
  (via Dexie), **on your device only**.
- **Learned answers** — when you fill or correct a field, the answer is remembered locally
  (`chrome.storage.local`) so future forms fill faster. Local only.
- **Application history** — the company/role/URL of applications you fill, stored locally for
  duplicate detection and your own analytics. Local only.

You can export or delete all of this at any time from the extension's Options page.

## What leaves your browser

Only two things ever leave your browser, and only when you initiate them:

1. **Résumé/field data → the job application page** when you click **Fill**. This goes to the
   employer's own application form (the page you're on), exactly as if you had typed it.
2. **Optional AI assist → your chosen AI provider.** If — and only if — you enable AI features
   and enter your **own** API key (OpenAI or Anthropic), the extension may send a field's
   label/question plus relevant profile context to that provider to draft an answer or cover
   letter. This call is made only from the background service worker, only over HTTPS, and
   only for fields you ask it to help with. Your API key is stored locally and never sent
   anywhere except your chosen provider. If you don't enable AI, no external calls are made.

## Sensitive data

- **EEO / voluntary self-identification** (gender, race, veteran, disability) defaults to
  "decline to self-identify" and is **never guessed and never learned.**
- Government IDs, dates of birth, and financial account numbers are **never learned** for reuse.
- Passwords are never stored, and the extension never creates accounts or logs in for you.

## Human-in-the-loop

The extension **never submits an application for you.** It stops at the review step; you
review every field and submit yourself.

## Contact

Questions: rohit.mengji@employinc.com
