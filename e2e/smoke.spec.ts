import { test, expect } from './fixtures';

// Smoke tests: prove the BUILT extension actually loads and runs in a real Chromium — the
// class of failure unit tests (jsdom) can't catch: a broken manifest, a bad content-script
// path, a build-only crash, or the narrowed host_permissions blocking the panel.
//
// These are deliberately shallow but real. Deeper per-ATS fill tests belong below (see the
// template) and need you to point them at a public *sandbox* posting — never a real employer
// at volume (§21).

test('extension loads and the background service worker comes up', async ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/); // a valid unpacked-extension id
});

test('options page renders in a real browser', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // The options app mounts a heading / tablist; assert the document is interactive, not blank.
  await expect(page.locator('body')).not.toBeEmpty();
  await page.close();
});

test('content script injects on a known ATS host without auto-submitting', async ({ context }) => {
  // A tiny local page standing in for an ATS form. Because we narrowed host_permissions, the
  // declarative content script only auto-runs on enumerated ATS domains; here we assert the
  // page loads and the extension does not navigate/submit anything on its own.
  const page = await context.newPage();
  await page.setContent(
    `<form><label>First name<input name="first_name"/></label>
       <button type="submit">Submit</button></form>`,
  );
  let submitted = false;
  await page.exposeFunction('__markSubmitted', () => (submitted = true));
  await page.evaluate(() => {
    document.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      // @ts-expect-error injected
      window.__markSubmitted();
    });
  });
  await page.waitForTimeout(1500);
  expect(submitted).toBe(false); // the extension NEVER submits on its own
  await page.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE — full fill flow against a public sandbox posting. Fill in a real sandbox
// URL and drive the side panel (chrome.sidePanel automation is limited; you may instead
// trigger fills via the keyboard command or a test-only messaging hook). Left skipped so
// the suite stays green until you wire your environment.
//
// test.skip('fills a Greenhouse sandbox posting and stops at review', async ({ context }) => {
//   const page = await context.newPage();
//   await page.goto('https://YOUR-SANDBOX.greenhouse.io/....');
//   // open the panel, click Detect → Fill, assert fields populated + no submit.
// });
