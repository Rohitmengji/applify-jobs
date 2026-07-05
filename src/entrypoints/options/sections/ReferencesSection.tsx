import type { Reference } from '@/core/profile.schema';
import { Section, Field, TextInput, Button, RowCard, type SectionProps } from '../components/ui';

export function ReferencesSection({ draft, setDraft }: SectionProps) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      references: [...d.references, { id: crypto.randomUUID(), name: '' }],
    }));
  const update = (id: string, patch: Partial<Reference>) =>
    setDraft((d) => ({
      ...d,
      references: d.references.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({ ...d, references: d.references.filter((r) => r.id !== id) }));

  return (
    <Section title="References" description="Professional references (auto-filled when asked).">
      {draft.references.map((r) => (
        <RowCard key={r.id} onRemove={() => remove(r.id)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <TextInput value={r.name} onChange={(v) => update(r.id, { name: v })} />
            </Field>
            <Field label="Relationship">
              <TextInput
                value={r.relationship ?? ''}
                onChange={(v) => update(r.id, { relationship: v })}
                placeholder="Manager, Colleague, Professor"
              />
            </Field>
            <Field label="Company">
              <TextInput value={r.company ?? ''} onChange={(v) => update(r.id, { company: v })} />
            </Field>
            <Field label="Email">
              <TextInput value={r.email ?? ''} onChange={(v) => update(r.id, { email: v })} />
            </Field>
            <Field label="Phone">
              <TextInput value={r.phone ?? ''} onChange={(v) => update(r.id, { phone: v })} />
            </Field>
          </div>
        </RowCard>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add reference
      </Button>
    </Section>
  );
}
