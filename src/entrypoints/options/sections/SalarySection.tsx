import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, type SectionProps } from '../components/ui';

const CURRENCIES = [
  'INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'SGD', 'AED', 'JPY', 'CHF', 'NZD',
];
const PERIODS = [
  { value: 'year', label: 'Per year' },
  { value: 'month', label: 'Per month' },
  { value: 'hour', label: 'Per hour' },
];

export function SalarySection({ draft, setDraft }: SectionProps) {
  const s = draft.salary ?? { currency: 'INR', period: 'year' };
  const setS = (patch: Partial<Profile['salary']>) =>
    setDraft((d) => ({ ...d, salary: { ...d.salary, ...patch } }));

  // Approximate conversion preview
  const rates: Record<string, number> = {
    USD: 1, INR: 0.012, GBP: 1.27, EUR: 1.09, CAD: 0.74,
    AUD: 0.66, SGD: 0.74, AED: 0.27, JPY: 0.0067, CHF: 1.12, NZD: 0.61,
  };
  const expectedAmt = parseInt((s.expected ?? '').replace(/[^0-9]/g, ''), 10);
  const currentAmt = parseInt((s.current ?? '').replace(/[^0-9]/g, ''), 10);
  const amount = expectedAmt || currentAmt;
  const homeRate = rates[s.currency] ?? 1;

  return (
    <Section
      title="Salary"
      description="Your current and expected compensation. Auto-converts when a form asks in a different currency."
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current CTC / Salary">
          <TextInput
            value={s.current ?? ''}
            onChange={(v) => setS({ current: v.replace(/[^0-9]/g, '') })}
            placeholder="e.g. 1212000"
          />
        </Field>
        <Field label="Expected / Desired Salary">
          <TextInput
            value={s.expected ?? ''}
            onChange={(v) => setS({ expected: v.replace(/[^0-9]/g, '') })}
            placeholder="e.g. 2475000"
          />
        </Field>
        <Field label="Currency">
          <select
            value={s.currency}
            onChange={(e) => setS({ currency: e.target.value })}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Period">
          <select
            value={s.period}
            onChange={(e) => setS({ period: e.target.value })}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {amount > 0 && (
        <div className="mt-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-medium text-gray-700 mb-1">Conversion preview (approximate):</p>
          <div className="grid grid-cols-3 gap-2">
            {['USD', 'GBP', 'EUR', 'INR', 'CAD', 'AUD'].filter((c) => c !== s.currency).map((c) => {
              const converted = Math.round((amount * homeRate) / (rates[c] ?? 1));
              return (
                <span key={c}>
                  {c}: {converted.toLocaleString()}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {(currentAmt > 0 || expectedAmt > 0) && (
        <p className="text-xs text-gray-400 mt-1">
          {currentAmt > 0 && `Current: ${s.currency} ${currentAmt.toLocaleString()}`}
          {currentAmt > 0 && expectedAmt > 0 && ' | '}
          {expectedAmt > 0 && `Expected: ${s.currency} ${expectedAmt.toLocaleString()}`}
          {s.currency === 'INR' && expectedAmt > 0 && ` (${(expectedAmt / 100000).toFixed(1)} LPA)`}
          {` / ${s.period}`}
        </p>
      )}
    </Section>
  );
}
