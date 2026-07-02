# Chrome Web Store listing — OneClick Apply

## Name

OneClick Apply — Job Application Autofill

## Summary (≤132 chars)

Fill job applications across every major ATS in one click. You review and submit — it never
submits for you. Local-first & private.

## Category

Productivity

## Single-purpose description (required by review)

OneClick Apply fills job-application form fields — personal details, work history, education,
skills, and common screening questions — across major Applicant Tracking Systems, so a job
seeker doesn't re-type the same information on every application. The user reviews every field
in a side panel and submits the form themselves; the extension never submits.

## Detailed description

Applying to jobs means typing the same details into a different form every time. OneClick
Apply fills them for you — name, contact info, work authorization, work history, education,
skills, links, and the common "why this company / notice period / how did you hear" questions —
across Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters, and 30+ more ATS platforms.

- **One click, human-in-the-loop.** It detects the form, fills what it can, and stops at the
  review step. You check everything and submit yourself. It never auto-submits.
- **Learns as you go.** Answer a question once — or correct a field — and it remembers, so the
  next form fills even faster.
- **Private by design.** Your profile and résumé stay on your device. No account, no server,
  no tracking. Optional AI drafting uses your own API key and only when you turn it on.
- **Deterministic first.** Hand-tuned site adapters and a heuristic matcher do the work; AI is
  only a fallback for open-ended questions.

You stay in control of every application.

## Screenshots to capture (1280×800)

1. Side panel review table on a Greenhouse form — fields filled with source badges.
2. The "N required fields still empty" + "3 experience rows filled" summary.
3. A Workday multi-step form mid-fill, panel showing "Run to review."
4. Options → Training page (answer 42 common questions once).
5. Options → Analytics (applications filled, time saved).

## Notes

- Version is set in `wxt.config.ts`. Bump before each submission.
- Build the upload artifact with `pnpm zip` (produces the store zip from `.output`).
