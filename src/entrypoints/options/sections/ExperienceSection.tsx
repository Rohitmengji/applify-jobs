import type { Experience } from '@/core/profile.schema';
import {
  Section,
  Field,
  TextInput,
  TextArea,
  Toggle,
  Button,
  RowCard,
  type SectionProps,
} from '../components/ui';

export function ExperienceSection({ draft, setDraft }: SectionProps) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      experience: [
        ...d.experience,
        {
          id: crypto.randomUUID(),
          title: '',
          company: '',
          startDate: '',
          current: false,
          description: '',
        },
      ],
    }));
  const update = (id: string, patch: Partial<Experience>) =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({ ...d, experience: d.experience.filter((r) => r.id !== id) }));

  return (
    <Section title="Experience" description="Most recent first. Dates use YYYY or YYYY-MM.">
      {draft.experience.map((r) => (
        <RowCard key={r.id} onRemove={() => remove(r.id)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <TextInput value={r.title} onChange={(v) => update(r.id, { title: v })} />
            </Field>
            <Field label="Company">
              <TextInput value={r.company} onChange={(v) => update(r.id, { company: v })} />
            </Field>
            <Field label="Location">
              <TextInput value={r.location ?? ''} onChange={(v) => update(r.id, { location: v })} />
            </Field>
            <Field label="Start (YYYY-MM)">
              <TextInput
                placeholder="2022-01"
                value={r.startDate}
                onChange={(v) => update(r.id, { startDate: v })}
              />
            </Field>
            <Field label="End (YYYY-MM)">
              <TextInput
                placeholder="2024-06"
                value={r.endDate ?? ''}
                onChange={(v) => update(r.id, { endDate: v })}
              />
            </Field>
          </div>
          <Toggle
            checked={r.current}
            onChange={(v) => update(r.id, { current: v })}
            label="I currently work here"
          />
          <Field label="Description">
            <TextArea value={r.description} onChange={(v) => update(r.id, { description: v })} />
          </Field>
        </RowCard>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add experience
      </Button>
    </Section>
  );
}
