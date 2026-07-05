import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, type SectionProps } from '../components/ui';

const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'SGD', 'AED', 'JPY', 'CHF', 'NZD'];
const PERIODS = [
  { value: 'year', label: 'Per year' },
  { value: 'month', label: 'Per month' },
  { value: 'hour', label: 'Per hour' },
];

const selectCls =
  'w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

export function SalarySection({ draft, setDraft }: SectionProps) {
  const s = draft.salary ?? { period: 'year' };
  const setS = (patch: Partial<Profile['salary']>) =>
    setDraft((d) => ({ ...d, salary: { ...d.salary, ...patch } }));

  // Approximate conversion preview
  const rates: Record<string, number> = {
    USD: 1,
    INR: 0.012,
    GBP: 1.27,
    EUR: 1.09,
    CAD: 0.74,
    AUD: 0.66,
    SGD: 0.74,
    AED: 0.27,
    JPY: 0.0067,
    CHF: 1.12,
    NZD: 0.61,
  };
  const expectedAmt = parseInt((s.expected ?? '').replace(/[^0-9]/g, ''), 10);
  const currentAmt = parseInt((s.current ?? '').replace(/[^0-9]/g, ''), 10);
  const amount = expectedAmt || currentAmt;
  const homeRate = rates[s.currency ?? ''] ?? 1;

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
            value={s.currency ?? ''}
            onChange={(e) => setS({ currency: e.target.value || undefined })}
            className={selectCls}
          >
            <option value="">— select —</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Period">
          <select
            value={s.period}
            onChange={(e) => setS({ period: e.target.value })}
            className={selectCls}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {amount > 0 && s.currency && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
          <p className="font-medium text-slate-300 mb-2 text-xs">
            Conversion preview (approximate):
          </p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs text-slate-400">
            {['USD', 'GBP', 'EUR', 'INR', 'CAD', 'AUD']
              .filter((c) => c !== s.currency)
              .map((c) => {
                const converted = Math.round((amount * homeRate) / (rates[c] ?? 1));
                return (
                  <span key={c} className="flex items-center justify-between">
                    <span className="text-slate-500">{c}:</span>
                    <span className="font-mono text-slate-200">{converted.toLocaleString()}</span>
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {(currentAmt > 0 || expectedAmt > 0) && (
        <div className="mt-2 rounded-md bg-indigo-900/30 border border-indigo-800/50 px-3 py-2 text-xs text-indigo-300">
          {currentAmt > 0 && `Current: ${s.currency ?? ''} ${currentAmt.toLocaleString()}`}
          {currentAmt > 0 && expectedAmt > 0 && ' | '}
          {expectedAmt > 0 && `Expected: ${s.currency ?? ''} ${expectedAmt.toLocaleString()}`}
          {s.currency === 'INR' && expectedAmt > 0 && ` (${(expectedAmt / 100000).toFixed(1)} LPA)`}
          {` / ${s.period}`}
        </div>
      )}
    </Section>
  );
}
