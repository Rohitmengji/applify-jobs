import { defineConfig } from 'wxt';

// WXT generates manifest.json from this config + the entrypoint files.
// Content-script registration lives in src/entrypoints/content.ts (WXT convention).
// See IMPLEMENTATION.md §7 and §21 for the permission-tightening plan before store submission.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OneClick Apply',
    description:
      'Fill job application forms across every ATS with one click. You review and submit — the extension never auto-submits.',
    version: '0.1.0',
    permissions: [
      'storage', // profile + settings
      'sidePanel', // the review surface
      'scripting', // programmatic injection if needed
      'activeTab', // act on the current tab on a user gesture
      'webNavigation', // enumerate frames so we can detect/fill inside iframes (iCIMS, §25)
    ],
    // Broad to start; tighten before store submission (enumerate ATS domains
    // or switch to activeTab + scripting.executeScript on click). See §21.
    host_permissions: ['https://*/*'],
    action: { default_title: 'OneClick Apply' },
  },
});
