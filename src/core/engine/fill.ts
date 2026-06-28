import type { DetectedField } from '../types';
import { cssEscape } from './css';

// IMPLEMENTATION.md §12 — fill primitives. These are why the extension works on
// real sites instead of mysteriously not working. Treat them as the foundation.

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// §12.1 — the React value trap. `input.value = "x"` sets the DOM property but does
// NOT notify React, so the value silently reverts on submit. Call the native setter
// and dispatch real events. USE VERBATIM.
export function setReactInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true })); // some validators run on blur
}

// Minimum length before we allow substring (not exact) matching. Short tokens like
// "No"/"US" must match exactly, or they'd collide with "Norway"/"Customer Service".
const MIN_SUBSTR = 3;

// Exact-first option matching with a guarded substring fallback. Returns null for a
// blank target so a cleared/absent value never silently selects the first option.
function pickOption<T>(
  options: T[],
  text: (o: T) => string,
  value: (o: T) => string,
  target: string,
): T | null {
  const t = target.toLowerCase().trim();
  if (!t) return null;
  const exact = options.find(
    (o) => text(o).toLowerCase().trim() === t || value(o).toLowerCase().trim() === t,
  );
  if (exact) return exact;
  if (t.length < MIN_SUBSTR) return null; // short tokens: exact-only
  return (
    options.find((o) => {
      const ot = text(o).toLowerCase().trim();
      return ot.length >= MIN_SUBSTR && (ot.includes(t) || t.includes(ot));
    }) ?? null
  );
}

// §12.2 — native <select>
export function setNativeSelect(el: HTMLSelectElement, value: string): boolean {
  const match = pickOption(
    Array.from(el.options),
    (o) => o.text,
    (o) => o.value,
    value,
  );
  if (!match) return false;
  el.value = match.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// §12.3 — custom dropdowns (div comboboxes). Open, optionally type to filter, click
// the matching option by text. Adapters override optionSelector for their specifics.
export async function setCustomDropdown(
  trigger: HTMLElement,
  value: string,
  opts: { optionSelector?: string; typeToFilter?: boolean } = {},
): Promise<boolean> {
  const target = value.toLowerCase().trim();
  if (!target) return false; // blank value: never auto-pick the first visible option

  const optionSelector = opts.optionSelector ?? '[role=option], [class*=option], li[id*=option]';
  trigger.click(); // open
  trigger.focus();
  await sleep(120);

  if (opts.typeToFilter !== false) {
    const search = document.querySelector<HTMLInputElement>(
      'input[role=combobox], input[aria-autocomplete=list], [class*=menu] input',
    );
    if (search) {
      setReactInputValue(search, value);
      await sleep(180);
    }
  }

  const options = Array.from(document.querySelectorAll<HTMLElement>(optionSelector)).filter(
    (o) => o.offsetParent !== null,
  ); // visible only
  const optText = (o: HTMLElement) => (o.textContent ?? '').toLowerCase().trim();
  const hit =
    options.find((o) => optText(o) === target) ??
    (target.length >= MIN_SUBSTR
      ? options.find((o) => optText(o).length >= MIN_SUBSTR && optText(o).includes(target))
      : undefined);
  if (!hit) {
    trigger.click(); // close, report miss
    return false;
  }
  hit.click();
  await sleep(80);
  return true;
}

// §12.4 — checkbox & radio group
export function setCheckbox(el: HTMLInputElement, checked: boolean): void {
  if (el.checked !== checked) el.click(); // click drives React + fires change
}

export function setRadioGroup(name: string, value: string): boolean {
  const target = value.toLowerCase().trim();
  if (!target) return false;
  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${cssEscape(name)}"]`),
  );
  const entries = radios.map((r) => {
    const lbl = r.id
      ? document.querySelector(`label[for="${cssEscape(r.id)}"]`)
      : r.closest('label');
    return {
      r,
      text: (lbl?.textContent ?? r.value).toLowerCase().trim(),
      val: r.value.toLowerCase(),
    };
  });
  // Exact label/value first; only then a length-guarded substring (so "No" ≠ "Not sure").
  const hit =
    entries.find((e) => e.text === target || e.val === target) ??
    (target.length >= MIN_SUBSTR
      ? entries.find((e) => e.text.length >= MIN_SUBSTR && e.text.includes(target))
      : undefined);
  if (!hit) return false;
  hit.r.click();
  return true;
}

// §12.5 — file upload via DataTransfer (a file input can't be given a path).
export function attachFile(input: HTMLInputElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// For drag-and-drop zones (Greenhouse and others) that don't expose a file input:
export function dropFileOnZone(zone: HTMLElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    zone.dispatchEvent(ev);
  }
}

// Reconstruct a File from a base64 FILL_FILE message (§10).
export function fileFromB64(b64: string, name: string, mime: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// §12.6 — date fields. Profile dates are ISO; adapters override for masked/segmented UIs.
export function setDate(el: HTMLInputElement, isoOrYmd: string): void {
  setReactInputValue(el, isoOrYmd);
}

// §12.7 — the dispatcher
export async function fillOne(field: DetectedField, file?: File): Promise<void> {
  const el = document.querySelector<HTMLElement>(`[data-oca-uid="${field.uid}"]`);
  if (!el) throw new Error('element gone (re-render?)');

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    case 'number':
    case 'textarea':
      setReactInputValue(el as HTMLInputElement, field.value ?? '');
      break;
    case 'select-native':
      if (!setNativeSelect(el as HTMLSelectElement, field.value ?? ''))
        throw new Error('no option matched');
      break;
    case 'select-custom':
      if (!(await setCustomDropdown(el, field.value ?? ''))) throw new Error('no option matched');
      break;
    case 'checkbox':
      setCheckbox(
        el as HTMLInputElement,
        ['yes', 'true', '1', 'on'].includes((field.value ?? '').toLowerCase()),
      );
      break;
    case 'radio-group':
      if (!setRadioGroup(field.signals.name, field.value ?? ''))
        throw new Error('no radio matched');
      break;
    case 'date':
      setDate(el as HTMLInputElement, field.value ?? '');
      break;
    case 'file':
      if (file) attachFile(el as HTMLInputElement, file);
      break;
    default:
      throw new Error(`unhandled kind ${field.kind}`);
  }
}
