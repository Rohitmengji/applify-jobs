import type { Education } from '@/core/profile.schema';
import { Section, Field, TextInput, Button, RowCard, type SectionProps } from '../components/ui';

export function EducationSection({ draft, setDraft }: SectionProps) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      education: [...d.education, { id: crypto.randomUUID(), school: '', degree: '' }],
    }));
  const update = (id: string, patch: Partial<Education>) =>
    setDraft((d) => ({
      ...d,
      education: d.education.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({ ...d, education: d.education.filter((r) => r.id !== id) }));

  return (
    <Section title="Education" description="Schools, degrees, and dates.">
      {draft.education.map((r) => (
        <RowCard key={r.id} onRemove={() => remove(r.id)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="School">
              <TextInput value={r.school} onChange={(v) => update(r.id, { school: v })} />
            </Field>
            <Field label="Degree">
              <TextInput value={r.degree} onChange={(v) => update(r.id, { degree: v })} />
            </Field>
            <Field label="Field of study">
              <TextInput value={r.field ?? ''} onChange={(v) => update(r.id, { field: v })} />
            </Field>
            <Field label="GPA">
              <TextInput value={r.gpa ?? ''} onChange={(v) => update(r.id, { gpa: v })} />
            </Field>
            <Field label="Start (YYYY)">
              <TextInput
                value={r.startDate ?? ''}
                onChange={(v) => update(r.id, { startDate: v })}
              />
            </Field>
            <Field label="End (YYYY)">
              <TextInput value={r.endDate ?? ''} onChange={(v) => update(r.id, { endDate: v })} />
            </Field>
          </div>
        </RowCard>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add education
      </Button>
    </Section>
  );
}
