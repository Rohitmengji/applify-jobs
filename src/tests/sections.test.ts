import { describe, it, expect, beforeEach } from 'vitest';
import { fillRepeatableSections } from '@/core/engine/sections';
import type { Profile } from '@/core/profile.schema';

// Build a Workday-style Work Experience panel with the automation-ids the spec targets.
function makeExpPanel(idx: number): HTMLElement {
  const panel = document.createElement('div');
  panel.setAttribute('data-automation-id', `workExperience-${idx}`);
  panel.innerHTML = `
    <input data-automation-id="jobTitle" />
    <input data-automation-id="company" />
    <input data-automation-id="location" />
    <label data-automation-id="currentlyWorkHere"><input type="checkbox" /></label>
    <div data-automation-id="startDate">
      <input data-automation-id="dateSectionMonth-input" />
      <input data-automation-id="dateSectionYear-input" />
    </div>
    <div data-automation-id="endDate">
      <input data-automation-id="dateSectionMonth-input" />
      <input data-automation-id="dateSectionYear-input" />
    </div>
    <textarea data-automation-id="roleDescription"></textarea>
  `;
  return panel;
}

// A section whose "Add" button appends the next panel synchronously (like a working ATS).
function mountWorkingSection(addAppends = true) {
  document.body.innerHTML = '';
  const section = document.createElement('div');
  section.setAttribute('data-automation-id', 'workExperienceSection');
  section.append(makeExpPanel(1));
  const add = document.createElement('button');
  add.setAttribute('data-automation-id', 'Add');
  add.textContent = 'Add Another';
  if (addAppends) {
    add.addEventListener('click', () => {
      const n = section.querySelectorAll('[data-automation-id^="workExperience-"]').length;
      section.insertBefore(makeExpPanel(n + 1), add);
    });
  }
  section.append(add);
  document.body.append(section);
  return section;
}

function profileWith(experience: unknown[], education: unknown[] = []): Profile {
  return { experience, education } as unknown as Profile;
}

const exp = (over: Record<string, unknown>) => ({
  id: 'x',
  title: 'Engineer',
  company: 'Acme',
  location: 'NYC',
  startDate: '2020-03',
  endDate: '2022-06',
  current: false,
  description: 'Did things',
  ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fillRepeatableSections — Workday experience', () => {
  it('fills the existing row and adds rows for the rest', async () => {
    const section = mountWorkingSection();
    const profile = profileWith([
      exp({ company: 'Acme', title: 'Engineer' }),
      exp({ company: 'Globex', title: 'Lead' }),
      exp({ company: 'Initech', title: 'Manager', current: true }),
    ]);

    const res = await fillRepeatableSections(profile, 'workday');

    expect(res.experience).toBe(3);
    const panels = section.querySelectorAll('[data-automation-id^="workExperience-"]');
    expect(panels.length).toBe(3);
    // Row values landed in the right panels.
    const companies = Array.from(panels).map(
      (p) => p.querySelector<HTMLInputElement>('[data-automation-id="company"]')!.value,
    );
    expect(companies).toEqual(['Acme', 'Globex', 'Initech']);
    // Start date split into month/year spinbuttons.
    const firstYear = panels[0].querySelector<HTMLInputElement>(
      '[data-automation-id="dateSectionYear-input"]',
    )!.value;
    expect(firstYear).toBe('2020');
  });

  it('checks "currently work here" and skips the end date for a current role', async () => {
    const section = mountWorkingSection();
    await fillRepeatableSections(
      profileWith([exp({ current: true, endDate: '2030-01' })]),
      'workday',
    );
    const panel = section.querySelector('[data-automation-id^="workExperience-"]')!;
    expect(panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    // End date left blank (current roles disable it).
    const endYear = panel.querySelectorAll<HTMLInputElement>(
      '[data-automation-id="dateSectionYear-input"]',
    )[1].value;
    expect(endYear).toBe('');
  });

  it('respects the hard row cap and never creates more than HARD_ROW_CAP rows', async () => {
    const section = mountWorkingSection();
    const many = Array.from({ length: 20 }, (_, i) => exp({ company: `Co${i}` }));
    const res = await fillRepeatableSections(profileWith(many), 'workday');
    expect(res.experience).toBe(8); // HARD_ROW_CAP
    expect(section.querySelectorAll('[data-automation-id^="workExperience-"]').length).toBe(8);
  });

  it('does NOT hang or loop when the Add button fails to create a row', async () => {
    // Add button exists but does nothing → waitForRows times out and the driver stops.
    const section = mountWorkingSection(false);
    const res = await fillRepeatableSections(
      profileWith([exp({ company: 'Acme' }), exp({ company: 'Globex' })]),
      'workday',
    );
    expect(res.experience).toBe(1); // only the pre-existing row got filled
    expect(section.querySelectorAll('[data-automation-id^="workExperience-"]').length).toBe(1);
  }, 10000);

  it('does not fill (or falsely warn) when no section is present', async () => {
    mountWorkingSection(); // Workday-shaped panels, but no "Work Experience" heading
    const res = await fillRepeatableSections(profileWith([exp({})]), 'greenhouse');
    expect(res.experience).toBe(0);
    expect(res.expFound).toBe(false); // → panel won't show the "couldn't fill" warning
  });

  it('is a no-op when the profile has no experience rows', async () => {
    mountWorkingSection();
    const res = await fillRepeatableSections(profileWith([]), 'workday');
    expect(res.experience).toBe(0);
  });
});

describe('fillRepeatableSections — generic (label-driven) filler', () => {
  // A titled section with plainly-labelled inputs, like iCIMS / SuccessFactors / Oracle.
  function mountExpSection(rows: number, opts: { heading?: string } = {}) {
    document.body.innerHTML = '';
    const sec = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = opts.heading ?? 'Work Experience';
    sec.append(h);
    for (let i = 0; i < rows; i++) {
      for (const label of ['Company', 'Job Title', 'Start Date', 'End Date']) {
        const input = document.createElement('input');
        input.setAttribute('aria-label', label);
        sec.append(input);
      }
    }
    document.body.append(sec);
    return sec;
  }
  const val = (sec: HTMLElement, label: string, idx = 0) =>
    sec.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`)[idx].value;

  it('fills a single labelled experience block from the most recent entry', async () => {
    const sec = mountExpSection(1);
    const res = await fillRepeatableSections(
      profileWith([exp({ company: 'Acme', title: 'Engineer', startDate: '2020-03' })]),
      'icims', // no spec → generic path
    );
    expect(res.experience).toBe(1);
    expect(res.expFound).toBe(true);
    expect(val(sec, 'Company')).toBe('Acme');
    expect(val(sec, 'Job Title')).toBe('Engineer');
    expect(val(sec, 'Start Date')).toBe('2020-03');
  });

  it('aligns multiple pre-existing rows by DOM order', async () => {
    const sec = mountExpSection(2);
    const res = await fillRepeatableSections(
      profileWith([exp({ company: 'Acme' }), exp({ company: 'Globex' })]),
      'oracle',
    );
    expect(res.experience).toBe(2);
    expect(val(sec, 'Company', 0)).toBe('Acme');
    expect(val(sec, 'Company', 1)).toBe('Globex');
  });

  it('does NOT touch fields when there is no section heading (safety gate)', async () => {
    const sec = mountExpSection(1, { heading: 'Contact Details' }); // wrong heading
    const res = await fillRepeatableSections(profileWith([exp({ company: 'Acme' })]), 'icims');
    expect(res.experience).toBe(0);
    expect(res.expFound).toBe(false); // no warning either — there was no section here
    expect(val(sec, 'Company')).toBe(''); // untouched — no mis-fill on a plain form
  });

  it('leaves the end date blank for a current role', async () => {
    const sec = mountExpSection(1);
    // add a "currently work here" checkbox to the section
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.setAttribute('aria-label', 'I currently work here');
    sec.append(cb);
    await fillRepeatableSections(
      profileWith([exp({ company: 'Acme', current: true, endDate: '2030-01' })]),
      'icims',
    );
    expect(cb.checked).toBe(true);
    expect(val(sec, 'End Date')).toBe('');
  });
});
