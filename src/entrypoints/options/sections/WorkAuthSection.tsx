import type { Profile } from '@/core/profile.schema';
import { Section, Toggle, type SectionProps } from '../components/ui';

export function WorkAuthSection({ draft, setDraft }: SectionProps) {
  const w = draft.workAuth;
  const setW = (patch: Partial<Profile['workAuth']>) =>
    setDraft((d) => ({ ...d, workAuth: { ...d.workAuth, ...patch } }));

  return (
    <Section
      title="Work authorization"
      description="Used to answer the common authorization / sponsorship questions."
    >
      <Toggle
        checked={w.authorizedToWork}
        onChange={(v) => setW({ authorizedToWork: v })}
        label="I am legally authorized to work in this country."
      />
      <Toggle
        checked={w.needsSponsorship}
        onChange={(v) => setW({ needsSponsorship: v })}
        label="I now or in the future require visa sponsorship."
      />
      <Toggle
        checked={w.requiresVisa}
        onChange={(v) => setW({ requiresVisa: v })}
        label="I require a visa to work here."
      />
    </Section>
  );
}
