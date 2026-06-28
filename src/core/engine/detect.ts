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
].join(',');

// Radios share a name; collapse them into one DetectedField per group.
export function detectFields(root: ParentNode = document): DetectedField[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
  const seenRadioNames = new Set<string>();
  const out: DetectedField[] = [];

  for (const el of els) {
    if (!isVisible(el)) continue;
    const kind = classifyKind(el);

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
    const radios = document.querySelectorAll<HTMLInputElement>(
      `input[type=radio][name="${cssEscape(name)}"]`,
    );
    signals.options = Array.from(radios).map((r) => {
      const id = r.id;
      const lbl = id ? document.querySelector(`label[for="${cssEscape(id)}"]`) : r.closest('label');
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
