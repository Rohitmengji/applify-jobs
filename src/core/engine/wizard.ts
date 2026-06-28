import type { SiteAdapter } from './adapters/types';
import type { WizardStatus } from '../types';

// IMPLEMENTATION.md §13 — multi-step wizard state machine.
// Never clicks final submit; stops at review.

// DOM-settle wait (MutationObserver, debounced, with timeout). Never sleep-and-hope.
export function waitForDomSettle(
  opts: { quietMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const quietMs = opts.quietMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 8000;
  return new Promise((resolve) => {
    let quietTimer: number;
    const done = () => {
      obs.disconnect();
      clearTimeout(hardTimer);
      clearTimeout(quietTimer);
      resolve();
    };
    const obs = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = window.setTimeout(done, quietMs);
    });
    const hardTimer = window.setTimeout(done, timeoutMs);
    quietTimer = window.setTimeout(done, quietMs);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

// Wizard runner. `fillStep` fills the currently-rendered step (wired up by the
// content script: re-detect, report to the side panel, fill each field).
export async function runWizard(
  adapter: SiteAdapter,
  emitStatus: (s: WizardStatus) => void,
  fillStep: () => Promise<void>,
  maxSteps = 15,
): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    if (adapter.isReviewStep?.(document)) {
      emitStatus({ phase: 'review', step });
      return;
    }
    emitStatus({ phase: 'filling', step });
    await fillStep();

    const next = adapter.findNextButton?.(document);
    if (!next) {
      emitStatus({ phase: 'review', step }); // no next → treat as end
      return;
    }
    next.click();
    await waitForDomSettle();
    emitStatus({ phase: 'ready', step: step + 1 });
  }
  emitStatus({ phase: 'error', message: 'exceeded max steps' });
}
