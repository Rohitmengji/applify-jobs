import { describe, it, expect } from 'vitest';
import { countryInText, sameCountry, canonicalCountry } from '@/core/engine/countries';

describe('countryInText', () => {
  it('detects countries named in a work-auth question', () => {
    expect(countryInText('Are you authorized to work in the United States?')).toBe('United States');
    expect(countryInText('Do you require sponsorship to work in India?')).toBe('India');
    expect(countryInText('legally authorized to work in the UK')).toBe('United Kingdom');
  });
  it('prefers the longer alias and uses word boundaries', () => {
    expect(countryInText('work in the USA')).toBe('United States');
    expect(countryInText('discuss your status')).toBeNull(); // no bare "us" inside words
  });
  it('returns null when no country is named', () => {
    expect(countryInText('Are you legally authorized to work?')).toBeNull();
  });
});

describe('sameCountry / canonicalCountry', () => {
  it('matches across aliases', () => {
    expect(sameCountry('USA', 'United States')).toBe(true);
    expect(sameCountry('uk', 'United Kingdom')).toBe(true);
    expect(sameCountry('India', 'United States')).toBe(false);
    expect(canonicalCountry('america')).toBe('United States');
  });
});
