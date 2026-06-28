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

## Status / roadmap

Built in milestones (see `IMPLEMENTATION.md` §22): **M0** scaffold → **M1** profile/storage/options → **M2** Greenhouse + Lever autofill + review → **M3** custom dropdowns + 4 adapters → **M4** wizard + Workday → **M5** iCIMS/SuccessFactors/Oracle → **M6** heuristic hardening → **M7** LLM fallback + answer bank → **M8** (optional) backend/parsing/sync.

## Contributing

Run `pnpm compile && pnpm test && pnpm lint && pnpm build` before pushing. See `push.sh` for the gated push-to-PR flow.
