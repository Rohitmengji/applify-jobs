import type { Project } from '@/core/profile.schema';
import {
  Section,
  Field,
  TextInput,
  TextArea,
  Button,
  RowCard,
  type SectionProps,
} from '../components/ui';

export function ProjectsSection({ draft, setDraft }: SectionProps) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      projects: [...d.projects, { id: crypto.randomUUID(), title: '' }],
    }));
  const update = (id: string, patch: Partial<Project>) =>
    setDraft((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) }));

  return (
    <Section title="Projects" description="Portfolio projects & work samples.">
      {draft.projects.map((p) => (
        <RowCard key={p.id} onRemove={() => remove(p.id)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <TextInput value={p.title} onChange={(v) => update(p.id, { title: v })} />
            </Field>
            <Field label="URL">
              <TextInput
                value={p.url ?? ''}
                onChange={(v) => update(p.id, { url: v })}
                placeholder="https://github.com/…"
              />
            </Field>
          </div>
          <Field label="Description">
            <TextArea
              value={p.description ?? ''}
              onChange={(v) => update(p.id, { description: v })}
              rows={3}
            />
          </Field>
        </RowCard>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add project
      </Button>
    </Section>
  );
}
