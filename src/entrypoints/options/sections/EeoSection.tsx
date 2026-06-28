import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, type SectionProps } from '../components/ui';

// IMPLEMENTATION.md §18/§25 — voluntary self-identification. Everything is optional
// and defaults to blank ("decline to self-identify"). Never guessed by the engine.
export function EeoSection({ draft, setDraft }: SectionProps) {
  const e = draft.eeo;
  const setE = (patch: Partial<Profile['eeo']>) =>
    setDraft((d) => ({ ...d, eeo: { ...d.eeo, ...patch } }));

  return (
    <Section
      title="EEO (voluntary)"
      description="All optional. Leave blank to decline to self-identify — the engine never guesses these."
    >
      <Field label="Gender">
        <TextInput value={e.gender ?? ''} onChange={(v) => setE({ gender: v })} />
      </Field>
      <Field label="Race">
        <TextInput value={e.race ?? ''} onChange={(v) => setE({ race: v })} />
      </Field>
      <Field label="Hispanic / Latino">
        <TextInput value={e.hispanicLatino ?? ''} onChange={(v) => setE({ hispanicLatino: v })} />
      </Field>
      <Field label="Veteran status">
        <TextInput value={e.veteranStatus ?? ''} onChange={(v) => setE({ veteranStatus: v })} />
      </Field>
      <Field label="Disability status">
        <TextInput
          value={e.disabilityStatus ?? ''}
          onChange={(v) => setE({ disabilityStatus: v })}
        />
      </Field>
    </Section>
  );
}
