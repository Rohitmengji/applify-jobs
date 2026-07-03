import type { DetectedField } from '../types';
import { cssEscape } from './css';
import { matchByAlias } from './countries';

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

  // Focus first so the framework registers the field as "touched"
  el.focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

  // Use the native setter to bypass React's value lock
  setter.call(el, value);

  // Fire the full event sequence that real user typing produces.
  // React 16+ listens on the native input event; some validators need change+blur.
  el.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }),
  );
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

  // Dismiss Google Places autocomplete dropdown if present (it interferes with form fill).
  // Places renders a .pac-container; clicking outside or pressing Escape closes it.
  const pac = document.querySelector('.pac-container');
  if (pac && pac instanceof HTMLElement && pac.offsetParent !== null) {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    );
  }
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

  // Country/state alias normalization runs BEFORE the loose substring fallback, so a valid
  // alias ("USA" → "United States of America") wins over a reverse-substring collision (e.g.
  // target "United States of America" loosely containing an unrelated short option).
  const aliasMatch = matchByAlias(
    target,
    options.map((o) => text(o)),
  );
  if (aliasMatch) {
    const hit = options.find((o) => text(o) === aliasMatch);
    if (hit) return hit;
  }

  // Short tokens never substring-match (so "No" ≠ "Norway"); alias above already tried.
  if (t.length < MIN_SUBSTR) return null;

  // Substring fallback (last resort).
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
  el.focus();
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  el.value = match.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
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

  // Open the dropdown
  trigger.focus();
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  trigger.click();
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await sleep(200);

  if (opts.typeToFilter !== false) {
    // Look for a search input inside the dropdown or the trigger itself if it's an input
    const search =
      trigger instanceof HTMLInputElement
        ? trigger
        : document.querySelector<HTMLInputElement>(
            'input[role=combobox], input[aria-autocomplete=list], input[aria-autocomplete=both], [class*=menu] input, [role=listbox] ~ input, input[data-automation-id*="search"]',
          );
    if (search) {
      setReactInputValue(search, value);
      await sleep(300); // longer wait for async-filtered options
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
  if (hit) {
    hit.click();
    await sleep(80);
    return true;
  }

  // Alias fallback: try country/state normalization (handles "US" → "United States of America")
  const optionTexts = options.map((o) => (o.textContent ?? '').trim());
  const aliasMatch = matchByAlias(value, optionTexts);
  if (aliasMatch) {
    const aliasHit = options.find((o) => (o.textContent ?? '').trim() === aliasMatch);
    if (aliasHit) {
      aliasHit.click();
      await sleep(80);
      return true;
    }
  }

  // Close the dropdown — try Escape first (works for most frameworks), then click
  trigger.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
  );
  await sleep(50);
  trigger.click();
  return false;
}

// §12.4 — checkbox & radio group
export function setCheckbox(el: HTMLInputElement, checked: boolean): void {
  if (el.checked !== checked) el.click(); // click drives React + fires change
}

export function setRadioGroup(name: string, value: string, root: ParentNode = document): boolean {
  const target = value.toLowerCase().trim();
  if (!target) return false;
  // Scope to the field's root node so radios inside a shadow root are found (and their
  // labels resolved) instead of querying only the top-level document.
  const radios = Array.from(
    root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${cssEscape(name)}"]`),
  );
  const entries = radios.map((r) => {
    const lbl = r.id ? root.querySelector(`label[for="${cssEscape(r.id)}"]`) : r.closest('label');
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

// §12.6 — date fields. Profile dates are ISO-ish (YYYY | YYYY-MM | YYYY-MM-DD). Format to the
// input's type: <input type="month"> rejects a full YYYY-MM-DD, <input type="date"> needs one.
export function setDate(el: HTMLInputElement, isoOrYmd: string): void {
  const [y, m = '01', d = '01'] = isoOrYmd.split('-');
  let value = isoOrYmd;
  if (el.type === 'month') value = `${y}-${m.padStart(2, '0')}`;
  else if (el.type === 'date') value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  setReactInputValue(el, value);
}

// §12.6b — phone fields. Some inputs use input masks (e.g., (___) ___-____) that reject
// a bulk value set. Try the fast path first; if it doesn't stick, type char-by-char.
export async function setPhoneValue(el: HTMLInputElement, value: string): Promise<void> {
  // Strip to digits + leading + for international
  const digits = value.replace(/[^\d+]/g, '');
  setReactInputValue(el, digits);
  await sleep(50);

  // Check if the value stuck — if the input has a mask, it may have rejected it
  if (el.value.replace(/[^\d]/g, '').length >= digits.replace(/[^\d]/g, '').length - 1) return;

  // Fallback: clear and type character by character (for masked inputs)
  el.focus();
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  for (const char of digits) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: char,
      }),
    );
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    await sleep(20);
  }
  // If char-by-char didn't populate the value (no framework handler), force-set it
  if (!el.value.replace(/[^\d]/g, '')) {
    const proto = HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(el, digits);
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

// §12.6c — Multi-select / tag inputs (skills). Type each item, press Enter to add it,
// repeat. Works for tag inputs, chip inputs, and comma-separated multi-selects.
export async function setTagInput(
  el: HTMLInputElement,
  values: string,
  separator = ',',
): Promise<void> {
  const items = values
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
  el.focus();
  for (const item of items) {
    setReactInputValue(el, item);
    await sleep(100);
    // Press Enter to confirm the tag
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
    );
    el.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
    );
    await sleep(100);
    // Some tag inputs need comma or tab instead of Enter
    if (el.value === item) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', bubbles: true }));
      await sleep(50);
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, bubbles: true }),
      );
      await sleep(50);
    }
  }
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

// §12.6d — searchable multi-select (Workday "Type to Add Skills", and similar widgets).
// These are NOT tag inputs: typing + Enter leaves the text sitting in the search box. A
// value is only committed when you CLICK a rendered search result. So for each item we:
// type it → wait for the async-filtered results → click the best match → clear the box →
// repeat. Returns how many items were successfully added.
//
// `getSearch` is re-invoked each iteration because Workday remounts the input as pills are
// added; caching a single element reference goes stale after the first selection.
export async function setSearchMultiSelect(
  getSearch: () => HTMLInputElement | null,
  values: string,
  optionSelector: string,
  separator = ',',
): Promise<number> {
  // De-dupe case-insensitively — profiles often list "SQL" and "sql", or "Python" twice.
  const seen = new Set<string>();
  const items = values
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));

  let added = 0;
  for (const item of items) {
    const search = getSearch();
    if (!search || !search.isConnected) break; // widget gone (re-render/step change)

    setReactInputValue(search, item);
    await sleep(450); // Workday async-filters the option list

    const target = item.toLowerCase();
    const options = Array.from(document.querySelectorAll<HTMLElement>(optionSelector)).filter(
      (o) => o.offsetParent !== null,
    );
    const optText = (o: HTMLElement) => (o.textContent ?? '').toLowerCase().trim();
    // Precision order: exact, then prefix, then (length-guarded) substring — so "python"
    // prefers "Python" over "IronPython", and short tokens don't grab everything.
    const hit =
      options.find((o) => optText(o) === target) ??
      options.find((o) => optText(o).startsWith(target)) ??
      (target.length >= MIN_SUBSTR
        ? options.find((o) => optText(o).length >= MIN_SUBSTR && optText(o).includes(target))
        : undefined);

    if (hit) {
      // Click the checkbox inside the option if present, else the option row itself.
      (hit.querySelector<HTMLElement>('input[type=checkbox]') ?? hit).click();
      added++;
      await sleep(200);
    }

    // Clear the box for the next item (whether or not this one matched) so a leftover
    // query doesn't poison the next search or get left behind as stray text.
    const s2 = getSearch();
    if (s2?.isConnected) {
      setReactInputValue(s2, '');
      await sleep(150);
    }
  }

  const s = getSearch();
  s?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return added;
}

// Pull the first number out of a string ("I have 3+ years" → "3", "3-5" → "3"); returns the
// original if there's no number. Used to keep numeric inputs numeric even when the LLM (or a
// saved answer) wraps the number in prose.
export function extractNumber(value: string): string {
  const m = value.match(/-?\d[\d,]*(\.\d+)?/);
  return m ? m[0].replace(/,/g, '') : value;
}

// A control that only accepts a number (by input type). Label-based numeric detection lives in
// the draft path (App.tsx) where prose is being generated; here we stay strict to avoid
// mangling a text field that merely mentions a number.
export function isNumericInput(field: DetectedField): boolean {
  return field.kind === 'number' || field.signals.inputType === 'number';
}

// Coerce a value to satisfy a field's hard constraints — the last-line safety net applied to
// EVERY value source at fill time: numeric inputs get a bare number; over-long values are cut
// to maxLength.
export function coerceValueForField(field: DetectedField, value: string): string {
  let v = value;
  if (isNumericInput(field)) v = extractNumber(v);
  const max = field.signals.maxLength;
  if (max && max > 0 && v.length > max) v = v.slice(0, max);
  return v;
}

// §12.7 — the dispatcher. An optional adapter `override` (SiteAdapter.fillField) gets
// first crack at tricky custom controls; returning true means it handled the field and
// the generic path is skipped. Throwing/returning false falls through to the default.
export async function fillOne(
  field: DetectedField,
  file?: File,
  override?: (f: DetectedField, value: string) => Promise<boolean>,
): Promise<void> {
  if (override) {
    // Let a real override error propagate (it becomes a FIELD_FILLED ok:false) rather
    // than masking it as a generic-path retry — and the override owns the kinds it
    // claims, so it must throw on a genuine miss, not return false (findings #5/#12).
    const handled = await override(field, field.value ?? '');
    if (handled) return;
  }

  const el = document.querySelector<HTMLElement>(`[data-oca-uid="${field.uid}"]`);
  if (!el) throw new Error('element gone (re-render?)');

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'url':
    case 'number':
    case 'textarea': {
      // Enforce the field's hard constraints regardless of where the value came from (LLM,
      // answer bank, learned, manual): a numeric input gets a bare number, and any value is
      // truncated to maxLength (JS .value bypasses the browser's own maxLength limit).
      const v = coerceValueForField(field, field.value ?? '');
      // Skills mapped to a text/textarea input → use tag input (type, Enter, repeat)
      if (field.mappedKey === 'skills' && v.includes(',')) {
        await setTagInput(el as HTMLInputElement, v);
      } else {
        setReactInputValue(el as HTMLInputElement, v);
      }
      break;
    }
    case 'tel':
      await setPhoneValue(el as HTMLInputElement, field.value ?? '');
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
    case 'radio-group': {
      if (!field.signals.name) throw new Error('radio group has no name attribute');
      // Scope to the element's root so radios in a shadow root are found (el.getRootNode()
      // is the shadow root for shadow-DOM controls, else the document).
      const root = (el.getRootNode() as ParentNode) ?? document;
      if (!setRadioGroup(field.signals.name, field.value ?? '', root))
        throw new Error('no radio matched');
      break;
    }
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

/**
 * Apply a visual confidence overlay to a filled field element on the page.
 * Green = high confidence, amber = medium, red = low.
 * Uses box-shadow (NEVER causes layout reflow, unlike outline/border).
 * Batched via requestAnimationFrame to avoid jank.
 */
export function applyConfidenceOverlay(field: DetectedField): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-oca-uid="${field.uid}"]`);
    if (!el) return;
    const c = field.confidence;
    const color = c >= 0.95 ? '#16a34a' : c >= 0.7 ? '#ca8a04' : '#dc2626';
    el.style.boxShadow = `0 0 0 2px ${color}40, inset 0 0 0 1px ${color}`;
    el.setAttribute('title', `OneClick Apply: ${field.source} (${Math.round(c * 100)}%)`);
  });
}

/** Remove all confidence overlays from the page. */
export function clearOverlays(): void {
  document.querySelectorAll<HTMLElement>('[data-oca-uid]').forEach((el) => {
    el.style.boxShadow = '';
  });
}
