import { describe, it, expect } from 'vitest';
import { valueForKey } from '@/core/engine/values';
import { ProfileSchema, type Profile, type ProfileKey } from '@/core/profile.schema';
import type { DetectedField, FieldKind } from '@/core/types';

const profile: Profile = ProfileSchema.parse({
  schemaVersion: 1,
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
  documents: {},
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
