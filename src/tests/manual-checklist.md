# Manual E2E checklist (per ATS)

React reversion and live-DOM behavior can't be unit-tested in jsdom — verify on real
postings. Run through this list on a live application page for each ATS before claiming
a milestone done (IMPLEMENTATION.md §23).

For each ATS, open a real job posting, open the side panel, click **Fill**, then confirm:

- [ ] First name / last name (or composed full name on Lever)
- [ ] Email
- [ ] Phone
- [ ] Address (line1, city, state, zip, country)
- [ ] LinkedIn / GitHub / portfolio links
- [ ] Résumé attaches (file input **or** drag-drop zone)
- [ ] A custom dropdown (e.g. country, "how did you hear about us")
- [ ] A radio group (e.g. work authorization Yes/No)
- [ ] A free-text box drafts via AI / pulls from the answer bank
- [ ] **Values survive a manual submit attempt** (no silent React reversion)
- [ ] Source badges in the review table are correct (adapter / heuristic / AI)
- [ ] Low-confidence fields are flagged "needs review" and sorted to the top
- [ ] Multi-step only: "Run to review" advances and **stops at review — never submits**

## Coverage log

| ATS                     | Status | Last checked | Notes       |
| ----------------------- | ------ | ------------ | ----------- |
| Greenhouse (job-boards) | ☐      | —            | M2          |
| Lever                   | ☐      | —            | M2          |
| Workable                | ☐      | —            | M3          |
| Ashby                   | ☐      | —            | M3          |
| SmartRecruiters         | ☐      | —            | M3          |
| JazzHR                  | ☐      | —            | M3          |
| Workday                 | ☐      | —            | M4          |
| iCIMS                   | ☐      | —            | M5 (iframe) |
| SuccessFactors          | ☐      | —            | M5          |
| Oracle / Taleo          | ☐      | —            | M5          |
