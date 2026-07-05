import { describe, it, expect } from 'vitest';
import { valueForKey } from '@/core/engine/values';
import { ProfileSchema, type Profile, type ProfileKey } from '@/core/profile.schema';
import type { DetectedField, FieldKind } from '@/core/types';

const profile: Profile = ProfileSchema.parse({
  schemaVersion: 2,
  personal: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '5551234',
    address: { city: 'London', country: 'United Kingdom' },
  },
  links: { linkedin: 'https://linkedin.com/in/ada' },
  workAuth: { authorizedToWork: true, needsSponsorship: false, requiresVisa: false },
  eeo: {},
  experience: [],
  education: [],
  skills: ['React', 'TypeScript'],
  documents: { resumes: [], coverLetters: [] },
  answerBank: [],
  settings: {},
});

function fld(mappedKey: ProfileKey, kind: FieldKind = 'text', name = ''): DetectedField {
  return {
    uid: 'x',
    kind,
    signals: {
      label: '',
      name,
      id: '',
      placeholder: '',
      ariaLabel: '',
      autocomplete: '',
      nearbyText: '',
      required: false,
    },
    mappedKey,
    confidence: 1,
    value: null,
    source: 'adapter',
    filled: false,
  };
}

describe('valueForKey', () => {
  it('reads a simple path', () => {
    expect(valueForKey(profile, 'personal.firstName', fld('personal.firstName'))).toBe('Ada');
  });

  it('reads a nested address path', () => {
    expect(valueForKey(profile, 'personal.address.city', fld('personal.address.city'))).toBe(
      'London',
    );
  });

  it('composes the full name for an autocomplete="name" field (not just first name)', () => {
    const f = fld('personal.firstName');
    f.signals.autocomplete = 'name';
    expect(valueForKey(profile, 'personal.firstName', f)).toBe('Ada Lovelace');
  });

  it('does NOT convert salary when the home currency is unset (no INR assumption)', () => {
    const p = { ...profile, salary: { expected: '100000', period: 'year' } } as Profile;
    const f = fld('salary.expected');
    f.signals.label = 'Expected salary (USD)'; // field names a currency, but home is unknown
    expect(valueForKey(p, 'salary.expected', f)).toBe('100000'); // raw amount, not divided by ~83
  });

  it('joins skills with commas', () => {
    expect(valueForKey(profile, 'skills', fld('skills'))).toBe('React, TypeScript');
  });

  it('maps booleans to Yes/No for radio/select kinds', () => {
    expect(
      valueForKey(
        profile,
        'workAuth.authorizedToWork',
        fld('workAuth.authorizedToWork', 'radio-group'),
      ),
    ).toBe('Yes');
  });

  it('maps booleans to yes/no tokens for checkboxes', () => {
    expect(
      valueForKey(
        profile,
        'workAuth.needsSponsorship',
        fld('workAuth.needsSponsorship', 'checkbox'),
      ),
    ).toBe('no');
  });

  it('returns null for files (handled via FILL_FILE)', () => {
    expect(valueForKey(profile, 'documents.resume', fld('documents.resume', 'file'))).toBeNull();
  });

  it('returns null for free-text (answer bank / LLM)', () => {
    expect(valueForKey(profile, 'freeText', fld('freeText', 'textarea'))).toBeNull();
  });

  it('composes a Lever single full-name field', () => {
    expect(
      valueForKey(profile, 'personal.firstName', fld('personal.firstName', 'text', 'name')),
    ).toBe('Ada Lovelace');
  });

  it('returns null for an unset optional field', () => {
    expect(valueForKey(profile, 'personal.middleName', fld('personal.middleName'))).toBeNull();
  });
});

describe('valueForKey — context-aware work authorization', () => {
  const fldL = (label: string, mappedKey: ProfileKey): DetectedField => {
    const f = fld(mappedKey, 'radio-group');
    return { ...f, signals: { ...f.signals, label } };
  };

  // profile home country is United Kingdom; authorizedCountries is empty → defaults to UK.
  it('derives from the country named in the question (home country)', () => {
    expect(
      valueForKey(
        profile,
        'workAuth.authorizedToWork',
        fldL('Are you authorized to work in the United Kingdom?', 'workAuth.authorizedToWork'),
      ),
    ).toBe('Yes');
    expect(
      valueForKey(
        profile,
        'workAuth.authorizedToWork',
        fldL('Authorized to work in the United States?', 'workAuth.authorizedToWork'),
      ),
    ).toBe('No');
  });

  it('flips sponsorship/visa for a foreign country', () => {
    expect(
      valueForKey(
        profile,
        'workAuth.needsSponsorship',
        fldL('Do you require sponsorship to work in the US?', 'workAuth.needsSponsorship'),
      ),
    ).toBe('Yes');
    expect(
      valueForKey(
        profile,
        'workAuth.needsSponsorship',
        fldL('Do you require sponsorship in the United Kingdom?', 'workAuth.needsSponsorship'),
      ),
    ).toBe('No');
  });

  it('respects an explicit authorizedCountries list', () => {
    const p = {
      ...profile,
      workAuth: { ...profile.workAuth, authorizedCountries: ['United States', 'India'] },
    };
    expect(
      valueForKey(
        p,
        'workAuth.authorizedToWork',
        fldL('Authorized to work in the United States?', 'workAuth.authorizedToWork'),
      ),
    ).toBe('Yes');
    expect(
      valueForKey(
        p,
        'workAuth.needsSponsorship',
        fldL('Require sponsorship in the US?', 'workAuth.needsSponsorship'),
      ),
    ).toBe('No');
  });

  it('falls back to the static toggle when no country is named', () => {
    expect(
      valueForKey(
        profile,
        'workAuth.authorizedToWork',
        fldL('Are you legally authorized to work?', 'workAuth.authorizedToWork'),
      ),
    ).toBe('Yes');
  });

  it('returns reference name from the first reference', () => {
    const p = {
      ...profile,
      references: [
        {
          id: 'r1',
          name: 'Bob Smith',
          email: 'bob@co.com',
          phone: '555-0000',
          company: 'Acme',
          relationship: 'Manager',
        },
      ],
    } as Profile;
    expect(valueForKey(p, 'references.name', fld('references.name'))).toBe('Bob Smith');
    expect(valueForKey(p, 'references.email', fld('references.email'))).toBe('bob@co.com');
    expect(valueForKey(p, 'references.phone', fld('references.phone'))).toBe('555-0000');
    expect(valueForKey(p, 'references.company', fld('references.company'))).toBe('Acme');
    expect(valueForKey(p, 'references.relationship', fld('references.relationship'))).toBe(
      'Manager',
    );
  });

  it('returns null when no references exist', () => {
    expect(valueForKey(profile, 'references.name', fld('references.name'))).toBeNull();
  });

  it('returns project URL from the first project', () => {
    const p = {
      ...profile,
      projects: [{ id: 'p1', title: 'My App', url: 'https://github.com/ada/app' }],
    } as Profile;
    expect(valueForKey(p, 'projects.url', fld('projects.url'))).toBe('https://github.com/ada/app');
  });

  it('returns null when no projects exist', () => {
    expect(valueForKey(profile, 'projects.url', fld('projects.url'))).toBeNull();
  });
});
