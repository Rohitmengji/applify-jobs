import { describe, it, expect } from 'vitest';
import {
  fieldFingerprint,
  applyLearned,
  learnableEntries,
  scopeKey,
  type LearnedMap,
} from '@/core/engine/learn';
import { ProfileSchema, type Profile } from '@/core/profile.schema';
import type { DetectedField, FieldKind, FillSource } from '@/core/types';

const profile: Profile = ProfileSchema.parse({
  schemaVersion: 1,
  personal: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '5551234',
    address: { country: 'UK' },
  },
  links: {},
  workAuth: { authorizedToWork: true, needsSponsorship: false, requiresVisa: false },
  eeo: {},
  experience: [],
  education: [],
  skills: [],
  documents: {},
  answerBank: [],
  settings: {},
});

function fld(
  label: string,
  opts: Partial<Pick<DetectedField, 'kind' | 'mappedKey' | 'value' | 'source' | 'confidence'>> = {},
): DetectedField {
  return {
    uid: Math.random().toString(36).slice(2),
    kind: (opts.kind ?? 'text') as FieldKind,
    signals: {
      label,
      name: '',
      id: '',
      placeholder: '',
      ariaLabel: '',
      autocomplete: '',
      nearbyText: '',
      required: false,
    },
    mappedKey: opts.mappedKey ?? null,
    confidence: opts.confidence ?? 0,
    value: opts.value ?? null,
    source: (opts.source ?? 'none') as FillSource,
    filled: false,
  };
}

describe('fieldFingerprint', () => {
  it('is stable across case/punctuation and keyed by kind', () => {
    expect(fieldFingerprint(fld('How did you hear about us?'))).toBe(
      fieldFingerprint(fld('how did you HEAR  about us')),
    );
    expect(fieldFingerprint(fld('Country', { kind: 'select-native' }))).not.toBe(
      fieldFingerprint(fld('Country', { kind: 'text' })),
    );
  });
});

describe('applyLearned', () => {
  it('fills an unmapped field from a learned profile-key entry (value re-resolved from profile)', () => {
    const f = fld('Mobile');
    const learned: LearnedMap = {
      [scopeKey(null, fieldFingerprint(f))]: {
        key: 'personal.phone',
        value: '',
        uses: 1,
        updatedAt: 0,
      },
    };
    applyLearned([f], learned, profile);
    expect(f.mappedKey).toBe('personal.phone');
    expect(f.source).toBe('learned');
    expect(f.value).toBe('5551234'); // from profile, not the stored blank
  });

  it('fills a custom field from a learned literal value', () => {
    const f = fld('How did you hear about us?', { kind: 'text' });
    const learned: LearnedMap = {
      [scopeKey(null, fieldFingerprint(f))]: {
        key: null,
        value: 'LinkedIn',
        uses: 2,
        updatedAt: 0,
      },
    };
    applyLearned([f], learned, profile);
    expect(f.value).toBe('LinkedIn');
    expect(f.source).toBe('learned');
  });

  it('overrides a heuristic mapping but never an adapter or a current manual edit', () => {
    const heur = fld('Mobile', {
      source: 'heuristic',
      mappedKey: 'personal.email',
      confidence: 0.8,
    });
    const adapter = fld('Mobile', {
      source: 'adapter',
      mappedKey: 'personal.email',
      confidence: 0.99,
      value: 'x',
    });
    const manual = fld('Mobile', { source: 'manual', value: 'typed', confidence: 1 });
    const learned: LearnedMap = {
      [scopeKey(null, fieldFingerprint(heur))]: {
        key: 'personal.phone',
        value: '',
        uses: 1,
        updatedAt: 0,
      },
    };
    applyLearned([heur, adapter, manual], learned, profile);
    expect(heur.source).toBe('learned'); // heuristic overridden
    expect(adapter.source).toBe('adapter'); // adapter untouched
    expect(manual.value).toBe('typed'); // manual untouched
  });

  it('prefers an ATS-scoped answer over the global one, and falls back to global', () => {
    const f = () => fld('How did you hear about us?', { kind: 'text' });
    const fp = fieldFingerprint(f());
    const learned: LearnedMap = {
      [scopeKey('greenhouse', fp)]: {
        key: null,
        value: 'A Greenhouse recruiter',
        uses: 1,
        updatedAt: 0,
      },
      [scopeKey(null, fp)]: { key: null, value: 'LinkedIn', uses: 1, updatedAt: 0 },
    };
    const onGh = f();
    applyLearned([onGh], learned, profile, 'greenhouse');
    expect(onGh.value).toBe('A Greenhouse recruiter'); // scoped wins

    const onWd = f();
    applyLearned([onWd], learned, profile, 'workday');
    expect(onWd.value).toBe('LinkedIn'); // no workday entry → global fallback
  });
});

describe('learnableEntries', () => {
  it('captures manual / custom / AI fields, with the profile key when mapped', () => {
    const fields = [
      fld('Phone', { source: 'manual', mappedKey: 'personal.phone', value: '5551234' }),
      fld('How did you hear about us?', { source: 'manual', mappedKey: null, value: 'LinkedIn' }),
      fld('Why us?', { source: 'llm', mappedKey: 'freeText', value: 'Because…' }),
    ];
    const out = learnableEntries(fields);
    expect(out).toHaveLength(3);
    expect(out.find((e) => e.value === '5551234')?.key).toBe('personal.phone');
    expect(out.find((e) => e.value === 'LinkedIn')?.key).toBeNull();
    expect(out.find((e) => e.value === 'Because…')?.key).toBeNull(); // freeText → literal
  });

  it('skips valueless fields and unlabeled fields', () => {
    const fields = [
      fld('Notes', { source: 'manual', value: null }),
      fld('', { source: 'manual', value: 'x' }),
    ];
    expect(learnableEntries(fields)).toEqual([]);
  });

  it('records adapter/heuristic hits so non-adapter sites benefit', () => {
    const fields = [
      fld('First name', { source: 'adapter', mappedKey: 'personal.firstName', value: 'Ada' }),
      fld('Phone', { source: 'heuristic', mappedKey: 'personal.phone', value: '5551234' }),
    ];
    const out = learnableEntries(fields);
    expect(out).toHaveLength(2);
    expect(out[0].key).toBe('personal.firstName');
    expect(out[1].key).toBe('personal.phone');
  });

  it('never persists protected / EEO fields (by label or mappedKey)', () => {
    const fields = [
      fld('Gender', { source: 'manual', value: 'Female' }),
      fld('Are you a protected veteran?', { source: 'manual', value: 'No' }),
      fld('Disability status', { source: 'manual', value: 'Yes' }),
      fld('Race / Ethnicity', { source: 'manual', value: 'Asian' }),
      fld('Voluntary self-ID', { source: 'manual', mappedKey: 'eeo.gender', value: 'Male' }),
      fld('Date of birth', { source: 'manual', value: '1990-01-01' }),
      fld('Social Security Number', { source: 'manual', value: '111-22-3333' }),
      fld('Bank account number', { source: 'manual', value: '12345678' }),
    ];
    expect(learnableEntries(fields)).toEqual([]);
  });

  it('skips search / filter boxes and blank/whitespace values', () => {
    const fields = [
      fld('Search jobs', { source: 'manual', value: 'engineer' }),
      fld('Filter by location', { source: 'manual', value: 'NYC' }),
      fld('Notes', { source: 'manual', value: '   ' }), // whitespace-only
    ];
    expect(learnableEntries(fields)).toEqual([]);
  });

  it('de-dupes identical fingerprints within one batch (no double uses)', () => {
    const fields = [
      fld('How did you hear about us?', { source: 'manual', value: 'LinkedIn' }),
      fld('How did you hear about us?', { source: 'manual', value: 'Referral' }),
    ];
    const out = learnableEntries(fields);
    // Same kind|label → one fingerprint; first value wins, no duplicate entry.
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('LinkedIn');
  });
});
