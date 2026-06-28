import type { SavedAnswer } from '@/core/profile.schema';
import {
  Section,
  Field,
  TextInput,
  TextArea,
  Button,
  RowCard,
  type SectionProps,
} from '../components/ui';

export function AnswerBankSection({ draft, setDraft }: SectionProps) {
  const add = () =>
    setDraft((d) => ({
      ...d,
      answerBank: [
        ...d.answerBank,
        { id: crypto.randomUUID(), questionPattern: '', answer: '', tags: [] },
      ],
    }));
  const update = (id: string, patch: Partial<SavedAnswer>) =>
    setDraft((d) => ({
      ...d,
      answerBank: d.answerBank.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({ ...d, answerBank: d.answerBank.filter((r) => r.id !== id) }));

  return (
    <Section
      title="Answer bank"
      description="Reusable answers to recurring free-text questions. Matched fuzzily against field labels before any AI draft."
    >
      {draft.answerBank.map((r) => (
        <RowCard key={r.id} onRemove={() => remove(r.id)}>
          <Field label="Question pattern" hint="e.g. why do you want to work here">
            <TextInput
              value={r.questionPattern}
              onChange={(v) => update(r.id, { questionPattern: v })}
            />
          </Field>
          <Field label="Answer">
            <TextArea value={r.answer} onChange={(v) => update(r.id, { answer: v })} rows={4} />
          </Field>
          <Field label="Tags" hint="comma-separated">
            <TextInput
              value={r.tags.join(', ')}
              onChange={(v) =>
                update(r.id, {
                  tags: v
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </RowCard>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add answer
      </Button>
    </Section>
  );
}
