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
  it('classifies an aria-haspopup button (Workday "Select One") as select-custom', () => {
    const b = document.createElement('button');
    b.setAttribute('aria-haspopup', 'listbox');
    expect(classifyKind(b)).toBe('select-custom');
  });
  it('does NOT classify a plain button as a field', () => {
    expect(classifyKind(document.createElement('button'))).toBe('unknown');
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
  it('reads aria-label', () => {
    document.body.innerHTML =
      '<button id="b" aria-haspopup="listbox" aria-label="Country">Select One</button>';
    expect(getLabelText(document.getElementById('b')!)).toBe('Country');
  });
  it('aria-labelledby skips a value ref inside the control itself', () => {
    // Workday pattern: the trigger references both the question label and its own value span.
    document.body.innerHTML =
      '<label id="q">Authorized to work?</label>' +
      '<button id="b" aria-labelledby="q v"><span id="v">Select One</span></button>';
    expect(getLabelText(document.getElementById('b')!)).toBe('Authorized to work?');
  });
  it('climbs the field-group wrapper to find the label (no for/aria)', () => {
    document.body.innerHTML =
      '<div data-automation-id="formField-q"><div class="wd-label">Why us?</div>' +
      '<textarea id="t"></textarea></div>';
    expect(getLabelText(document.getElementById('t')!)).toBe('Why us?');
  });
  it('does not steal a sibling field’s label (multi-control region)', () => {
    document.body.innerHTML = '<div><label>A</label><input id="a" /><input id="b" /></div>';
    // #b has no own label; the group has 2 controls → climb stops, returns '' (not "A").
    expect(getLabelText(document.getElementById('b')!)).toBe('');
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
