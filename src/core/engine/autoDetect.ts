import { resolveAll } from './resolve';
import type { FromContent } from '../messages';
import type { DetectedField } from '../types';

// Auto-redetect: watches for meaningful DOM changes (new form fields, navigation)
// and re-runs detection automatically. Designed to avoid race conditions with:
// 1. Fill operations (paused while filling)
// 2. Wizard runs (paused while wizard owns navigation)
// 3. Rapid DOM updates (debounced, throttled)
// 4. Overlapping detects (single in-flight lock)

// --- Configuration ---
const QUIET_MS = 600; // debounce: wait this long after last mutation
const THROTTLE_MS = 1500; // min gap between successive auto-detects
const SETTLE_AFTER_NAV_MS = 800; // wait after URL change before detecting

// --- Form-relevant selectors (only trigger redetect for these) ---
const FORM_SELECTORS = [
  'input',
  'textarea',
  'select',
  '[role=combobox]',
  '[role=listbox]',
  '[role=radiogroup]',
  '[role=group]',
  'button[aria-haspopup]',
  '[data-automation-id]',
  'form',
  'fieldset',
  '[class*=field]',
  '[class*=form]',
  '[class*=question]',
].join(',');

// --- State ---
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastDetectAt = 0;
let detecting = false;
let paused = false;
let origPushState: typeof history.pushState | null = null;
let origReplaceState: typeof history.replaceState | null = null;
let generation = 0; // monotonic counter to discard stale results
let lastUrl = '';
let lastFieldCount = 0;

type BroadcastFn = (msg: FromContent) => void;
type FieldsCallback = (fields: DetectedField[]) => void;

let broadcastRef: BroadcastFn = () => {};
let onFieldsRef: FieldsCallback = () => {};

/**
 * Pause auto-redetect. Call before filling or wizard runs.
 * Prevents detect→fill→detect feedback loops.
 */
export function pauseAutoDetect(): void {
  paused = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Resume auto-redetect. Call after fill/wizard completes.
 * Optionally triggers an immediate detect (e.g., after wizard step).
 */
export function resumeAutoDetect(detectNow = false): void {
  paused = false;
  if (detectNow) {
    scheduleDetect(0);
  }
}

function scheduleDetect(delayMs: number): void {
  if (paused || detecting) return;
  // Guard: if extension context was invalidated (reloaded), stop all auto-detection
  if (!chrome.runtime?.id) {
    stopAutoDetect();
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runDetect, delayMs);
}

async function runDetect(): Promise<void> {
  if (paused || detecting) return;
  if (!chrome.runtime?.id) {
    stopAutoDetect();
    return;
  } // context invalidated

  // Throttle: don't detect more than once per THROTTLE_MS
  const now = Date.now();
  const sinceLast = now - lastDetectAt;
  if (sinceLast < THROTTLE_MS) {
    scheduleDetect(THROTTLE_MS - sinceLast);
    return;
  }

  detecting = true;
  lastDetectAt = now;
  const gen = ++generation;

  try {
    const { fields, adapterId, multiStep } = await resolveAll();

    // Discard if a newer detect was triggered while we were resolving
    if (gen !== generation) return;

    // Avoid broadcasting if nothing meaningful changed (same field count + same uids)
    if (fields.length === lastFieldCount && !hasNewFields(fields)) return;
    lastFieldCount = fields.length;

    onFieldsRef(fields);
    broadcastRef({ type: 'DETECTED', fields, adapterId, multiStep });

    // Auto-fill high-confidence fields if enabled
    await autoFillFields(fields);
  } catch {
    // Page navigated or DOM is in a weird state — silently ignore
  } finally {
    detecting = false;
  }
}

// Track known field UIDs to detect actual changes (not just re-renders)
const knownUids = new Set<string>();

function hasNewFields(fields: DetectedField[]): boolean {
  let hasNew = false;
  const currentUids = new Set<string>();
  for (const f of fields) {
    currentUids.add(f.uid);
    if (!knownUids.has(f.uid)) hasNew = true;
  }
  // Also detect if fields were removed
  for (const uid of knownUids) {
    if (!currentUids.has(uid)) hasNew = true;
  }
  knownUids.clear();
  for (const uid of currentUids) knownUids.add(uid);
  return hasNew;
}

function isMeaningfulMutation(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    // Attribute changes on form-relevant elements (e.g., aria-expanded toggling a panel)
    if (m.type === 'attributes' && m.target instanceof HTMLElement) {
      if (m.target.matches(FORM_SELECTORS)) return true;
      // data-oca-uid changes are from our own detection — ignore
      if (m.attributeName === 'data-oca-uid') continue;
      if (m.attributeName === 'aria-expanded' || m.attributeName === 'aria-hidden') return true;
    }
    // Added/removed nodes that contain form elements
    if (m.type === 'childList') {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        if (el.matches(FORM_SELECTORS) || el.querySelector(FORM_SELECTORS)) return true;
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        if (el.matches(FORM_SELECTORS) || el.querySelector(FORM_SELECTORS)) return true;
      }
    }
  }
  return false;
}

function onMutations(mutations: MutationRecord[]): void {
  if (paused || detecting) return;
  if (!isMeaningfulMutation(mutations)) return;
  scheduleDetect(QUIET_MS);
}

function onUrlChange(): void {
  const url = location.href;
  if (url === lastUrl) return;
  lastUrl = url;
  scheduleDetect(SETTLE_AFTER_NAV_MS);
}

function onVisChange(): void {
  if (document.visibilityState === 'visible' && !paused) {
    scheduleDetect(QUIET_MS);
  }
}

// Track which field UIDs we've already auto-filled on this page (don't re-fill)
const autoFilledUids = new Set<string>();

/**
 * Auto-fill is DISABLED. The user must explicitly click "Fill all" in the side panel.
 * Auto-detection still runs (shows fields in the panel), but filling only happens on
 * explicit user action. This prevents wrong values being filled into search boxes,
 * unrelated fields, or low-confidence mappings.
 *
 * The only thing auto-detected is GDPR consent checkboxes (harmless, required to proceed).
 */
async function autoFillFields(_fields: DetectedField[]): Promise<void> {
  // Only auto-check consent checkboxes (privacy policy, terms) — these are safe
  autoCheckConsent();
}

const CONSENT_RE =
  /\b(privacy\s*policy|data\s*processing|terms\s*(and|&)\s*conditions|consent|gdpr|i\s*agree|i\s*accept|acknowledge)\b/i;

function autoCheckConsent(): void {
  // Only check consent boxes inside forms (not cookie banners, marketing opt-ins)
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    'form input[type="checkbox"]:not(:checked)',
  );
  for (const cb of checkboxes) {
    if (autoFilledUids.has(cb.getAttribute('data-oca-uid') ?? '')) continue;
    const label = cb.id ? document.querySelector(`label[for="${cb.id}"]`) : cb.closest('label');
    const text = (label?.textContent ?? '').trim();
    // Only consent/privacy checkboxes, NOT marketing ("cookie" removed — too broad)
    if (CONSENT_RE.test(text)) {
      cb.click();
    }
  }
}

/**
 * Start the auto-redetect system.
 * @param broadcast - function to send messages to side panel/background
 * @param onFields - callback to update local field state
 */
export function startAutoDetect(broadcast: BroadcastFn, onFields: FieldsCallback): void {
  broadcastRef = broadcast;
  onFieldsRef = onFields;
  lastUrl = location.href;

  // MutationObserver for DOM changes
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'aria-hidden', 'class', 'hidden'],
  });

  // URL change detection — save originals for cleanup
  origPushState = history.pushState.bind(history);
  origReplaceState = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPushState!(...args);
    onUrlChange();
  };
  history.replaceState = (...args) => {
    origReplaceState!(...args);
    onUrlChange();
  };
  window.addEventListener('popstate', onUrlChange);
  document.addEventListener('visibilitychange', onVisChange);
}

/**
 * Stop the auto-redetect system entirely (cleanup).
 */
export function stopAutoDetect(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  paused = true;
  // Restore original history methods
  if (origPushState) history.pushState = origPushState;
  if (origReplaceState) history.replaceState = origReplaceState;
  origPushState = null;
  origReplaceState = null;
  // Remove event listeners
  window.removeEventListener('popstate', onUrlChange);
  document.removeEventListener('visibilitychange', onVisChange);
}
