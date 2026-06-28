import type { FieldSignals, FieldKind } from '../types';
import { cssEscape } from './css';

// IMPLEMENTATION.md §11.1 — extract every signal we can read off a control.

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
  // Custom combobox pattern (div-based)
  const role = el.getAttribute('role');
  if (role === 'combobox' || role === 'listbox') return 'select-custom';
  return 'unknown';
}

export function getLabelText(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const lbl = document.querySelector(`label[for="${cssEscape(id)}"]`);
    if (lbl?.textContent) return clean(lbl.textContent);
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return clean(wrapping.textContent);
  const ariaId = el.getAttribute('aria-labelledby');
  if (ariaId) {
    const t = ariaId
      .split(/\s+/)
      .map((i) => document.getElementById(i)?.textContent ?? '')
      .join(' ');
    if (t.trim()) return clean(t);
  }
  return '';
}

// Nearest visible text preceding the control — fallback when no <label>.
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
  };
}

function extractOptions(el: Element): string[] | undefined {
  if (el instanceof HTMLSelectElement) return Array.from(el.options).map((o) => clean(o.text));
  // custom dropdowns: options usually appear only when open — adapters supply these.
  return undefined;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\*+$/, '').trim();
