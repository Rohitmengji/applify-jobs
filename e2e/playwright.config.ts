import { defineConfig } from '@playwright/test';

// E2E harness for OneClick Apply. This is intentionally OUTSIDE the unit-test gate (vitest)
// and outside the tsc/eslint project — it needs a real Chromium with the built extension
// loaded, which only runs on a developer machine, not in CI-by-default.
//
// Setup:  pnpm build && pnpm i && pnpm e2e:install && pnpm e2e
// (pnpm build produces .output/chrome-mv3, which the fixture loads as an unpacked extension.)
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one persistent browser context with the extension at a time
  workers: 1,
  reporter: [['list']],
  use: {
    headless: false, // MV3 extensions require a headed context
    trace: 'retain-on-failure',
  },
});
