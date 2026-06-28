import { describe, it, expect } from 'vitest';
import { parseResumeText, applyParsedResume, mergeExtractedResume } from '@/core/parser/resume';
import { EMPTY } from '@/core/storage/profileStore';

const SAMPLE = `Ada Lovelace
ada.lovelace@example.com | +1 (555) 123-4567
https://www.linkedin.com/in/adalovelace   https://github.com/ada
https://adalovelace.dev

Summary
Senior engineer.

Skills: JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker
`;

describe('parseResumeText', () => {
  const p = parseResumeText(SAMPLE);

  it('extracts the name from the header line', () => {
    expect(p.firstName).toBe('Ada');
    expect(p.lastName).toBe('Lovelace');
  });

  it('extracts email and phone', () => {
    expect(p.email).toBe('ada.lovelace@example.com');
    expect(p.phone).toContain('555');
  });

  it('classifies links by host', () => {
    expect(p.linkedin).toContain('linkedin.com/in/adalovelace');
    expect(p.github).toContain('github.com/ada');
    expect(p.portfolio).toContain('adalovelace.dev');
  });

  it('extracts known skills (and not spurious ones)', () => {
    expect(p.skills).toEqual(
      expect.arrayContaining([
        'javascript',
        'typescript',
        'react',
        'node.js',
        'postgresql',
        'docker',
      ]),
    );
    expect(p.skills).not.toContain('go'); // "go" must not match inside other words
  });

  it('returns empty-ish for junk text', () => {
    const j = parseResumeText('lorem ipsum dolor sit amet');
    expect(j.email).toBeUndefined();
    expect(j.skills).toEqual([]);
  });
});

describe('applyParsedResume', () => {
  it('fills empty profile fields without overwriting existing ones', () => {
    const parsed = parseResumeText(SAMPLE);
    const filled = applyParsedResume(EMPTY, parsed);
    expect(filled.personal.firstName).toBe('Ada');
    expect(filled.personal.email).toBe('ada.lovelace@example.com');
    expect(filled.links.github).toContain('github.com/ada');
    expect(filled.skills).toContain('react');

    // Non-destructive: a pre-set value is preserved.
    const withName = { ...EMPTY, personal: { ...EMPTY.personal, firstName: 'Augusta' } };
    expect(applyParsedResume(withName, parsed).personal.firstName).toBe('Augusta');
  });
});

describe('mergeExtractedResume (AI structured extraction)', () => {
  it('adds valid experience and education rows with generated ids', () => {
    const out = mergeExtractedResume(EMPTY, {
      experience: [{ title: 'Engineer', company: 'Acme', startDate: '2020', endDate: '2023' }],
      education: [{ school: 'MIT', degree: 'BS', field: 'CS', startDate: '2016' }],
      skills: ['rust', 'go'],
    });
    expect(out.experience).toHaveLength(1);
    expect(out.experience[0].company).toBe('Acme');
    expect(out.experience[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(out.education[0].school).toBe('MIT');
    expect(out.skills).toEqual(expect.arrayContaining(['rust', 'go']));
  });

  it('drops rows that fail schema validation (e.g. a non-ISO date)', () => {
    const out = mergeExtractedResume(EMPTY, {
      experience: [{ title: 'X', company: 'Y', startDate: 'Jan 2020' }], // bad date format
    });
    expect(out.experience).toHaveLength(0);
  });

  it('dedupes by company+title and never throws on junk input', () => {
    const once = mergeExtractedResume(EMPTY, {
      experience: [{ title: 'Engineer', company: 'Acme', startDate: '2020' }],
    });
    const twice = mergeExtractedResume(once, {
      experience: [{ title: 'Engineer', company: 'Acme', startDate: '2021' }],
    });
    expect(twice.experience).toHaveLength(1);
    expect(mergeExtractedResume(EMPTY, null)).toEqual(EMPTY);
    expect(mergeExtractedResume(EMPTY, 'garbage')).toEqual(EMPTY);
    expect(mergeExtractedResume(EMPTY, { experience: 'not-an-array' }).experience).toEqual([]);
  });
});
