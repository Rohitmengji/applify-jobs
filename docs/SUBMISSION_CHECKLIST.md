# Chrome Web Store submission checklist — OneClick Apply

Work top-to-bottom. Nothing here should be a surprise; the ✅ items are already done in code.

## Code / build

- [x] `host_permissions` narrowed to enumerated ATS domains (`src/core/atsHosts.ts`);
      `optional_host_permissions` removed for v1 (reduces review risk).
- [x] No remote code; only optional call is to the user's own AI provider over HTTPS.
- [x] Never auto-submits (verified in unit + e2e smoke).
- [ ] Bump `version` in `wxt.config.ts`.
- [ ] `pnpm compile && pnpm test && pnpm lint && pnpm format:check && pnpm build` all green.
- [ ] `pnpm zip` → upload artifact from `.output`.
- [ ] Extension icon set (16/32/48/128) present and correct.

## Live verification (do NOT skip — currently unit-covered only)

- [ ] Run `pnpm e2e` (loads the built extension in real Chrome) — smoke tests pass.
- [ ] Manually fill on a live posting per ATS in the top tier: Greenhouse, Lever, Workday,
      Ashby, iCIMS. Confirm: fields fill, résumé attaches, **stops at review**, multi-tab
      switching shows the right job, Work Experience/Education fill on Workday.
- [ ] Verify the AI path with a real key: cover letter + "Draft with AI" produce sane output;
      with AI off, no external calls happen.

## Store listing

- [ ] Privacy policy hosted at a public URL (content in `docs/PRIVACY.md`).
- [ ] Listing copy from `docs/STORE_LISTING.md` (name, summary, description, category).
- [ ] 5 screenshots (1280×800) captured per `STORE_LISTING.md`.
- [ ] Permission justifications from `docs/PERMISSIONS.md` pasted into the review form.
- [ ] Data-usage disclosures: declare "does not sell/share data"; "collects personal info
      stored locally"; no data transmitted except user-initiated AI calls to the user's
      provider.
- [ ] Single-purpose statement (from `STORE_LISTING.md`).

## Post-submit

- [ ] Test the published build on a **fresh Chrome profile** (no dev state) end-to-end.
- [ ] If generic-site support is requested by users, plan v1.1 with
      `optional_host_permissions` and a justification narrative.
