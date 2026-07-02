import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { workday } from '@/core/engine/adapters/workday';
import { fillRepeatableSections } from '@/core/engine/sections';
import type { Profile } from '@/core/profile.schema';

// Verifies the REAL Workday selectors (data-automation-id scheme) against realistic markup,
// end-to-end through the adapter + section pipeline — not hand-built objects. If a tenant's
// markup drifts from this fixture, swap in captured DOM and these tests localize the break.
const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

const profileWith = (experience: unknown[], education: unknown[]): Profile =>
  ({ experience, education }) as unknown as Profile;
const exp = (o: Record<string, unknown>) => ({
  id: 'x',
  title: 'Engineer',
  company: 'Acme',
  location: 'NYC',
  startDate: '2020-03',
  endDate: '2022-06',
  current: false,
  description: 'Did things',
  ...o,
});
const edu = (o: Record<string, unknown>) => ({
  id: 'e',
  school: 'MIT',
  degree: 'BSc',
  field: 'CS',
  startDate: '2014',
  endDate: '2018',
  gpa: '3.9',
  ...o,
});

const q = (root: ParentNode, sel: string) => root.querySelector<HTMLInputElement>(sel)!;

beforeEach(() => {
  document.body.innerHTML = fixture('workday-sections.html');
});

describe('workday adapter — detection against realistic markup', () => {
  it('drops global-nav chrome (language/account buttons) from detected fields', () => {
    const labels = workday.detectFields!(document).map((f) =>
      (f.signals.label || f.signals.ariaLabel || '').toLowerCase(),
    );
    expect(labels.some((l) => /selector button|account settings/.test(l))).toBe(false);
  });
});

describe('workday sections — fill against realistic markup', () => {
  it('fills both pre-rendered experience panels with the right values', async () => {
    const res = await fillRepeatableSections(
      profileWith(
        [
          exp({ company: 'Acme', title: 'Lead', current: true }),
          exp({ company: 'Globex', title: 'Dev', startDate: '2016-01', endDate: '2019-12' }),
        ],
        [],
      ),
      'workday',
    );
    expect(res.experience).toBe(2);

    const panels = document.querySelectorAll<HTMLElement>(
      '[data-automation-id^="workExperience-"]',
    );
    expect(q(panels[0], '[data-automation-id="company"]').value).toBe('Acme');
    expect(q(panels[1], '[data-automation-id="company"]').value).toBe('Globex');

    // Current role → checkbox checked, end date left blank; start date split into month/year.
    expect(panels[0].querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
    expect(
      q(
        panels[0],
        '[data-automation-id="formField-endDate"] [data-automation-id="dateSectionYear-input"]',
      ).value,
    ).toBe('');
    expect(
      q(
        panels[0],
        '[data-automation-id="formField-startDate"] [data-automation-id="dateSectionYear-input"]',
      ).value,
    ).toBe('2020');

    // Non-current role → end date filled.
    expect(
      q(
        panels[1],
        '[data-automation-id="formField-endDate"] [data-automation-id="dateSectionYear-input"]',
      ).value,
    ).toBe('2019');
  });

  it('fills the education panel (school, text-input degree, dates, gpa)', async () => {
    const res = await fillRepeatableSections(
      profileWith(
        [],
        [edu({ school: 'MIT', degree: 'BSc Computer Science', gpa: '3.9', endDate: '2018' })],
      ),
      'workday',
    );
    expect(res.education).toBe(1);

    const panel = document.querySelector<HTMLElement>('[data-automation-id="education-1"]')!;
    expect(q(panel, '[data-automation-id="school"]').value).toBe('MIT');
    expect(q(panel, '[data-automation-id="degree"]').value).toBe('BSc Computer Science');
    expect(q(panel, '[data-automation-id="gradeAverage"]').value).toBe('3.9');
    expect(
      q(
        panel,
        '[data-automation-id="formField-endDate"] [data-automation-id="dateSectionYear-input"]',
      ).value,
    ).toBe('2018');
  });
});
