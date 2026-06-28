import { defineContentScript } from 'wxt/utils/define-content-script';
import { resolveAll } from '@/core/engine/resolve';
import { fillOne, fileFromB64, dropFileOnZone, attachFile } from '@/core/engine/fill';
import { matchAdapter } from '@/core/engine/adapters';
import { runWizard, waitForDomSettle } from '@/core/engine/wizard';
import type { ToContent, FromContent, ResolvedFill } from '@/core/messages';
import type { DetectedField } from '@/core/types';

// IMPLEMENTATION.md §15 — runs inside the job page: detect, fill, drive the wizard.
//
// allFrames is FALSE for now. Greenhouse-hosted (job-boards) and Lever forms live in
// the top frame, so this is correct and predictable for M2. iframe-embedded ATSes
// (iCIMS, embedded Greenhouse) need allFrames:true PLUS frame-merge routing — that
// lands in M5 (§25 "Iframes"). Enabling allFrames before the merge logic would let an
// empty top frame answer DETECT first on iframe sites.
export default defineContentScript({
  matches: ['https://*/*'], // broad in dev; narrow before publishing (§7/§21)
  allFrames: false,
  runAt: 'document_idle',

  main() {
    let lastFields: DetectedField[] = [];
    let pendingFile: File | null = null;

    const broadcast = (msg: FromContent) => {
      chrome.runtime.sendMessage(msg).catch(() => {
        /* no listener (side panel closed) — fine */
      });
    };

    // Fills the currently-rendered step: re-detect, report to the side panel, fill.
    const fillStep = async () => {
      const { fields, adapterId, multiStep } = await resolveAll();
      lastFields = fields;
      broadcast({ type: 'DETECTED', fields, adapterId, multiStep });
      for (const f of fields.filter((x) => x.value != null)) {
        try {
          await fillOne(f, pendingFile ?? undefined);
          broadcast({ type: 'FIELD_FILLED', uid: f.uid, ok: true });
        } catch (e) {
          broadcast({ type: 'FIELD_FILLED', uid: f.uid, ok: false, error: String(e) });
        }
      }
    };

    chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
      (async () => {
        switch (msg.type) {
          case 'PING':
            sendResponse({ type: 'PONG' } satisfies FromContent);
            break;

          case 'DETECT': {
            const { fields, adapterId, multiStep } = await resolveAll();
            lastFields = fields;
            sendResponse({ type: 'DETECTED', fields, adapterId, multiStep } satisfies FromContent);
            break;
          }

          case 'FILL_FILE': {
            pendingFile = fileFromB64(msg.b64, msg.filename, msg.mime);
            const f = lastFields.find((x) => x.uid === msg.uid);
            let ok = false;
            if (f) {
              const el = document.querySelector<HTMLElement>(`[data-oca-uid="${f.uid}"]`);
              if (el instanceof HTMLInputElement && el.type === 'file') {
                attachFile(el, pendingFile);
                ok = true;
              } else if (el) {
                dropFileOnZone(el, pendingFile);
                ok = true;
              }
            }
            sendResponse({ type: 'FIELD_FILLED', uid: msg.uid, ok } satisfies FromContent);
            break;
          }

          case 'FILL': {
            await fillMany(msg.fields, lastFields, pendingFile, broadcast);
            sendResponse({ type: 'STATUS', status: { phase: 'idle' } } satisfies FromContent);
            break;
          }

          case 'WIZARD_NEXT': {
            const adapter = matchAdapter(new URL(location.href), document);
            await fillStep();
            const next = adapter?.findNextButton?.(document);
            if (next) {
              next.click();
              await waitForDomSettle();
            }
            // Broadcast the NEW step's fields so the side panel's listener updates state
            // (the sendResponse reply alone isn't consumed by the panel). Finding #3.
            const r = await resolveAll();
            lastFields = r.fields;
            broadcast({
              type: 'DETECTED',
              fields: r.fields,
              adapterId: r.adapterId,
              multiStep: r.multiStep,
            });
            sendResponse({
              type: 'STATUS',
              status: { phase: 'ready', step: 0 },
            } satisfies FromContent);
            break;
          }

          case 'WIZARD_RUN': {
            const adapter = matchAdapter(new URL(location.href), document);
            if (!adapter) {
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
            ).then(() => broadcast({ type: 'STATUS', status: { phase: 'idle' } }));
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
): Promise<void> {
  for (const r of resolved) {
    const f = fields.find((x) => x.uid === r.uid);
    if (!f) continue;
    f.value = r.value;
    try {
      await fillOne(f, file ?? undefined);
      broadcast({ type: 'FIELD_FILLED', uid: r.uid, ok: true });
    } catch (e) {
      broadcast({ type: 'FIELD_FILLED', uid: r.uid, ok: false, error: String(e) });
    }
  }
}
