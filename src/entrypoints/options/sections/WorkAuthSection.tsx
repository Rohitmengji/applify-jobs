import { useState } from 'react';
import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, Toggle, Button, type SectionProps } from '../components/ui';

export function WorkAuthSection({ draft, setDraft }: SectionProps) {
  const w = draft.workAuth;
  const setW = (patch: Partial<Profile['workAuth']>) =>
    setDraft((d) => ({ ...d, workAuth: { ...d.workAuth, ...patch } }));

  const [country, setCountry] = useState('');
  const addCountry = () => {
    const c = country.trim();
    if (!c) return;
    setW({
      authorizedCountries: w.authorizedCountries.includes(c)
        ? w.authorizedCountries
        : [...w.authorizedCountries, c],
    });
    setCountry('');
  };
  const removeCountry = (i: number) =>
    setW({ authorizedCountries: w.authorizedCountries.filter((_, idx) => idx !== i) });

  return (
    <Section
      title="Work authorization"
      description="Answers the common authorization / sponsorship questions — and adapts to the country the question names."
    >
      <Field
        label="Countries you can work in without sponsorship"
        hint={`When a question names a country, the answer is derived from this list. Empty → your home country (${draft.personal.address.country || 'not set'}).`}
      >
        <div className="flex gap-2">
          <div className="flex-1">
            <TextInput
              value={country}
              onChange={setCountry}
              placeholder="e.g. India, United States"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCountry();
                }
              }}
            />
          </div>
          <Button onClick={addCountry}>Add</Button>
        </div>
      </Field>
      <div className="flex flex-wrap gap-2">
        {w.authorizedCountries.map((c, i) => (
          <span
            key={`${c}-${i}`}
            className="flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-800"
          >
            {c}
            <button
              onClick={() => removeCountry(i)}
              className="text-indigo-400 hover:text-indigo-700"
              title="Remove"
            >
              ✕
            </button>
          </span>
        ))}
        {w.authorizedCountries.length === 0 && (
          <span className="text-xs text-slate-500">
            None added — defaults to your home country.
          </span>
        )}
      </div>

      <h3 className="pt-3 text-sm font-semibold text-slate-300">
        Defaults (used only when a question doesn’t name a country)
      </h3>
      <Toggle
        checked={w.authorizedToWork}
        onChange={(v) => setW({ authorizedToWork: v })}
        label="I am legally authorized to work."
      />
      <Toggle
        checked={w.needsSponsorship}
        onChange={(v) => setW({ needsSponsorship: v })}
        label="I now or in the future require visa sponsorship."
      />
      <Toggle
        checked={w.requiresVisa}
        onChange={(v) => setW({ requiresVisa: v })}
        label="I require a visa to work."
      />
    </Section>
  );
}
