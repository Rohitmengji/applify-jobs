import { defineContentScript } from 'wxt/utils/define-content-script';
import { ATS_MATCH_PATTERNS } from '@/core/atsHosts';
import { resolveAll } from '@/core/engine/resolve';
import {
  fillOne,
  fileFromB64,
  dropFileOnZone,
  attachFile,
  applyConfidenceOverlay,
} from '@/core/engine/fill';
import { matchAdapter } from '@/core/engine/adapters';
import { fillRepeatableSections } from '@/core/engine/sections';
import { getProfile } from '@/core/storage/profileStore';
import { runWizard, waitForDomSettle } from '@/core/engine/wizard';
import { startObserver, pauseObserver, resumeObserver } from '@/core/engine/observer';
import { startAutoDetect, pauseAutoDetect, resumeAutoDetect } from '@/core/engine/autoDetect';
import { logError } from '@/core/errors';
import type { ToContent, FromContent, ResolvedFill } from '@/core/messages';
import type { DetectedField } from '@/core/types';

// IMPLEMENTATION.md §15/§25 — runs inside the job page (and every iframe): detect,
// fill, drive the wizard. Each frame handles DETECT/FILL for ITS OWN document and
// returns its fields via sendResponse. The side panel enumerates frames
// (webNavigation.getAllFrames) and routes DETECT/FILL to each frameId explicitly, so
// iframe-embedded ATSes (iCIMS, embedded Greenhouse) are covered without any
// broadcast/merge race. The single-frame case is just "one frame, id 0".
export default defineContentScript({
  // Auto-inject only on known ATS domains (single source of truth: src/core/atsHosts.ts).
  // Generic / self-hosted career sites are injected on demand by the side panel via
  // chrome.scripting when the user opens the panel there (§7/§21).
  matches: ATS_MATCH_PATTERNS,
  allFrames: true,
  runAt: 'document_idle',

  main() {
    let lastFields: DetectedField[] = [];
    let pendingFile: File | null = null;

    // Start passively observing user interactions to learn field answers for future fills
    startObserver();

    const broadcast = (msg: FromContent) => {
      // Guard against "Extension context invalidated" — happens when the extension
      // is reloaded while pages are still open. Silently stop all operations.
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage(msg).catch(() => {
        /* no listener (side panel closed) — fine */
      });
    };

    // Start auto-redetect: watches DOM changes and re-runs detection automatically.
    // This replaces the need for manual "Re-detect" clicks in most cases.
    startAutoDetect(broadcast, (fields) => {
      lastFields = fields;
    });

    // The matched adapter's per-field fill override (if any), for tricky custom controls.
    const adapterOverride = () => {
      const a = matchAdapter(new URL(location.href), document);
      return a?.fillField ? (f: DetectedField, v: string) => a.fillField!(f, v) : undefined;
    };

    // Fills the currently-rendered step: re-detect, report to the side panel, fill.
    const fillStep = async () => {
      pauseAutoDetect();
      pauseObserver(); // don't record our programmatic fills as "user interactions"
      const { fields, adapterId, multiStep } = await resolveAll();
      lastFields = fields;
      broadcast({ type: 'DETECTED', fields, adapterId, multiStep });
      const override = adapterOverride();
      for (const f of fields.filter((x) => x.value != null)) {
        try {
          await fillOne(f, f.kind === 'file' ? (pendingFile ?? undefined) : undefined, override);
          broadcast({ type: 'FIELD_FILLED', uid: f.uid, ok: true });
        } catch (e) {
          broadcast({ type: 'FIELD_FILLED', uid: f.uid, ok: false, error: String(e) });
          void logError({ component: 'fill', message: String(e), fieldUid: f.uid });
        }
      }
      resumeObserver(); // re-enable learning from user interactions
      // Don't resume autoDetect here — caller (WIZARD_NEXT/RUN) resumes when appropriate
    };

    // In-flight lock — prevent concurrent DETECT/FILL/WIZARD from overlapping
    let inFlight = false;

    chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
      (async () => {
        // PING is always allowed (side panel health check)
        if (msg.type === 'PING') {
          sendResponse({ type: 'PONG' } satisfies FromContent);
          return;
        }
        // Block concurrent operations (except PING and GET_PAGE_INFO)
        if (inFlight && msg.type !== 'GET_PAGE_INFO') {
          sendResponse({
            type: 'STATUS',
            status: { phase: 'error', message: 'busy' },
          } satisfies FromContent);
          return;
        }
        // GET_PAGE_INFO is a read that runs even during a WIZARD_RUN; it must NOT take or
        // release the lock, or it would clear inFlight mid-run and let a concurrent op in.
        if (msg.type !== 'GET_PAGE_INFO') inFlight = true;
        try {
          switch (msg.type) {
            case 'GET_PAGE_INFO': {
              const { extractCompany, extractRole, extractDescription } =
                await import('@/core/engine/pageInfo');
              sendResponse({
                type: 'PAGE_INFO',
                company: extractCompany(document),
                role: extractRole(document),
                url: location.href,
                description: extractDescription(document),
              } satisfies FromContent);
              break;
            }

            case 'DETECT': {
              const { fields, adapterId, multiStep } = await resolveAll();
              lastFields = fields;
              sendResponse({
                type: 'DETECTED',
                fields,
                adapterId,
                multiStep,
              } satisfies FromContent);
              break;
            }

            case 'FILL_FILE': {
              pauseAutoDetect();
              pendingFile = fileFromB64(msg.b64, msg.filename, msg.mime);
              const f = lastFields.find((x) => x.uid === msg.uid);
              let ok = false;
              if (f) {
                // Snapshot current field values BEFORE upload (to detect clobbering)
                const snapshot = new Map<string, string>();
                for (const lf of lastFields) {
                  if (lf.value && lf.uid !== msg.uid) {
                    const lel = document.querySelector<HTMLInputElement>(
                      `[data-oca-uid="${lf.uid}"]`,
                    );
                    if (lel?.value) snapshot.set(lf.uid, lel.value);
                  }
                }

                const el = document.querySelector<HTMLElement>(`[data-oca-uid="${f.uid}"]`);
                if (el instanceof HTMLInputElement && el.type === 'file') {
                  attachFile(el, pendingFile);
                  ok = true;
                } else if (el) {
                  dropFileOnZone(el, pendingFile);
                  ok = true;
                }

                // Wait for ATS resume parse to complete (may overwrite fields)
                if (ok) {
                  await waitForDomSettle({ quietMs: 1000, timeoutMs: 5000 });
                  // Re-fill any fields that got clobbered by the resume parser
                  const override = adapterOverride();
                  for (const lf of lastFields) {
                    if (!lf.value || lf.uid === msg.uid) continue;
                    const lel = document.querySelector<HTMLInputElement>(
                      `[data-oca-uid="${lf.uid}"]`,
                    );
                    if (!lel) continue;
                    const before = snapshot.get(lf.uid) ?? '';
                    const after = lel.value ?? '';
                    // If value changed (clobbered) and we had a value, re-fill
                    if (before && after !== before) {
                      try {
                        await fillOne(lf, undefined, override);
                      } catch {
                        /* best effort */
                      }
                    }
                  }
                }
              }
              resumeAutoDetect(false);
              sendResponse({ type: 'FIELD_FILLED', uid: msg.uid, ok } satisfies FromContent);
              break;
            }

            case 'FILL': {
              pauseAutoDetect(); // prevent detect→fill→detect loop
              pendingFile = null; // clear stale file from previous FILL_FILE
              await fillMany(msg.fields, lastFields, pendingFile, broadcast, adapterOverride());
              resumeAutoDetect(true); // resume + redetect to pick up any new fields post-fill
              sendResponse({ type: 'STATUS', status: { phase: 'idle' } } satisfies FromContent);
              break;
            }

            case 'VERIFY': {
              // Read back DOM values of filled fields to verify they stuck.
              const mismatches: { uid: string; expected: string; actual: string }[] = [];
              for (const uid of msg.uids) {
                const el = document.querySelector<HTMLElement>(`[data-oca-uid="${uid}"]`);
                if (!el) continue;
                const filled = lastFields.find((f) => f.uid === uid);
                if (!filled?.value) continue;
                let actual = '';
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                  actual = el.value;
                } else if (el instanceof HTMLSelectElement) {
                  actual = el.selectedOptions[0]?.text ?? el.value;
                }
                if (
                  actual &&
                  actual !== filled.value &&
                  actual.toLowerCase() !== filled.value.toLowerCase()
                ) {
                  mismatches.push({ uid, expected: filled.value, actual });
                }
              }
              sendResponse({ type: 'VERIFY_RESULT', mismatches } satisfies FromContent);
              break;
            }

            case 'FILL_SECTIONS': {
              // Fill the repeatable Work Experience / Education sections. This mutates the DOM
              // (adds rows), so pause autoDetect/observer for the whole run — the section
              // driver is internally bounded and timeout-guarded so it can never hang.
              pauseAutoDetect();
              pauseObserver();
              let sectionResult = {
                experience: 0,
                education: 0,
                expFound: false,
                eduFound: false,
              };
              try {
                const profile = await getProfile();
                const adapter = matchAdapter(new URL(location.href), document);
                sectionResult = await fillRepeatableSections(profile, adapter?.id ?? null);
              } catch {
                /* section fill is best-effort — never break the page */
              }
              resumeObserver();
              resumeAutoDetect(true); // re-detect: rows we added are new fillable fields
              sendResponse({
                type: 'SECTIONS_RESULT',
                ...sectionResult,
              } satisfies FromContent);
              break;
            }

            case 'FILL_AND_NEXT': {
              // Generic "fill current step + click Next" — works without an adapter.
              pauseAutoDetect();
              await fillStep();
              // Find a Next/Continue/Save button generically
              const nextBtn = findGenericNextButton(document);
              if (nextBtn) {
                nextBtn.click();
                await waitForDomSettle();
                // Detect new fields on the next step
                const r = await resolveAll();
                lastFields = r.fields;
                broadcast({
                  type: 'DETECTED',
                  fields: r.fields,
                  adapterId: r.adapterId,
                  multiStep: r.multiStep,
                });
              }
              resumeAutoDetect(false);
              sendResponse({
                type: 'STATUS',
                status: { phase: nextBtn ? 'ready' : 'idle', step: 0 },
              } satisfies FromContent);
              break;
            }

            case 'WIZARD_NEXT': {
              pauseAutoDetect(); // wizard owns navigation
              const adapter = matchAdapter(new URL(location.href), document);
              await fillStep();
              const next = adapter?.findNextButton?.(document);
              if (next) {
                next.click();
                await waitForDomSettle();
              }
              // Broadcast the NEW step's fields so the side panel's listener updates state
              const r = await resolveAll();
              lastFields = r.fields;
              broadcast({
                type: 'DETECTED',
                fields: r.fields,
                adapterId: r.adapterId,
                multiStep: r.multiStep,
              });
              resumeAutoDetect(false); // resume watching, don't double-detect
              sendResponse({
                type: 'STATUS',
                status: { phase: 'ready', step: 0 },
              } satisfies FromContent);
              break;
            }

            case 'WIZARD_RUN': {
              pauseAutoDetect(); // wizard owns the entire multi-step run
              const adapter = matchAdapter(new URL(location.href), document);
              if (!adapter) {
                // The finally clause skips WIZARD_RUN (the run releases the lock in its
                // .then/.catch), but we bail BEFORE starting the run — so release it here or
                // the content script deadlocks on every later message.
                inFlight = false;
                resumeAutoDetect(false);
                sendResponse({
                  type: 'STATUS',
                  status: { phase: 'error', message: 'no adapter' },
                } satisfies FromContent);
                break;
              }
              // Acknowledge immediately, then drive the (possibly minutes-long, multi-step)
              // run via STATUS/DETECTED broadcasts. Holding the message port open across
              // steps risks "port closed" if the page navigates mid-run (finding #10).
              sendResponse({
                type: 'STATUS',
                status: { phase: 'filling', step: 0 },
              } satisfies FromContent);
              void runWizard(adapter, (status) => broadcast({ type: 'STATUS', status }), fillStep)
                .then(() => {
                  inFlight = false;
                  resumeAutoDetect(true);
                  broadcast({ type: 'STATUS', status: { phase: 'idle' } });
                })
                .catch(() => {
                  inFlight = false;
                  resumeAutoDetect(true);
                  broadcast({
                    type: 'STATUS',
                    status: { phase: 'error', message: 'wizard failed' },
                  });
                });
              break;
            }
          }
        } catch (e) {
          // Never leave the channel open (we `return true`) if a case throws before
          // responding — that would leak the port and hang the side panel.
          sendResponse({
            type: 'STATUS',
            status: { phase: 'error', message: String(e) },
          } satisfies FromContent);
        } finally {
          // WIZARD_RUN sets inFlight but runs async — release lock in its .then/.catch.
          // GET_PAGE_INFO never took the lock, so it must never release it either.
          if (msg.type !== 'WIZARD_RUN' && msg.type !== 'GET_PAGE_INFO') inFlight = false;
        }
      })();
      return true; // keep the channel open for the async sendResponse
    });
  },
});

async function fillMany(
  resolved: ResolvedFill[],
  fields: DetectedField[],
  file: File | null,
  broadcast: (m: FromContent) => void,
  override?: (f: DetectedField, value: string) => Promise<boolean>,
): Promise<void> {
  pauseObserver(); // don't record our fills as user interactions
  let hasConditionalFill = false;
  const filled: DetectedField[] = [];

  for (const r of resolved) {
    // Skip fields that shouldn't be filled (search boxes, filters, navigation inputs)
    const f = fields.find((x) => x.uid === r.uid);
    if (!f) continue;
    if (shouldSkipFill(f)) continue;
    f.value = r.value;
    try {
      await fillOne(f, file ?? undefined, override);
      broadcast({ type: 'FIELD_FILLED', uid: r.uid, ok: true });
      filled.push(f);
      // Track if this fill might reveal conditional fields
      if (
        f.kind === 'select-native' ||
        f.kind === 'select-custom' ||
        f.kind === 'radio-group' ||
        f.kind === 'checkbox'
      ) {
        hasConditionalFill = true;
      }
    } catch (e) {
      broadcast({ type: 'FIELD_FILLED', uid: r.uid, ok: false, error: String(e) });
    }
  }

  // Apply confidence overlays in a single batch AFTER all fills (prevents per-field reflow)
  for (const f of filled) applyConfidenceOverlay(f);
  resumeObserver(); // re-enable learning from user interactions

  // After filling selects/radios/checkboxes, wait for any conditional fields to appear
  // and re-detect so the side panel can show them (§25: conditional field re-detect).
  if (hasConditionalFill) {
    await new Promise((r) => setTimeout(r, 500)); // let DOM settle
    const { fields: newFields, adapterId, multiStep } = await resolveAll();
    const oldUids = new Set(fields.map((f) => f.uid));
    const hasNew = newFields.some((f) => !oldUids.has(f.uid));
    if (hasNew) {
      // Broadcast updated fields so the side panel shows the new conditional fields
      broadcast({ type: 'DETECTED', fields: newFields, adapterId, multiStep });
    }
  }
}

// Generic heuristic to find "Next"/"Continue"/"Save & Continue" buttons on any site.
// Excludes Submit buttons (we never auto-submit) and disabled/hidden buttons.
function findGenericNextButton(doc: Document): HTMLElement | null {
  const NEXT_RE = /^(next|continue|save\s*&?\s*continue|proceed|go\s*to\s*next)/i;
  const SUBMIT_RE = /^submit/i;
  const els = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'button, input[type=submit], input[type=button], a[role=button], [role=button]',
    ),
  );
  return (
    els.find((b) => {
      if ((b as HTMLButtonElement | HTMLInputElement).disabled) return false;
      const style = doc.defaultView?.getComputedStyle(b);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      const text = (b.textContent || (b as HTMLInputElement).value || '').trim();
      // Match "Next"/"Continue" but NOT "Submit" (never auto-submit)
      return NEXT_RE.test(text) && !SUBMIT_RE.test(text);
    }) ?? null
  );
}

// Fields that should NEVER be filled — search boxes, filters, navigation inputs.
// These get detected by the generic detector but aren't part of the application form.
const SKIP_FILL_RE = /search|filter|keyword|find.*job|query|autocomplete.*search|nav/i;

function shouldSkipFill(f: DetectedField): boolean {
  const label = (
    f.signals.label ||
    f.signals.placeholder ||
    f.signals.ariaLabel ||
    ''
  ).toLowerCase();

  // Skip search/filter/navigation inputs
  if (SKIP_FILL_RE.test(label)) return true;

  // Skip if confidence is very low (likely a mis-mapping)
  if (f.confidence > 0 && f.confidence < 0.5) return true;

  // Skip if the element is inside a search form or navigation
  const el = document.querySelector(`[data-oca-uid="${f.uid}"]`);
  if (el) {
    const form = el.closest('form');
    if (form) {
      const role = form.getAttribute('role') ?? '';
      if (role === 'search') return true;
      const action = form.getAttribute('action') ?? '';
      if (/search|find|filter/i.test(action)) return true;
    }
    // Skip if inside a navigation, header, or sidebar element
    if (
      el.closest(
        'nav, header, [role=navigation], [role=search], [class*=search-bar], [class*=navbar]',
      )
    ) {
      return true;
    }
  }

  return false;
}
