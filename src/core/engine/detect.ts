import { classifyKind, extractSignals } from './signals';
import { cssEscape } from './css';
import type { DetectedField, FieldKind, FieldSignals } from '../types';

// IMPLEMENTATION.md §11.1 — walk the document for fillable controls, assign a
// stable uid (written to data-oca-uid so we can find the element after re-render),
// and gather every signal.

const SELECTOR = [
  'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset])',
  'textarea',
  'select',
  '[role=combobox]',
  '[role=listbox]',
  // Custom dropdown / combobox triggers (Workday "Select One", React-Select, etc.).
  // classifyKind() decides which of these are real select-custom controls; the rest
  // come back 'unknown' and are dropped below, so menu/disclosure buttons don't clutter.
  'button[aria-haspopup]',
  '[aria-haspopup=listbox]',
  '[aria-haspopup=menu]',
  '[aria-expanded][aria-controls]',
  '[aria-expanded][aria-owns]',
  '[role=button][aria-expanded]',
  // Workday-specific: data-automation-id powered widgets
  '[data-automation-id*="formField"] input',
  '[data-automation-id*="formField"] select',
  '[data-automation-id*="formField"] [role=combobox]',
  '[data-automation-id*="multiselectContainer"]',
  '[data-automation-id*="dateWidget"] input',
  // Generic ARIA patterns for custom inputs
  '[role=spinbutton]',
  '[contenteditable=true][role=textbox]',
].join(',');

// Radios share a name; collapse them into one DetectedField per group.
export function detectFields(root: ParentNode = document): DetectedField[] {
  // Collect elements from the root AND any shadow roots (§25: Shadow DOM traversal)
  const els = querySelectorDeep(root, SELECTOR);
  const seenRadioNames = new Set<string>();
  const out: DetectedField[] = [];

  for (const el of els) {
    if (!isVisible(el)) continue;
    const kind = classifyKind(el);
    if (kind === 'unknown') continue; // over-captured trigger (menu/disclosure) — not a field

    if (kind === 'radio-group') {
      const name = el.getAttribute('name') ?? '';
      if (!name || seenRadioNames.has(name)) continue;
      seenRadioNames.add(name);
    }

    const uid = el.getAttribute('data-oca-uid') ?? crypto.randomUUID();
    el.setAttribute('data-oca-uid', uid);

    out.push({
      uid,
      kind,
      signals: enrichRadioOptions(el, kind),
      mappedKey: null,
      confidence: 0,
      value: null,
      source: 'none',
      filled: false,
    });
  }
  return out;
}

function enrichRadioOptions(el: HTMLElement, kind: FieldKind): FieldSignals {
  const signals = extractSignals(el);
  if (kind === 'radio-group') {
    const name = el.getAttribute('name') ?? '';
    // Scope to the element's root node so radios/labels inside a shadow root are found.
    const root = el.getRootNode() as ParentNode;
    const radios = root.querySelectorAll<HTMLInputElement>(
      `input[type=radio][name="${cssEscape(name)}"]`,
    );
    signals.options = Array.from(radios).map((r) => {
      const id = r.id;
      const lbl = id ? root.querySelector(`label[for="${cssEscape(id)}"]`) : r.closest('label');
      return (lbl?.textContent ?? r.value).replace(/\s+/g, ' ').trim();
    });
    // label of the *group* is usually a fieldset legend
    const legend = el.closest('fieldset')?.querySelector('legend')?.textContent;
    if (legend && !signals.label) signals.label = legend.replace(/\s+/g, ' ').trim();
  }
  return signals;
}

function isVisible(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  // jsdom reports 0×0 for everything; treat the absence of layout as "visible"
  // so fixture tests still see fields. Real browsers report real geometry.
  if (r.width === 0 && r.height === 0) {
    return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
  }
  return true;
}

/**
 * querySelectorAll that pierces shadow DOM boundaries.
 * Walks the tree recursively, collecting matching elements from each shadow root.
 * Falls back to standard querySelectorAll when no shadow roots exist (the common case).
 */
function querySelectorDeep(root: ParentNode, selector: string): HTMLElement[] {
  const results = Array.from(root.querySelectorAll<HTMLElement>(selector));

  // Walk all elements looking for shadow roots
  const walk = (node: ParentNode) => {
    const children = node.querySelectorAll('*');
    for (const child of children) {
      if (child.shadowRoot) {
        results.push(...Array.from(child.shadowRoot.querySelectorAll<HTMLElement>(selector)));
        walk(child.shadowRoot);
      }
    }
  };
  walk(root);
  return results;
}
