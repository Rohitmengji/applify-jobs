import { classifyKind, extractSignals } from './signals';
import { fieldFingerprint } from './learn';
import type { DetectedField } from '../types';

// Passive interaction observer — watches the user fill fields manually (typing, selecting,
// clicking radios/checkboxes) and records those values so future visits to similar forms
// auto-fill using the learned entries. Runs in the content script.
//
// NOTE: We do NOT import Dexie/learnStore here — that would pull Dexie's U+FFFF constant
// into the content script bundle, which Chrome rejects as "not UTF-8". Instead, we send
// a message to the background worker which does the actual storage write.

const DEBOUNCE_MS = 1500; // wait for user to stop typing before recording
const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
const recorded = new WeakSet<HTMLElement>(); // don't double-record within one page load

function getAdapterId(): string | null {
  // Use hostname as a rough ATS identifier for non-adapter sites
  return location.hostname.replace(/^www\./, '');
}

function elementToDetectedField(el: HTMLElement): DetectedField | null {
  const kind = classifyKind(el);
  if (kind === 'unknown' || kind === 'file') return null;
  const uid = el.getAttribute('data-oca-uid') ?? '';
  return {
    uid,
    kind,
    signals: extractSignals(el),
    mappedKey: null,
    confidence: 0,
    value: null,
    source: 'manual',
    filled: false,
  };
}

function getValue(el: HTMLElement): string | null {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
    if (el.type === 'radio') {
      // For radio, get the label of the selected option
      const lbl = el.id
        ? document.querySelector(`label[for="${el.id}"]`)
        : el.closest('label');
      return (lbl?.textContent ?? el.value).trim();
    }
    return el.value.trim();
  }
  if (el instanceof HTMLTextAreaElement) return el.value.trim();
  if (el instanceof HTMLSelectElement) {
    return el.selectedOptions[0]?.text?.trim() ?? el.value;
  }
  // Custom dropdown — check aria-label or text content after selection
  const selected = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
  return selected || null;
}

function shouldRecord(el: HTMLElement): boolean {
  // Don't record password fields or hidden inputs
  if (el instanceof HTMLInputElement) {
    if (el.type === 'password' || el.type === 'hidden') return false;
  }
  // Only record if the element has a label we can fingerprint
  const field = elementToDetectedField(el);
  if (!field) return false;
  const fp = fieldFingerprint(field);
  const label = fp.split('|')[1] ?? '';
  return label.length > 1;
}

function recordField(el: HTMLElement) {
  if (recorded.has(el)) return;
  const value = getValue(el);
  if (!value) return;

  const field = elementToDetectedField(el);
  if (!field) return;

  const fingerprint = fieldFingerprint(field);
  const label = fingerprint.split('|')[1] ?? '';
  if (label.length <= 1) return;

  recorded.add(el);
  const adapterId = getAdapterId();
  // Send to background for storage (avoids pulling Dexie into content script).
  // Guard: if extension context is invalidated (reloaded), silently no-op.
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage({
    type: 'LEARN_FIELD',
    entries: [{ fingerprint, key: null, value }],
    adapterId,
  }).catch(() => {});
}

function handleChange(e: Event) {
  // Skip programmatic events (our own fills) — only record real user interactions
  if (!e.isTrusted) return;
  const el = e.target as HTMLElement;
  if (!el || !shouldRecord(el)) return;

  // For radios/checkboxes/selects, record immediately
  if (
    el instanceof HTMLInputElement &&
    (el.type === 'radio' || el.type === 'checkbox')
  ) {
    recordField(el);
    return;
  }
  if (el instanceof HTMLSelectElement) {
    recordField(el);
    return;
  }

  // For text inputs, debounce
  const prev = timers.get(el);
  if (prev) clearTimeout(prev);
  timers.set(
    el,
    setTimeout(() => {
      timers.delete(el);
      recordField(el);
    }, DEBOUNCE_MS),
  );
}

function handleBlur(e: Event) {
  if (!e.isTrusted) return; // skip our programmatic blur events
  const el = e.target as HTMLElement;
  if (!el || !shouldRecord(el)) return;
  // On blur, record immediately (user moved on)
  const prev = timers.get(el);
  if (prev) {
    clearTimeout(prev);
    timers.delete(el);
  }
  recordField(el);
}

let observing = false;

/**
 * Start passively observing user interactions on the page.
 * Call once per content-script lifecycle. Captures:
 * - Text typed into inputs/textareas (debounced)
 * - Select/dropdown changes
 * - Radio button selections
 * - Checkbox toggles
 */
export function startObserver(): void {
  if (observing) return;
  observing = true;

  // Use capture phase to catch events before frameworks stop propagation
  document.addEventListener('change', handleChange, { capture: true, passive: true });
  document.addEventListener('input', handleChange, { capture: true, passive: true });
  document.addEventListener('blur', handleBlur, { capture: true, passive: true });

  // Also observe clicks on custom dropdown options (for frameworks that don't fire change)
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      // If the clicked element is a dropdown option, find the trigger and record
      const option = target.closest('[role=option], [data-automation-id*="promptOption"]');
      if (option) {
        // Find the associated combobox/trigger
        const listbox = option.closest('[role=listbox], ul');
        const controlledBy = listbox?.id;
        const trigger = controlledBy
          ? document.querySelector<HTMLElement>(`[aria-controls="${controlledBy}"], [aria-owns="${controlledBy}"]`)
          : null;
        if (trigger && shouldRecord(trigger)) {
          // Wait for the framework to update the trigger's display value
          setTimeout(() => recordField(trigger), 200);
        }
      }
    },
    { capture: true, passive: true },
  );
}
