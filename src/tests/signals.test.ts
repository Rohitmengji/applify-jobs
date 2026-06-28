import { describe, it, expect, beforeEach } from 'vitest';
import { classifyKind, getLabelText, getNearbyText, extractSignals } from '@/core/engine/signals';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('classifyKind', () => {
  it('classifies an email input', () => {
    const i = document.createElement('input');
    i.type = 'email';
    expect(classifyKind(i)).toBe('email');
  });
  it('classifies textarea / select', () => {
    expect(classifyKind(document.createElement('textarea'))).toBe('textarea');
    expect(classifyKind(document.createElement('select'))).toBe('select-native');
  });
  it('classifies a role=combobox element as select-custom', () => {
    const d = document.createElement('div');
    d.setAttribute('role', 'combobox');
    expect(classifyKind(d)).toBe('select-custom');
  });
});

describe('getLabelText', () => {
  it('reads an explicit label[for]', () => {
    document.body.innerHTML = '<label for="fn">First Name</label><input id="fn" />';
    expect(getLabelText(document.getElementById('fn')!)).toBe('First Name');
  });
  it('reads a wrapping label', () => {
    document.body.innerHTML = '<label>Email <input id="e" type="email" /></label>';
    expect(getLabelText(document.getElementById('e')!)).toContain('Email');
  });
  it('reads aria-labelledby', () => {
    document.body.innerHTML = '<span id="l">Phone</span><input id="p" aria-labelledby="l" />';
    expect(getLabelText(document.getElementById('p')!)).toBe('Phone');
  });
  it('strips a trailing required asterisk', () => {
    document.body.innerHTML = '<label for="x">First Name *</label><input id="x" />';
    expect(getLabelText(document.getElementById('x')!)).toBe('First Name');
  });
});

describe('getNearbyText', () => {
  it('reads the preceding sibling text', () => {
    document.body.innerHTML = '<div><span>City</span><input id="c" /></div>';
    expect(getNearbyText(document.getElementById('c')!)).toBe('City');
  });
});

describe('extractSignals', () => {
  it('captures the key attributes', () => {
    document.body.innerHTML =
      '<input id="x" name="firstName" placeholder="First" autocomplete="given-name" aria-label="First name" required />';
    const s = extractSignals(document.getElementById('x')!);
    expect(s.name).toBe('firstName');
    expect(s.autocomplete).toBe('given-name');
    expect(s.ariaLabel).toBe('First name');
    expect(s.required).toBe(true);
  });
});
