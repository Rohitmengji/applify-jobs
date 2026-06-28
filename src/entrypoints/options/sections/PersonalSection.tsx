import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, type SectionProps } from '../components/ui';

export function PersonalSection({ draft, setDraft }: SectionProps) {
  const p = draft.personal;
  const setP = (patch: Partial<Profile['personal']>) =>
    setDraft((d) => ({ ...d, personal: { ...d.personal, ...patch } }));
  const setAddr = (patch: Partial<Profile['personal']['address']>) =>
    setDraft((d) => ({
      ...d,
      personal: { ...d.personal, address: { ...d.personal.address, ...patch } },
    }));

  return (
    <Section title="Personal" description="The core identity fields every application asks for.">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <TextInput value={p.firstName} onChange={(v) => setP({ firstName: v })} />
        </Field>
        <Field label="Last name">
          <TextInput value={p.lastName} onChange={(v) => setP({ lastName: v })} />
        </Field>
        <Field label="Middle name">
          <TextInput value={p.middleName ?? ''} onChange={(v) => setP({ middleName: v })} />
        </Field>
        <Field label="Preferred name">
          <TextInput value={p.preferredName ?? ''} onChange={(v) => setP({ preferredName: v })} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={p.email} onChange={(v) => setP({ email: v })} />
        </Field>
        <Field label="Phone">
          <TextInput type="tel" value={p.phone} onChange={(v) => setP({ phone: v })} />
        </Field>
      </div>

      <h3 className="pt-2 text-sm font-semibold text-gray-700">Address</h3>
      <Field label="Street address">
        <TextInput value={p.address.line1 ?? ''} onChange={(v) => setAddr({ line1: v })} />
      </Field>
      <Field label="Address line 2">
        <TextInput value={p.address.line2 ?? ''} onChange={(v) => setAddr({ line2: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <TextInput value={p.address.city ?? ''} onChange={(v) => setAddr({ city: v })} />
        </Field>
        <Field label="State / Province">
          <TextInput value={p.address.state ?? ''} onChange={(v) => setAddr({ state: v })} />
        </Field>
        <Field label="ZIP / Postal code">
          <TextInput value={p.address.zip ?? ''} onChange={(v) => setAddr({ zip: v })} />
        </Field>
        <Field label="Country">
          <TextInput value={p.address.country} onChange={(v) => setAddr({ country: v })} />
        </Field>
      </div>
    </Section>
  );
}
