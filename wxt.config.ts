import { defineConfig } from 'wxt';

// WXT generates manifest.json from this config + the entrypoint files.
// Content-script registration lives in src/entrypoints/content.ts (WXT convention).
// See IMPLEMENTATION.md §7 and §21 for the permission-tightening plan before store submission.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      target: 'esnext',
    },
    esbuild: {
      charset: 'ascii', // Force ASCII output — avoids Chrome "not UTF-8" false positives
    },
  }),
  manifest: {
    name: 'OneClick Apply',
    description:
      'Fill job application forms across every ATS with one click. You review and submit -- the extension never auto-submits.',
    version: '0.2.0',
    permissions: [
      'storage', // profile + settings
      'sidePanel', // the review surface
      'scripting', // programmatic injection if needed
      'activeTab', // act on the current tab on a user gesture
      'webNavigation', // enumerate frames so we can detect/fill inside iframes (iCIMS, §25)
    ],
    // Required for universal form-filling. Justification: the extension fills job application
    // forms across hundreds of different ATS platforms and company career sites — it cannot
    // enumerate all possible domains. It only reads/writes form fields (never passwords,
    // payment info, or non-form content) and only when the user explicitly triggers it.
    host_permissions: ['https://*/*'],
    action: { default_title: 'OneClick Apply' },
    commands: {
      'fill-page': {
        suggested_key: { default: 'Ctrl+Shift+F', mac: 'Command+Shift+F' },
        description: 'Detect and fill all fields on the current page',
      },
    },
  },
});
