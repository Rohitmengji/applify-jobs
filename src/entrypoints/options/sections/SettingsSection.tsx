import { useEffect, useState } from 'react';
import type { Profile } from '@/core/profile.schema';
import { Section, Field, TextInput, Toggle, type SectionProps } from '../components/ui';

export function SettingsSection({ draft, setDraft }: SectionProps) {
  const s = draft.settings;
  const setS = (patch: Partial<Profile['settings']>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  // The LLM key + base URL live in chrome.storage.local (never in the profile, never synced).
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  useEffect(() => {
    void chrome.storage.local.get(['llmApiKey', 'llmBaseUrl']).then((r) => {
      setApiKey((r.llmApiKey as string) ?? '');
      setBaseUrl((r.llmBaseUrl as string) ?? '');
    });
  }, []);
  const saveKey = (k: string) => {
    setApiKey(k);
    void chrome.storage.local.set({ llmApiKey: k });
  };
  const saveBase = (b: string) => {
    setBaseUrl(b);
    void chrome.storage.local.set({ llmBaseUrl: b });
  };

  return (
    <Section title="Settings" description="Engine behavior and optional AI assist.">
      <Toggle
        checked={s.llmEnabled}
        onChange={(v) => setS({ llmEnabled: v })}
        label="Enable AI assist (field mapping + answer drafting)"
      />
      <Toggle
        checked={s.autoAdvanceWizard}
        onChange={(v) => setS({ autoAdvanceWizard: v })}
        label="Auto-advance multi-step wizards to the review step"
      />

      <Field
        label={`Confidence threshold — ${Math.round(s.confidenceThreshold * 100)}%`}
        hint="Fields below this are flagged for review before filling."
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.confidenceThreshold}
          onChange={(e) => setS({ confidenceThreshold: Number(e.target.value) })}
          className="w-full"
        />
      </Field>

      <h3 className="pt-2 text-sm font-semibold text-gray-700">AI provider</h3>
      <p className="text-xs text-gray-400">
        Stored only in this browser (chrome.storage.local). Leave the key blank to use a proxy URL
        that holds the key server-side.
      </p>
      <Field label="API key">
        <TextInput
          type="password"
          value={apiKey}
          onChange={saveKey}
          placeholder="sk-ant-…"
          autoComplete="off"
        />
      </Field>
      <Field label="Base URL" hint="Default: https://api.anthropic.com (or your proxy).">
        <TextInput
          type="url"
          value={baseUrl}
          onChange={saveBase}
          placeholder="https://api.anthropic.com"
        />
      </Field>
    </Section>
  );
}
