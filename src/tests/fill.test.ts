import { describe, it, expect, beforeEach } from 'vitest';
import {
  setReactInputValue,
  setNativeSelect,
  setRadioGroup,
  setCheckbox,
} from '@/core/engine/fill';

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
});

describe('setRadioGroup', () => {
  it('selects a radio by its label text', () => {
    document.body.innerHTML =
      '<input type="radio" name="g" id="y" value="yes" /><label for="y">Yes</label>' +
      '<input type="radio" name="g" id="n" value="no" /><label for="n">No</label>';
    expect(setRadioGroup('g', 'Yes')).toBe(true);
    expect((document.getElementById('y') as HTMLInputElement).checked).toBe(true);
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
