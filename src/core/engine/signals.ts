import type { FieldSignals, FieldKind } from '../types';
import { cssEscape } from './css';

// IMPLEMENTATION.md §11.1 — extract every signal we can read off a control, robustly
// across ATSes (Workday/iCIMS/etc.) and custom ARIA widgets.

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\*+$/, '').trim();

// Interactive controls — used to (a) count fields in a container and (b) exclude a
// control's own value text when reading a label.
const CONTROL_SEL =
  'input,select,textarea,button,[role=textbox],[role=combobox],[role=listbox],[role=button],[role=spinbutton],[role=slider]';

function isControl(el: Element): boolean {
  try {
    return el.matches(CONTROL_SEL);
  } catch {
    return false;
  }
}
function countControls(node: Element): number {
  return node.querySelectorAll(CONTROL_SEL).length;
}

// Visible text of a node, EXCLUDING the values of nested interactive controls — so a
// wrapping label or a field-group never contributes the field's own typed/selected value
// (e.g. a Workday dropdown button's "Select One").
function textOf(node: Element): string {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) out += c.textContent ?? '';
    else if (c.nodeType === Node.ELEMENT_NODE) {
      const e = c as Element;
      if (!isControl(e)) out += ' ' + textOf(e);
    }
  });
  return clean(out);
}

const POPUP = new Set(['listbox', 'menu', 'dialog', 'tree', 'grid', 'true']);
const POPUP_ROLE = new Set(['listbox', 'menu', 'tree', 'grid', 'dialog']);

function byId(el: Element, id: string): Element | null {
  const root = el.getRootNode();
  if (root && 'getElementById' in root) return (root as Document).getElementById(id);
  return document.getElementById(id);
}

export function classifyKind(el: Element): FieldKind {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select-native';
  if (el instanceof HTMLInputElement) {
    switch (el.type) {
      case 'email':
        return 'email';
      case 'tel':
        return 'tel';
      case 'url':
        return 'url';
      case 'number':
        return 'number';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio-group';
      case 'file':
        return 'file';
      case 'date':
      case 'month':
        return 'date';
      default:
        return 'text';
    }
  }

  // Custom (div/button) selects & comboboxes.
  const role = (el.getAttribute('role') ?? '').toLowerCase();
  if (role === 'combobox' || role === 'listbox') return 'select-custom';

  // Workday "Select One" and most ARIA custom selects: a trigger with aria-haspopup.
  if (POPUP.has((el.getAttribute('aria-haspopup') ?? '').toLowerCase())) return 'select-custom';

  // An expanded trigger that controls a listbox-like popup (when haspopup is absent).
  if (el.hasAttribute('aria-expanded')) {
    const ref = (el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || '').split(
      /\s+/,
    )[0];
    if (ref) {
      const target = byId(el, ref);
      const trole = (target?.getAttribute('role') ?? '').toLowerCase();
      if (POPUP_ROLE.has(trole) || target?.querySelector('[role=option]')) return 'select-custom';
    }
  }

  return 'unknown';
}

// Resolve a control's human label — priority cascade, first non-empty wins. Robust to
// custom widgets with no <label for> (Workday/iCIMS), shadow DOM, and value-bearing
// aria-labelledby refs.
export function getLabelText(el: Element): string {
  // 1) aria-labelledby — join referenced nodes, but SKIP refs inside `el` (those are the
  //    control's own value, e.g. the "Select One" span) and empty ones.
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const parts = labelledby
      .split(/\s+/)
      .map((id) => byId(el, id))
      .filter((n): n is Element => !!n && !el.contains(n))
      .map((n) => textOf(n))
      .filter(Boolean);
    if (parts.length) return clean(parts.join(' '));
  }

  // 2) aria-label
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return clean(aria);

  // 3) label[for=id]
  const id = el.getAttribute('id');
  if (id) {
    const root = el.getRootNode() as Document; // Document | ShadowRoot | Element — all have querySelector
    const lbl = root.querySelector(`label[for="${cssEscape(id)}"]`);
    if (lbl) {
      const t = textOf(lbl);
      if (t) return t;
    }
  }

  // 4) wrapping <label> — only if it wraps a single control (else it's a shared/group label)
  const wrap = el.closest('label');
  if (wrap && countControls(wrap) <= 1) {
    const t = textOf(wrap);
    if (t) return t;
  }

  // 5) bounded ancestor field-group climb (Workday's formField-* layout). Stop at a
  //    boundary or a multi-field region so we never steal a sibling/group label.
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++) {
    if (isStopBoundary(node) || countControls(node) >= 2) break;
    const cand = findGroupLabel(node, el);
    if (cand) return cand;
    node = node.parentElement;
  }

  return '';
}

function isStopBoundary(node: Element): boolean {
  const tag = node.tagName;
  if (tag === 'FORM' || tag === 'BODY') return true;
  const role = (node.getAttribute('role') ?? '').toLowerCase();
  return role === 'group' || role === 'radiogroup';
}

// A label-ish element within a single-control field group that belongs to THIS control.
function findGroupLabel(node: Element, el: Element): string {
  const cands = node.querySelectorAll('label, legend, [class*="label"], h1, h2, h3, h4, h5, h6');
  for (const c of Array.from(cands)) {
    if (c.contains(el) || isControl(c)) continue;
    const forId = c.getAttribute('for');
    if (forId && forId !== el.getAttribute('id')) continue; // label of a different control
    const t = textOf(c);
    if (t) return t;
  }
  return '';
}

// Nearest visible text preceding the control — a weak fallback signal.
export function getNearbyText(el: Element): string {
  let node: Element | null = el;
  for (let hops = 0; hops < 4 && node; hops++) {
    const prev = node.previousElementSibling;
    if (prev && prev.textContent && prev.textContent.trim())
      return clean(prev.textContent).slice(0, 120);
    node = node.parentElement;
  }
  return '';
}

export function extractSignals(el: Element): FieldSignals {
  const input = el as HTMLInputElement;
  const minLen = parseInt(el.getAttribute('minlength') ?? '', 10);
  const maxLen = parseInt(el.getAttribute('maxlength') ?? '', 10);
  return {
    label: getLabelText(el),
    name: el.getAttribute('name') ?? '',
    id: el.getAttribute('id') ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    nearbyText: getNearbyText(el),
    required: input.required || el.getAttribute('aria-required') === 'true',
    options: extractOptions(el),
    minLength: isNaN(minLen) ? undefined : minLen,
    maxLength: isNaN(maxLen) ? undefined : maxLen,
    inputType: input.type || undefined,
  };
}

function extractOptions(el: Element): string[] | undefined {
  if (el instanceof HTMLSelectElement) return Array.from(el.options).map((o) => clean(o.text));
  // custom dropdowns: options usually appear only when open — adapters supply these.
  return undefined;
}
