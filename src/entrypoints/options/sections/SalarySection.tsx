import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, type SectionProps } from '../components/ui';

const CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'SGD', 'AED', 'JPY', 'CHF', 'NZD'];
const PERIODS = [
  { value: 'year', label: 'Per year' },
  { value: 'month', label: 'Per month' },
  { value: 'hour', label: 'Per hour' },
];

// Markets the user can set explicit salary expectations for
const MARKETS = [
  { currency: 'USD', label: 'US', flag: '\u{1F1FA}\u{1F1F8}' },
  { currency: 'GBP', label: 'UK', flag: '\u{1F1EC}\u{1F1E7}' },
  { currency: 'EUR', label: 'Europe', flag: '\u{1F1EA}\u{1F1FA}' },
  { currency: 'CAD', label: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
  { currency: 'AUD', label: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { currency: 'SGD', label: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}' },
  { currency: 'AED', label: 'UAE', flag: '\u{1F1E6}\u{1F1EA}' },
];

const selectCls =
  'w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

export function SalarySection({ draft, setDraft }: SectionProps) {
  const s = draft.salary ?? { period: 'year' };
  const setS = (patch: Partial<Profile['salary']>) =>
    setDraft((d) => ({ ...d, salary: { ...d.salary, ...patch } }));

  const marketExp = s.marketExpectations ?? {};
  const setMarket = (currency: string, value: string) => {
    const updated = { ...marketExp, [currency]: value.replace(/[^0-9]/g, '') };
    if (!updated[currency]) delete updated[currency];
    setS({ marketExpectations: updated });
  };

  const expectedAmt = parseInt((s.expected ?? '').replace(/[^0-9]/g, ''), 10);
  const currentAmt = parseInt((s.current ?? '').replace(/[^0-9]/g, ''), 10);

  return (
    <Section
      title="Salary"
      description="Your home salary + per-market expectations. When a form asks in a specific currency, the market amount is used instead of a raw conversion."
    >
      {/* Home salary */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current CTC / Salary (home)">
          <TextInput
            value={s.current ?? ''}
            onChange={(v) => setS({ current: v.replace(/[^0-9]/g, '') })}
            placeholder="e.g. 1212000"
          />
        </Field>
        <Field label="Expected / Desired (home)">
          <TextInput
            value={s.expected ?? ''}
            onChange={(v) => setS({ expected: v.replace(/[^0-9]/g, '') })}
            placeholder="e.g. 2485000"
          />
        </Field>
        <Field label="Home Currency">
          <select
            value={s.currency ?? ''}
            onChange={(e) => setS({ currency: e.target.value || undefined })}
            className={selectCls}
          >
            <option value="">-- select --</option>
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

      {(currentAmt > 0 || expectedAmt > 0) && (
        <div className="mt-2 rounded-md bg-indigo-900/30 border border-indigo-800/50 px-3 py-2 text-xs text-indigo-300">
          {currentAmt > 0 && `Current: ${s.currency ?? ''} ${currentAmt.toLocaleString()}`}
          {currentAmt > 0 && expectedAmt > 0 && ' | '}
          {expectedAmt > 0 && `Expected: ${s.currency ?? ''} ${expectedAmt.toLocaleString()}`}
          {s.currency === 'INR' && expectedAmt > 0 && ` (${(expectedAmt / 100000).toFixed(1)} LPA)`}
          {` / ${s.period}`}
        </div>
      )}

      {/* Per-market salary expectations */}
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Market-Specific Expectations</h3>
        <p className="text-xs text-slate-500 mb-3">
          Set your expected salary for each overseas market. When a job form asks in that currency,
          this exact amount is filled -- no conversion math.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {MARKETS.filter((m) => m.currency !== s.currency).map((m) => (
            <div key={m.currency} className="flex items-center gap-2">
              <span className="text-base w-6 text-center">{m.flag}</span>
              <span className="text-[11px] text-slate-400 w-20 shrink-0">
                {m.label} ({m.currency})
              </span>
              <input
                type="text"
                value={marketExp[m.currency] ?? ''}
                onChange={(e) => setMarket(m.currency, e.target.value)}
                placeholder={
                  m.currency === 'USD'
                    ? '95600'
                    : m.currency === 'GBP'
                      ? '72000'
                      : m.currency === 'EUR'
                        ? '82500'
                        : ''
                }
                className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-600">/ {s.period}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
