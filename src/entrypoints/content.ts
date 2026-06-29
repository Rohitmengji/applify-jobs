import { defineContentScript } from 'wxt/utils/define-content-script';
import { resolveAll } from '@/core/engine/resolve';
import { fillOne, fileFromB64, dropFileOnZone, attachFile, applyConfidenceOverlay } from '@/core/engine/fill';
import { matchAdapter } from '@/core/engine/adapters';
import { runWizard, waitForDomSettle } from '@/core/engine/wizard';
import { startObserver } from '@/core/engine/observer';
import { startAutoDetect, pauseAutoDetect, resumeAutoDetect } from '@/core/engine/autoDetect';
import type { ToContent, FromContent, ResolvedFill } from '@/core/messages';
import type { DetectedField } from '@/core/types';

// IMPLEMENTATION.md §15/§25 — runs inside the job page (and every iframe): detect,
// fill, drive the wizard. Each frame handles DETECT/FILL for ITS OWN document and
// returns its fields via sendResponse. The side panel enumerates frames
// (webNavigation.getAllFrames) and routes DETECT/FILL to each frameId explicitly, so
// iframe-embedded ATSes (iCIMS, embedded Greenhouse) are covered without any
// broadcast/merge race. The single-frame case is just "one frame, id 0".
export default defineContentScript({
  matches: ['https://*/*'], // broad in dev; narrow before publishing (§7/§21)
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
    startAutoDetect(
      broadcast,
      (fields) => {
        lastFields = fields;
      },
    );

    // The matched adapter's per-field fill override (if any), for tricky custom controls.
    const adapterOverride = () => {
      const a = matchAdapter(new URL(location.href), document);
      return a?.fillField ? (f: DetectedField, v: string) => a.fillField!(f, v) : undefined;
    };

    // Fills the currently-rendered step: re-detect, report to the side panel, fill.
    const fillStep = async () => {
      pauseAutoDetect(); // filling causes DOM mutations — don't re-trigger detect
      const { fields, adapterId, multiStep } = await resolveAll();
      lastFields = fields;
      broadcast({ type: 'DETECTED', fields, adapterId, multiStep });
      const override = adapterOverride();
      for (const f of fields.filter((x) => x.value != null)) {
        try {
          await fillOne(f, pendingFile ?? undefined, override);
          broadcast({ type: 'FIELD_FILLED', uid: f.uid, ok: true });
        } catch (e) {
          broadcast({ type: 'FIELD_FILLED', uid: f.uid, ok: false, error: String(e) });
        }
      }
      // Don't resume here — caller (WIZARD_NEXT/RUN) resumes when appropriate
    };

    chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
      (async () => {
        switch (msg.type) {
          case 'PING':
            sendResponse({ type: 'PONG' } satisfies FromContent);
            break;

          case 'GET_PAGE_INFO': {
            const { extractCompany, extractRole } = await import('@/core/engine/pageInfo');
            sendResponse({
              type: 'PAGE_INFO',
              company: extractCompany(document),
              role: extractRole(document),
              url: location.href,
            } satisfies FromContent);
            break;
          }

          case 'DETECT': {
            const { fields, adapterId, multiStep } = await resolveAll();
            lastFields = fields;
            sendResponse({ type: 'DETECTED', fields, adapterId, multiStep } satisfies FromContent);
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
                  const lel = document.querySelector<HTMLInputElement>(`[data-oca-uid="${lf.uid}"]`);
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
                  const lel = document.querySelector<HTMLInputElement>(`[data-oca-uid="${lf.uid}"]`);
                  if (!lel) continue;
                  const before = snapshot.get(lf.uid) ?? '';
                  const after = lel.value ?? '';
                  // If value changed (clobbered) and we had a value, re-fill
                  if (before && after !== before) {
                    try { await fillOne(lf, undefined, override); } catch { /* best effort */ }
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
            await fillMany(msg.fields, lastFields, pendingFile, broadcast, adapterOverride());
            resumeAutoDetect(true); // resume + redetect to pick up any new fields post-fill
            sendResponse({ type: 'STATUS', status: { phase: 'idle' } } satisfies FromContent);
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
            void runWizard(
              adapter,
              (status) => broadcast({ type: 'STATUS', status }),
              fillStep,
            ).then(() => {
              resumeAutoDetect(true); // wizard done, resume + detect final state
              broadcast({ type: 'STATUS', status: { phase: 'idle' } });
            });
            break;
          }
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
  let hasConditionalFill = false;
  const filled: DetectedField[] = [];

  for (const r of resolved) {
    const f = fields.find((x) => x.uid === r.uid);
    if (!f) continue;
    f.value = r.value;
    try {
      await fillOne(f, file ?? undefined, override);
      broadcast({ type: 'FIELD_FILLED', uid: r.uid, ok: true });
      filled.push(f);
      // Track if this fill might reveal conditional fields
      if (f.kind === 'select-native' || f.kind === 'select-custom' ||
          f.kind === 'radio-group' || f.kind === 'checkbox') {
        hasConditionalFill = true;
      }
    } catch (e) {
      broadcast({ type: 'FIELD_FILLED', uid: r.uid, ok: false, error: String(e) });
    }
  }

  // Apply confidence overlays in a single batch AFTER all fills (prevents per-field reflow)
  for (const f of filled) applyConfidenceOverlay(f);

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
