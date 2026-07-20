# OneClick Apply

**A Manifest V3 Chrome extension that fills job application forms across every major ATS with one click — you review and submit.**

Built per [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) (the single source of truth). North-star product vision lives in [`implemenation2.txt`](./implemenation2.txt).

---

## What it does

You're on an application page (Workday, Greenhouse, Lever, Workable, Ashby, SmartRecruiters, JazzHR, iCIMS, SuccessFactors, Oracle/Taleo, or an arbitrary company career site). You click **Fill**. The extension detects every field, maps each to your saved profile, fills it, and — for multi-step wizards — advances through the steps until the review screen. You review everything in a side panel, fix anything wrong, and **click Submit yourself**.

### Hard product rules

- **Never auto-submits.** It stops at review. The human submits. (Sidesteps CAPTCHAs, avoids ToS violations, keeps a human eye on every application.)
- **The profile is the single source of truth.** One master record fills every ATS.
- **Deterministic before probabilistic.** Hand-tuned adapters first, generic heuristics second, LLM only for what's left.
- **Data is local by default.** No backend required. An optional backend only proxies LLM calls.

## Architecture

Five components, standard MV3 shape:

- **Content script** — detects fields, applies fill primitives to the live DOM, drives the wizard state machine.
- **Side panel (React)** — the review table; per-field overrides; Fill / Next / Run-to-review.
- **Background service worker** — message router; the **only** caller of the LLM (API keys never enter a web page).
- **Options page (React)** — full profile editor, résumé upload, answer-bank editor, settings.
- **Storage** — `chrome.storage.local` for the JSON profile; IndexedDB (Dexie) for résumé/cover-letter blobs.

The field engine is three layers, deterministic-first: **site adapter → heuristic matcher → LLM fallback**.

## Tech stack

TypeScript (strict) · [WXT](https://wxt.dev) (MV3 framework) · React 18 + Tailwind 3 · Zod (schema) · Dexie (IndexedDB) · Zustand · Vitest + Testing Library.

## Getting started

```bash
corepack enable                  # provides pnpm
pnpm install                     # installs deps + runs `wxt prepare`
pnpm dev                         # dev build with HMR; opens a dev browser profile
```

Load unpacked: `chrome://extensions` → enable _Developer mode_ → _Load unpacked_ → select `.output/chrome-mv3/`.

### Scripts

| Command        | What                                        |
| -------------- | ------------------------------------------- |
| `pnpm dev`     | Dev build + HMR                             |
| `pnpm build`   | Production build → `.output/chrome-mv3/`    |
| `pnpm zip`     | Zip for the Chrome Web Store                |
| `pnpm compile` | `wxt prepare` + `tsc --noEmit` (type check) |
| `pnpm test`    | Run the Vitest suite                        |
| `pnpm lint`    | ESLint                                      |
| `pnpm format`  | Prettier write                              |

## Privacy

Your profile and résumé never leave the browser except: (a) résumé bytes go to the active job page when you click Fill; (b) field labels + profile context go to the LLM/proxy **only when LLM assist is enabled**. No analytics, no third-party servers beyond the optional LLM proxy you configure. The LLM key lives in `chrome.storage.local` only — never synced, never committed. See `IMPLEMENTATION.md` §21.

## AI Credits & Admin

The extension includes a built-in **credit system** and an **admin panel** for managing shared AI usage:

- **Monthly credits** — Each user gets a configurable number of AI calls per month (default: 100). 1 credit = 1 AI action (field mapping, answer drafting, résumé tailoring, cover letter).
- **Admin panel** — Access at `chrome-extension://<id>/admin.html` (password-protected, not linked in UI). Manage users, set per-user credit limits, view usage, toggle the global AI kill switch.
- **Cost protection** — Triple layer: credit limits + rate limiter (20/min) + daily budget (500/day). Admin can also set spending caps on the provider side.
- **User-provided keys** — When credits run out, users are guided to add their own OpenAI/Anthropic API key. The extension tracks which users have their own key (visible in admin).
- **Key security** — All keys stored in Chrome's encrypted `chrome.storage.local`. Keys only travel over HTTPS directly to OpenAI/Anthropic. Never exposed to web pages or other extensions.

See [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) for the full installation guide and [`docs/API_KEY_GUIDE.md`](docs/API_KEY_GUIDE.md) for the step-by-step API key setup instructions.

## Status / roadmap

Milestones (see `IMPLEMENTATION.md` §22):

| Milestone | Scope                                                                       | Status     |
| --------- | --------------------------------------------------------------------------- | ---------- |
| **M0**    | WXT/React/TS/Tailwind scaffold                                              | ✅ done    |
| **M1**    | Profile schema + storage + full options editor (import/export)              | ✅ done    |
| **M2**    | Field engine + fill primitives + Greenhouse/Lever + side-panel review       | ✅ done    |
| **M3**    | Custom dropdowns + Workable, Ashby, SmartRecruiters, JazzHR                 | ✅ done    |
| **M4**    | Multi-step wizard + Workday                                                 | ✅ done    |
| **M5**    | iframe routing + iCIMS, SuccessFactors, Oracle                              | ✅ done    |
| **M6**    | Heuristic hardening (synonym coverage)                                      | ✅ done    |
| **M7**    | LLM field-mapping fallback + answer bank + AI drafting                      | ✅ done    |
| **M8**    | Résumé parsing (PDF + text + AI) + learning engine · backend/dashboard/sync | 🟡 partial |

All 10 ATS adapters are registered. Engine, fill primitives, matcher, and adapter
detection are unit-tested (74 tests). Per `IMPLEMENTATION.md` §23, **live-page behavior**
(React reversion, real custom dropdowns, multi-step navigation, iframe forms) still needs
manual verification — track it in [`src/tests/manual-checklist.md`](src/tests/manual-checklist.md).
The build went through two rounds of adversarial multi-dimension review (34 findings
total, all confirmed-real ones fixed).

## Contributing

Run `pnpm compile && pnpm test && pnpm lint && pnpm build` before pushing. See `push.sh` for the gated push-to-PR flow.

## Documentation

| Document                                         | Purpose                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)     | Installation & first-time setup guide for users             |
| [`docs/API_KEY_GUIDE.md`](docs/API_KEY_GUIDE.md) | Step-by-step guide to get your own OpenAI/Anthropic API key |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)     | Extension permissions explained                             |
| [`docs/PRIVACY.md`](docs/PRIVACY.md)             | Privacy policy                                              |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md)         | Full technical specification (single source of truth)       |
| [`CLAUDE.md`](CLAUDE.md)                         | Agent orientation / codebase map                            |
