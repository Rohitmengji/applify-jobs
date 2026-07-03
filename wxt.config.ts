import { defineConfig } from 'wxt';
import { ATS_MATCH_PATTERNS } from './src/core/atsHosts';

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
      'scripting', // on-demand injection into generic career sites (see atsHosts.ts)
      'activeTab', // host access to the current tab on user gesture (covers generic sites)
      'webNavigation', // enumerate frames so we can detect/fill inside iframes (iCIMS, §25)
    ],
    // Auto-inject only on known ATS domains (atsHosts.ts) so the install-time prompt lists
    // recognizable job sites, not "all your data on all websites" (§21). Generic / self-
    // hosted career pages are handled on demand via activeTab + chrome.scripting when the
    // user opens the panel there. Power users can opt into "run everywhere" by granting the
    // optional broad permission below.
    host_permissions: [...ATS_MATCH_PATTERNS],
    // optional_host_permissions removed for v1 store review — broad "all sites" access
    // triggers extra scrutiny. Generic career sites unsupported until v1.1; the enumerated
    // ATS list + activeTab covers all known ATSs. Re-add when justified in v1.1.
    action: { default_title: 'OneClick Apply' },
    commands: {
      'fill-page': {
        suggested_key: { default: 'Ctrl+Shift+F', mac: 'Command+Shift+F' },
        description: 'Detect and fill all fields on the current page',
      },
    },
  },
});
