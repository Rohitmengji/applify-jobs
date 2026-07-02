import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { greenhouse } from '@/core/engine/adapters/greenhouse';
import { lever } from '@/core/engine/adapters/lever';
import { workable } from '@/core/engine/adapters/workable';
import { jazzhr } from '@/core/engine/adapters/jazzhr';
import { smartrecruiters } from '@/core/engine/adapters/smartrecruiters';
import { ashby } from '@/core/engine/adapters/ashby';
import { workday } from '@/core/engine/adapters/workday';
import { icims } from '@/core/engine/adapters/icims';
import { successfactors } from '@/core/engine/adapters/successfactors';
import { oracle } from '@/core/engine/adapters/oracle';
import { matchAdapter } from '@/core/engine/adapters';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

describe('greenhouse adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('greenhouse.html');
  });

  it('matches a Greenhouse page', () => {
    expect(
      greenhouse.matches(new URL('https://job-boards.greenhouse.io/acme/jobs/1'), document),
    ).toBe(true);
  });

  it('maps canonical ids with high confidence + adapter source', () => {
    const fields = greenhouse.detectFields!(document);
    const fn = fields.find((f) => f.signals.id === 'first_name');
    expect(fn?.mappedKey).toBe('personal.firstName');
    expect(fn?.confidence).toBeGreaterThanOrEqual(0.99);
    expect(fn?.source).toBe('adapter');
    expect(fields.find((f) => f.signals.id === 'email')?.mappedKey).toBe('personal.email');
    expect(fields.find((f) => f.signals.id === 'last_name')?.mappedKey).toBe('personal.lastName');
  });

  it('detects the résumé file input', () => {
    const fields = greenhouse.detectFields!(document);
    expect(fields.some((f) => f.kind === 'file')).toBe(true);
  });
});

describe('lever adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('lever.html');
  });

  it('matches a Lever page', () => {
    expect(lever.matches(new URL('https://jobs.lever.co/acme/abc'), document)).toBe(true);
  });

  it('maps name-attribute fields', () => {
    const fields = lever.detectFields!(document);
    expect(fields.find((f) => f.signals.name === 'name')?.mappedKey).toBe('personal.firstName');
    expect(fields.find((f) => f.signals.name === 'urls[LinkedIn]')?.mappedKey).toBe(
      'links.linkedin',
    );
    expect(fields.find((f) => f.signals.name === 'resume')?.mappedKey).toBe('documents.resume');
  });
});

describe('workable adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('workable.html');
  });
  it('matches and maps core name-attribute fields', () => {
    expect(workable.matches(new URL('https://apply.workable.com/acme/'), document)).toBe(true);
    const fields = workable.detectFields!(document);
    expect(fields.find((f) => f.signals.name === 'firstname')?.mappedKey).toBe(
      'personal.firstName',
    );
    expect(fields.find((f) => f.signals.name === 'email')?.mappedKey).toBe('personal.email');
    expect(fields.find((f) => f.signals.name === 'resume')?.mappedKey).toBe('documents.resume');
  });
});

describe('jazzhr adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('jazzhr.html');
  });
  it('matches and maps classic name fields', () => {
    expect(jazzhr.matches(new URL('https://acme.applytojob.com/apply/x'), document)).toBe(true);
    const fields = jazzhr.detectFields!(document);
    expect(fields.find((f) => f.signals.name === 'first_name')?.mappedKey).toBe(
      'personal.firstName',
    );
    expect(fields.find((f) => f.signals.name === 'city')?.mappedKey).toBe('personal.address.city');
  });
});

describe('smartrecruiters adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('smartrecruiters.html');
  });
  it('matches and maps via data-test hooks', () => {
    expect(
      smartrecruiters.matches(new URL('https://jobs.smartrecruiters.com/acme/x'), document),
    ).toBe(true);
    const fields = smartrecruiters.detectFields!(document);
    expect(fields.find((f) => f.signals.id === 'fn')?.mappedKey).toBe('personal.firstName');
    expect(fields.find((f) => f.signals.id === 'ph')?.mappedKey).toBe('personal.phone');
  });
});

describe('ashby adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('ashby.html');
  });
  it('matches by host and by container class (relies on the generic detector)', () => {
    expect(ashby.matches(new URL('https://jobs.ashbyhq.com/acme/x'), document)).toBe(true);
    expect(ashby.detectFields).toBeUndefined();
  });
});

describe('workday adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('workday.html');
  });
  it('matches workday hosts (subdomain + wdN)', () => {
    expect(
      workday.matches(new URL('https://acme.wd1.myworkdayjobs.com/en-US/acme/job/1'), document),
    ).toBe(true);
    expect(workday.matches(new URL('https://acme.myworkdayjobs.com/x'), document)).toBe(true);
    expect(workday.matches(new URL('https://example.com/x'), document)).toBe(false);
    // Spoof host must NOT match (finding #7 — the bare /\.wdN\./ branch was removed).
    expect(workday.matches(new URL('https://evil.wd1.attacker.com/x'), document)).toBe(false);
  });
  it('maps data-automation-id fields', () => {
    const fields = workday.detectFields!(document);
    expect(fields.some((f) => f.mappedKey === 'personal.firstName')).toBe(true);
    expect(fields.some((f) => f.mappedKey === 'personal.email')).toBe(true);
  });
  it('is multi-step, finds Next, and is not yet at review', () => {
    expect(workday.isMultiStep!(document)).toBe(true);
    expect(workday.isReviewStep!(document)).toBe(false);
    expect(workday.findNextButton!(document)).toBeTruthy();
  });
  it('detects custom "Select One" dropdowns and repairs their labels', () => {
    const fields = workday.detectFields!(document);
    const custom = fields.filter((f) => f.kind === 'select-custom');
    expect(custom.length).toBeGreaterThanOrEqual(2); // the two aria-haspopup dropdowns
    const labels = fields.map((f) => f.signals.label);
    expect(labels).toContain('Are you legally authorized to work in this country?');
    expect(labels).toContain('Will you now or in the future require sponsorship?'); // suffix stripped
    expect(labels).toContain('Why do you want to work here?'); // field-group climb
    expect(labels).not.toContain('Select One'); // never the placeholder/raw id
  });
});

describe('hard multi-step adapters (iCIMS / SuccessFactors / Oracle)', () => {
  it('iCIMS matches its host and maps name fields', () => {
    document.body.innerHTML =
      '<form><label for="f">First Name</label><input id="f" name="firstname" />' +
      '<button>Continue</button></form>';
    expect(icims.matches(new URL('https://careers-acme.icims.com/jobs/1/apply'), document)).toBe(
      true,
    );
    const fields = icims.detectFields!(document);
    expect(fields.some((f) => f.mappedKey === 'personal.firstName')).toBe(true);
    expect(icims.isMultiStep!(document)).toBe(true);
    expect(icims.findNextButton!(document)?.textContent).toMatch(/continue/i);
  });

  it('does NOT treat a mid-flow step as review just because Submit exists (finding #3)', () => {
    // Both Next and Submit present → not review yet.
    document.body.innerHTML = '<button>Continue</button><button>Submit Application</button>';
    expect(icims.isReviewStep!(document)).toBe(false);
    // Only Submit, no Next → review.
    document.body.innerHTML = '<button>Submit Application</button>';
    expect(icims.isReviewStep!(document)).toBe(true);
    // A hidden Submit does not trip review.
    document.body.innerHTML =
      '<button>Continue</button><button style="display:none">Submit</button>';
    expect(icims.isReviewStep!(document)).toBe(false);
  });

  it('SuccessFactors matches successfactors.com and sapsf.com', () => {
    document.body.innerHTML = '<button>Next</button>';
    expect(successfactors.matches(new URL('https://career5.successfactors.com/x'), document)).toBe(
      true,
    );
    expect(
      successfactors.matches(new URL('https://performancemanager.sapsf.com/x'), document),
    ).toBe(true);
    expect(successfactors.isMultiStep!(document)).toBe(true);
    expect(successfactors.findNextButton!(document)).toBeTruthy();
  });

  it('Oracle matches Taleo and Oracle Cloud', () => {
    document.body.innerHTML = '<button>Save and Continue</button>';
    expect(oracle.matches(new URL('https://acme.taleo.net/careersection/x'), document)).toBe(true);
    expect(oracle.matches(new URL('https://acme.fa.us2.oraclecloud.com/hcmUI/x'), document)).toBe(
      true,
    );
    expect(oracle.findNextButton!(document)?.textContent).toMatch(/continue/i);
  });
});

describe('matchAdapter registry', () => {
  it('returns greenhouse for a greenhouse page', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    expect(matchAdapter(new URL('https://job-boards.greenhouse.io/x'), document)?.id).toBe(
      'greenhouse',
    );
  });
  it('returns workable / jazzhr / smartrecruiters / ashby for their hosts', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://apply.workable.com/acme/'), document)?.id).toBe(
      'workable',
    );
    expect(matchAdapter(new URL('https://acme.applytojob.com/x'), document)?.id).toBe('jazzhr');
    expect(matchAdapter(new URL('https://jobs.smartrecruiters.com/acme/x'), document)?.id).toBe(
      'smartrecruiters',
    );
    expect(matchAdapter(new URL('https://jobs.ashbyhq.com/acme/x'), document)?.id).toBe('ashby');
  });
  it('returns null for an unknown page', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://example.com/careers'), document)).toBeNull();
  });

  it('returns indeed for smartapply.indeed.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://smartapply.indeed.com/form/x'), document)?.id).toBe(
      'indeed',
    );
  });

  it('returns jobvite for *.jobvite.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://jobs.jobvite.com/acme/x'), document)?.id).toBe('jobvite');
  });

  it('returns linkedin for linkedin.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://www.linkedin.com/jobs/view/x'), document)?.id).toBe(
      'linkedin',
    );
  });

  it('returns naukri for naukri.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://www.naukri.com/apply/x'), document)?.id).toBe('naukri');
  });

  it('returns bamboohr for *.bamboohr.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://acme.bamboohr.com/careers/x'), document)?.id).toBe(
      'bamboohr',
    );
  });

  it('returns zohorecruit for *.zohorecruit.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://acme.zohorecruit.com/x'), document)?.id).toBe(
      'zohorecruit',
    );
  });

  it('returns wellfound for wellfound.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://wellfound.com/company/x'), document)?.id).toBe(
      'wellfound',
    );
  });

  it('returns dice for dice.com', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://www.dice.com/apply/x'), document)?.id).toBe('dice');
  });
});
