import { describe, it, expect } from 'vitest';
import { matchField } from '@/core/engine/heuristic';
import type { DetectedField, FieldSignals } from '@/core/types';

function field(signals: Partial<FieldSignals>): DetectedField {
  return {
    uid: 'x',
    kind: 'text',
    signals: {
      label: '',
      name: '',
      id: '',
      placeholder: '',
      ariaLabel: '',
      autocomplete: '',
      nearbyText: '',
      required: false,
      ...signals,
    },
    mappedKey: null,
    confidence: 0,
    value: null,
    source: 'none',
    filled: false,
  };
}

describe('matchField', () => {
  it('maps a "First Name" label to personal.firstName', () => {
    const r = matchField(field({ label: 'First Name' }));
    expect(r.key).toBe('personal.firstName');
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('maps the "Given Name" synonym to firstName', () => {
    expect(matchField(field({ label: 'Given Name' })).key).toBe('personal.firstName');
  });

  it('treats autocomplete as authoritative (≥0.98) over a misleading label', () => {
    const r = matchField(field({ autocomplete: 'family-name', label: 'Surname or whatever' }));
    expect(r.key).toBe('personal.lastName');
    expect(r.confidence).toBeGreaterThanOrEqual(0.98);
  });

  it('maps email and phone', () => {
    expect(matchField(field({ label: 'Email Address' })).key).toBe('personal.email');
    expect(matchField(field({ label: 'Mobile' })).key).toBe('personal.phone');
  });

  it('maps social links', () => {
    expect(matchField(field({ label: 'LinkedIn Profile' })).key).toBe('links.linkedin');
    expect(matchField(field({ label: 'GitHub' })).key).toBe('links.github');
  });

  it('maps sponsorship and work-authorization questions', () => {
    expect(
      matchField(field({ label: 'Will you now or in the future require sponsorship?' })).key,
    ).toBe('workAuth.needsSponsorship');
    expect(matchField(field({ label: 'Are you legally authorized to work?' })).key).toBe(
      'workAuth.authorizedToWork',
    );
  });

  it('weights label more heavily than nearby text', () => {
    const byLabel = matchField(field({ label: 'Phone' }));
    const byNearby = matchField(field({ nearbyText: 'Phone' }));
    expect(byLabel.key).toBe('personal.phone');
    expect(byNearby.key).toBe('personal.phone');
    expect(byNearby.confidence).toBeLessThan(byLabel.confidence);
  });

  it('returns null when nothing matches', () => {
    expect(matchField(field({ label: 'Favorite ice cream flavor' })).key).toBeNull();
  });

  // M6 acceptance proxy: a realistic generic (no-adapter) career form. The spec target
  // is ≥70% of standard fields mapped correctly with no adapter.
  it('maps ≥80% of a realistic generic career form correctly', () => {
    const cases: [string, string][] = [
      ['First Name', 'personal.firstName'],
      ['Last Name', 'personal.lastName'],
      ['Email Address', 'personal.email'],
      ['Mobile Number', 'personal.phone'],
      ['Street Address', 'personal.address.line1'],
      ['City', 'personal.address.city'],
      ['State/Province', 'personal.address.state'],
      ['ZIP Code', 'personal.address.zip'],
      ['Country', 'personal.address.country'],
      ['LinkedIn URL', 'links.linkedin'],
      ['GitHub', 'links.github'],
      ['Portfolio', 'links.portfolio'],
      ['Are you legally authorized to work in the US?', 'workAuth.authorizedToWork'],
      ['Will you now or in the future require sponsorship?', 'workAuth.needsSponsorship'],
      ['Resume/CV', 'documents.resume'],
    ];
    const correct = cases.filter(([label, key]) => matchField(field({ label })).key === key).length;
    expect(correct / cases.length).toBeGreaterThanOrEqual(0.8);
    // And no case should map to a *wrong* non-null key.
    const wrong = cases.filter(([label, key]) => {
      const got = matchField(field({ label })).key;
      return got !== null && got !== key;
    });
    expect(wrong).toEqual([]);
  });
});
