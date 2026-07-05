import type { CoverLetterTemplate } from '@/core/profile.schema';
import {
  Section,
  Field,
  TextInput,
  TextArea,
  Button,
  RowCard,
  type SectionProps,
} from '../components/ui';

export function CoverLetterTemplatesSection({ draft, setDraft }: SectionProps) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      coverLetterTemplates: [
        ...d.coverLetterTemplates,
        { id: crypto.randomUUID(), name: '', body: '' },
      ],
    }));
  const update = (id: string, patch: Partial<CoverLetterTemplate>) =>
    setDraft((d) => ({
      ...d,
      coverLetterTemplates: d.coverLetterTemplates.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({
      ...d,
      coverLetterTemplates: d.coverLetterTemplates.filter((t) => t.id !== id),
    }));

  return (
    <Section
      title="Cover Letter Templates"
      description="Reusable templates — pick one when drafting a cover letter on an application."
    >
      {draft.coverLetterTemplates.map((t) => (
        <RowCard key={t.id} onRemove={() => remove(t.id)}>
          <Field label="Name">
            <TextInput
              value={t.name}
              onChange={(v) => update(t.id, { name: v })}
              placeholder="Generic, Startup, Enterprise…"
            />
          </Field>
          <Field label="Body">
            <TextArea
              value={t.body}
              onChange={(v) => update(t.id, { body: v })}
              rows={6}
              placeholder="Dear Hiring Manager,&#10;&#10;I'm writing to express my interest in…"
            />
          </Field>
        </RowCard>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add template
      </Button>
    </Section>
  );
}
