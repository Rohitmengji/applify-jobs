import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, type SectionProps } from '../components/ui';

export function LinksSection({ draft, setDraft }: SectionProps) {
  const l = draft.links;
  const setL = (patch: Partial<Profile['links']>) =>
    setDraft((d) => ({ ...d, links: { ...d.links, ...patch } }));

  return (
    <Section title="Links" description="Profile and portfolio URLs. Include the full https:// URL.">
      <Field label="LinkedIn">
        <TextInput
          type="url"
          placeholder="https://www.linkedin.com/in/you"
          value={l.linkedin ?? ''}
          onChange={(v) => setL({ linkedin: v })}
        />
      </Field>
      <Field label="GitHub">
        <TextInput
          type="url"
          placeholder="https://github.com/you"
          value={l.github ?? ''}
          onChange={(v) => setL({ github: v })}
        />
      </Field>
      <Field label="Portfolio">
        <TextInput type="url" value={l.portfolio ?? ''} onChange={(v) => setL({ portfolio: v })} />
      </Field>
      <Field label="Website">
        <TextInput type="url" value={l.website ?? ''} onChange={(v) => setL({ website: v })} />
      </Field>
    </Section>
  );
}
