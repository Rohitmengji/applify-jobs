import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { greenhouse } from '@/core/engine/adapters/greenhouse';
import { lever } from '@/core/engine/adapters/lever';
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

describe('matchAdapter registry', () => {
  it('returns greenhouse for a greenhouse page', () => {
    document.body.innerHTML = fixture('greenhouse.html');
    expect(matchAdapter(new URL('https://job-boards.greenhouse.io/x'), document)?.id).toBe(
      'greenhouse',
    );
  });
  it('returns null for an unknown page', () => {
    document.body.innerHTML = '<form><input name="q" /></form>';
    expect(matchAdapter(new URL('https://example.com/careers'), document)).toBeNull();
  });
});
