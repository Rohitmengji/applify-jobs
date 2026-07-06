import { useEffect, useState } from 'react';
import type { Profile } from '@/core/profile.schema';
import { clearLearned, countLearned } from '@/core/storage/learnStore';
import { Section, Field, TextInput, Toggle, Button, type SectionProps } from '../components/ui';

export function SettingsSection({ draft, setDraft }: SectionProps) {
  const s = draft.settings;
  const setS = (patch: Partial<Profile['settings']>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  // The LLM key + base URL + provider live in chrome.storage.local (never in the profile, never synced).
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic' | ''>('');
  useEffect(() => {
    void chrome.storage.local.get(['llmApiKey', 'llmBaseUrl', 'llmProvider']).then((r) => {
      setApiKey((r.llmApiKey as string) ?? '');
      setBaseUrl((r.llmBaseUrl as string) ?? '');
      setProvider((r.llmProvider as 'openai' | 'anthropic') ?? '');
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
  const saveProvider = (p: string) => {
    setProvider(p as 'openai' | 'anthropic' | '');
    void chrome.storage.local.set({ llmProvider: p });
  };

  // Learning engine: how many field corrections/answers the extension has remembered.
  const [learnedCount, setLearnedCount] = useState(0);
  useEffect(() => {
    void countLearned().then(setLearnedCount);
  }, []);

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

      <h3 className="pt-2 text-sm font-semibold text-slate-300">AI provider</h3>
      <p className="text-xs text-slate-500">
        Stored only in this browser (chrome.storage.local). Leave the key blank to use a proxy URL
        that holds the key server-side.
      </p>
      <Field label="Provider">
        <select
          value={provider}
          onChange={(e) => saveProvider(e.target.value)}
          className="w-full rounded border border-slate-600 px-3 py-2 text-sm"
        >
          <option value="">Auto-detect from key</option>
          <option value="openai">OpenAI (gpt-5.4-mini)</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
      </Field>
      <Field label="API key">
        <TextInput
          type="password"
          value={apiKey}
          onChange={saveKey}
          placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          autoComplete="off"
        />
      </Field>
      <Field
        label="Base URL"
        hint={`Default: ${provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com'} (or your proxy).`}
      >
        <TextInput
          type="url"
          value={baseUrl}
          onChange={saveBase}
          placeholder={
            provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com'
          }
        />
      </Field>

      <h3 className="pt-2 text-sm font-semibold text-slate-300">Learning engine</h3>
      <p className="text-xs text-slate-500">
        When you fill or correct a field the engine didn’t know, it remembers it (by the field’s
        label + type) and auto-fills that field on future forms. Stored locally only.
      </p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">{learnedCount} fields remembered</span>
        <Button
          variant="danger"
          onClick={async () => {
            await clearLearned();
            setLearnedCount(0);
          }}
        >
          Forget learned fields
        </Button>
      </div>
    </Section>
  );
}
