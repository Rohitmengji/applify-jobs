import { describe, it, expect, beforeEach } from 'vitest';
import {
  setReactInputValue,
  setNativeSelect,
  setRadioGroup,
  setCheckbox,
  setSearchMultiSelect,
} from '@/core/engine/fill';

// jsdom has no layout, so offsetParent is always null and the visibility filter would drop
// every option. Mark elements "visible" so the search/click logic is actually exercised.
function makeVisible(el: HTMLElement) {
  Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('setReactInputValue', () => {
  it('sets the value and dispatches input + change + blur', () => {
    const i = document.createElement('input');
    document.body.append(i);
    const seen: string[] = [];
    i.addEventListener('input', () => seen.push('input'));
    i.addEventListener('change', () => seen.push('change'));
    i.addEventListener('blur', () => seen.push('blur'));
    setReactInputValue(i, 'hello');
    expect(i.value).toBe('hello');
    expect(seen).toEqual(['input', 'change', 'blur']);
  });
});

describe('setNativeSelect', () => {
  it('matches an option by visible text', () => {
    document.body.innerHTML =
      '<select><option value="us">United States</option><option value="uk">United Kingdom</option></select>';
    const sel = document.querySelector('select')!;
    expect(setNativeSelect(sel, 'United Kingdom')).toBe(true);
    expect(sel.value).toBe('uk');
  });
  it('returns false when no option matches', () => {
    document.body.innerHTML = '<select><option value="a">Alpha</option></select>';
    expect(setNativeSelect(document.querySelector('select')!, 'Zeta')).toBe(false);
  });
  it('returns false (does not pick the first option) for a blank value', () => {
    document.body.innerHTML =
      '<select><option value="">— select —</option><option value="us">United States</option></select>';
    const sel = document.querySelector('select')!;
    expect(setNativeSelect(sel, '')).toBe(false);
    expect(sel.value).toBe(''); // untouched — still the placeholder
  });
  it('does not substring-match short tokens (No ≠ Norway)', () => {
    document.body.innerHTML =
      '<select><option value="nor">Norway</option><option value="no">No</option></select>';
    const sel = document.querySelector('select')!;
    expect(setNativeSelect(sel, 'No')).toBe(true);
    expect(sel.value).toBe('no'); // exact "No", not "Norway"
  });
});

describe('setRadioGroup', () => {
  it('selects a radio by its label text', () => {
    document.body.innerHTML =
      '<input type="radio" name="g" id="y" value="yes" /><label for="y">Yes</label>' +
      '<input type="radio" name="g" id="n" value="no" /><label for="n">No</label>';
    expect(setRadioGroup('g', 'Yes')).toBe(true);
    expect((document.getElementById('y') as HTMLInputElement).checked).toBe(true);
  });
  it('prefers the exact "No" over a label that merely contains it', () => {
    document.body.innerHTML =
      '<input type="radio" name="g" id="ns" value="ns" /><label for="ns">Not sure</label>' +
      '<input type="radio" name="g" id="n" value="no" /><label for="n">No</label>';
    expect(setRadioGroup('g', 'No')).toBe(true);
    expect((document.getElementById('n') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('ns') as HTMLInputElement).checked).toBe(false);
  });
  it('returns false for a blank value', () => {
    document.body.innerHTML =
      '<input type="radio" name="g" id="y" value="yes" /><label for="y">Yes</label>';
    expect(setRadioGroup('g', '')).toBe(false);
  });
});

describe('setSearchMultiSelect (Workday-style skills)', () => {
  // A search box plus a static list of options. The real widget filters async on type; for
  // the test the options are always present, which exercises the match → click → clear loop.
  function setup(optionTexts: string[]) {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    const clicked: string[] = [];
    for (const t of optionTexts) {
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.textContent = t;
      makeVisible(opt);
      opt.addEventListener('click', () => clicked.push(t));
      document.body.append(opt);
    }
    return { input, clicked };
  }

  it('adds each comma-separated skill by clicking its matching option', async () => {
    const { input, clicked } = setup(['Python', 'SQL', 'MySQL', 'Tableau']);
    const added = await setSearchMultiSelect(() => input, 'python, sql, Tableau', '[role=option]');
    expect(added).toBe(3);
    expect(clicked).toEqual(['Python', 'SQL', 'Tableau']);
  });

  it('prefers an exact/prefix match over a substring one (python ≠ IronPython)', async () => {
    const { input, clicked } = setup(['IronPython', 'Python']);
    const added = await setSearchMultiSelect(() => input, 'python', '[role=option]');
    expect(added).toBe(1);
    expect(clicked).toEqual(['Python']);
  });

  it('de-dupes case-insensitively so a skill is not added twice', async () => {
    const { input, clicked } = setup(['SQL']);
    const added = await setSearchMultiSelect(() => input, 'SQL, sql', '[role=option]');
    expect(added).toBe(1);
    expect(clicked).toEqual(['SQL']);
  });
});

describe('setCheckbox', () => {
  it('toggles only when needed', () => {
    const c = document.createElement('input');
    c.type = 'checkbox';
    document.body.append(c);
    setCheckbox(c, true);
    expect(c.checked).toBe(true);
    setCheckbox(c, true); // idempotent
    expect(c.checked).toBe(true);
    setCheckbox(c, false);
    expect(c.checked).toBe(false);
  });
});
