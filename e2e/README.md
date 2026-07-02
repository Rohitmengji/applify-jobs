# E2E tests (Playwright)

Real-browser tests that load the **built** extension into Chromium. These catch the class of
bug unit tests can't: manifest/permission errors, content-script path issues, build-only
crashes, and "does it actually run in Chrome".

They are **not** part of the unit gate (`pnpm test` / `pnpm compile` / `pnpm lint`) — this
folder is excluded from tsc, eslint, prettier, and vitest on purpose, because it needs a
headed browser and the built output.

## Run

```bash
pnpm build            # produces .output/chrome-mv3 (the unpacked extension the tests load)
pnpm i                # installs @playwright/test (declared in devDependencies)
pnpm e2e:install      # one-time: downloads the Chromium Playwright uses
pnpm e2e              # runs e2e/*.spec.ts
```

## What's covered

`smoke.spec.ts`:

- the extension loads and its MV3 service worker comes up (valid extension id),
- the options page renders in a real browser (not blank),
- the extension never auto-submits a form on its own.

## Extending it

The commented **template** at the bottom of `smoke.spec.ts` is the shape of a full fill test:
navigate to a public **sandbox** posting, drive Detect → Fill, and assert fields populate and
the flow stops at review. Point it at a sandbox you control — never a real employer's posting
at volume (see IMPLEMENTATION.md §21). Side-panel UI automation is limited in Playwright; the
simplest hook is the `fill-page` keyboard command or a test-only messaging entry point.
