import { describe, it, expect } from 'vitest';
import {
  fieldFingerprint,
  applyLearned,
  learnableEntries,
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
      [fieldFingerprint(f)]: { key: 'personal.phone', value: '', uses: 1, updatedAt: 0 },
    };
    applyLearned([f], learned, profile);
    expect(f.mappedKey).toBe('personal.phone');
    expect(f.source).toBe('learned');
    expect(f.value).toBe('5551234'); // from profile, not the stored blank
  });

  it('fills a custom field from a learned literal value', () => {
    const f = fld('How did you hear about us?', { kind: 'text' });
    const learned: LearnedMap = {
      [fieldFingerprint(f)]: { key: null, value: 'LinkedIn', uses: 2, updatedAt: 0 },
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
      [fieldFingerprint(heur)]: { key: 'personal.phone', value: '', uses: 1, updatedAt: 0 },
    };
    applyLearned([heur, adapter, manual], learned, profile);
    expect(heur.source).toBe('learned'); // heuristic overridden
    expect(adapter.source).toBe('adapter'); // adapter untouched
    expect(manual.value).toBe('typed'); // manual untouched
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

  it('skips adapter/heuristic hits, valueless fields, and unlabeled fields', () => {
    const fields = [
      fld('First name', { source: 'adapter', mappedKey: 'personal.firstName', value: 'Ada' }),
      fld('Phone', { source: 'heuristic', mappedKey: 'personal.phone', value: '5551234' }),
      fld('Notes', { source: 'manual', value: null }),
      fld('', { source: 'manual', value: 'x' }),
    ];
    expect(learnableEntries(fields)).toEqual([]);
  });
});
