import { describe, it, expect } from 'vitest';
import { normalizeTailored, tailoredToPlainText } from '@/core/resume/tailored';

describe('normalizeTailored', () => {
  it('coerces a well-formed LLM response', () => {
    const t = normalizeTailored({
      name: '  Ada Lovelace ',
      contact: 'ada@x.com · 555 · London',
      summary: 'Engineer.',
      experience: [
        { title: 'Lead', company: 'Acme', dates: '2020–now', bullets: ['Shipped X', ' '] },
      ],
      education: [{ degree: 'BSc', school: 'MIT', dates: '2014' }],
      skills: ['SQL', ' Python ', ''],
    });
    expect(t).not.toBeNull();
    expect(t!.name).toBe('Ada Lovelace');
    expect(t!.experience[0].bullets).toEqual(['Shipped X']); // blank dropped
    expect(t!.skills).toEqual(['SQL', 'Python']); // trimmed + blank dropped
  });

  it('drops malformed experience/education entries', () => {
    const t = normalizeTailored({
      name: 'X',
      experience: [{ bullets: ['only a bullet, no title/company'] }, 'garbage', null],
      education: [{}, { school: 'MIT' }],
    });
    expect(t!.experience).toEqual([]); // entry had no title/company
    expect(t!.education).toEqual([{ degree: '', school: 'MIT', dates: '' }]);
  });

  it('returns null when there is nothing usable', () => {
    expect(normalizeTailored({})).toBeNull();
    expect(normalizeTailored(null)).toBeNull();
    expect(normalizeTailored('nope')).toBeNull();
    expect(normalizeTailored({ skills: ['SQL'] })).toBeNull(); // no name, no experience
  });

  it('caps runaway sizes', () => {
    const bullets = Array.from({ length: 50 }, (_, i) => `b${i}`);
    const t = normalizeTailored({
      name: 'X',
      experience: [{ title: 'T', company: 'C', dates: '', bullets }],
      skills: Array.from({ length: 100 }, (_, i) => `s${i}`),
    });
    expect(t!.experience[0].bullets.length).toBe(8);
    expect(t!.skills.length).toBe(40);
  });
});

describe('tailoredToPlainText', () => {
  it('renders a readable preview with sections', () => {
    const text = tailoredToPlainText({
      name: 'Ada',
      contact: 'ada@x.com',
      summary: 'Sum.',
      experience: [{ title: 'Lead', company: 'Acme', dates: '2020', bullets: ['Did X'] }],
      education: [{ degree: 'BSc', school: 'MIT', dates: '2014' }],
      skills: ['SQL', 'Python'],
    });
    expect(text).toContain('Ada');
    expect(text).toContain('EXPERIENCE');
    expect(text).toContain('Lead — Acme');
    expect(text).toContain('• Did X');
    expect(text).toContain('SKILLS');
    expect(text).toContain('SQL · Python');
  });
});
