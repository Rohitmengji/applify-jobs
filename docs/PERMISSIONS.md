# Permission justifications — OneClick Apply

For Chrome Web Store review. Each permission maps to a concrete, single-purpose need.

## `permissions`

| Permission      | Why it's needed                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`       | Store the user's profile, settings, saved answers, and application history locally on the device.                                            |
| `sidePanel`     | The review surface. Detected fields + values are shown in the side panel for the user to review before filling.                              |
| `scripting`     | Inject the content script on demand into a generic/self-hosted career site when the user opens the panel there (see host_permissions below). |
| `activeTab`     | Grants host access to the current tab only when the user invokes the extension, so on-demand injection needs no broad grant.                 |
| `webNavigation` | Enumerate a tab's frames so the form can be detected/filled even when it lives inside an iframe (e.g. iCIMS, embedded Greenhouse).           |

## `host_permissions` (enumerated ATS domains)

The declarative content script auto-runs **only** on known Applicant Tracking System domains
(greenhouse.io, lever.co, workday's myworkdayjobs.com, ashbyhq.com, icims.com, and ~30 more —
see `src/core/atsHosts.ts`). This is deliberately narrow so the install prompt lists
recognizable job sites, not "all your data on all websites."

**Single purpose:** read and fill **job-application form fields** on these sites, and only when
the user triggers it. The extension does not read page content beyond form fields, does not
touch passwords or payment fields, and never auto-submits.

## `optional_host_permissions: https://*/*` _(removed in v1)_

Removed for v1 to reduce review friction. Generic / self-hosted career pages are supported
on a per-tab basis via `activeTab` when the user opens the panel. A future v1.1 may
re-introduce this as an opt-in for power users who want the extension to auto-inject on any
career page.

## What we do NOT request

No `tabs` (broad), no `history`, no `cookies`, no `webRequest`, no remote code. There is no
backend; the only optional network call is to the user's own AI provider (see PRIVACY.md).
