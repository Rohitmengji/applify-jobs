import { useEffect, useState } from 'react';
import type { Profile } from '@/core/profile.schema';
import { clearLearned, countLearned } from '@/core/storage/learnStore';
import {
  getCreditConfig,
  getCreditUsage,
  getRemainingCredits,
  setUserKeyActive,
} from '@/core/storage/credits';
import { getUserId } from '@/core/storage/credits';
import { recordUserKey } from '@/core/storage/adminConfig';
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
    // Track user key status for credit system + admin visibility
    const hasKey = k.trim().length > 0;
    void setUserKeyActive(hasKey);
    if (hasKey) {
      const detectedProvider = k.startsWith('sk-ant-') ? 'anthropic' : 'openai';
      const last4 = k.slice(-4);
      void getUserId().then((uid) => recordUserKey(uid, detectedProvider, last4));
    }
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

  // Credit system
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [creditLimit, setCreditLimit] = useState(0);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  useEffect(() => {
    void getRemainingCredits().then(setCreditsRemaining);
    void getCreditConfig().then((c) => setCreditLimit(c.monthlyLimit));
    void getCreditUsage().then((u) => setCreditsUsed(u.used));
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
          <option value="anthropic">Anthropic (Haiku for mapping, Opus for drafts)</option>
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

      {/* --- AI Credits Section --- */}
      <h3 className="pt-4 text-sm font-semibold text-slate-300">AI Credits</h3>
      {creditsRemaining !== null && creditsRemaining !== Infinity && (
        <div className="rounded-lg border border-slate-600 bg-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Monthly credits</span>
            <span className="text-sm font-medium text-white">
              {creditsUsed} / {creditLimit} used
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${
                creditsUsed / creditLimit > 0.9
                  ? 'bg-red-500'
                  : creditsUsed / creditLimit > 0.7
                    ? 'bg-amber-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, (creditsUsed / creditLimit) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {creditsRemaining > 0
              ? `${creditsRemaining} credits remaining this month. Resets on the 1st.`
              : 'Credits exhausted! Add your own API key below to continue using AI features.'}
          </p>
          {creditsRemaining === 0 && !apiKey && (
            <button
              onClick={() => setShowKeyGuide(true)}
              className="mt-2 w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              How to get your own API key →
            </button>
          )}
        </div>
      )}
      {creditsRemaining === Infinity && apiKey && (
        <p className="text-xs text-green-400">
          ✓ Using your own API key — shared credits are not consumed.
        </p>
      )}

      {/* API Key Guide (inline) */}
      {showKeyGuide && (
        <div className="rounded-lg border border-blue-700/50 bg-blue-900/20 p-4 space-y-3">
          <h4 className="font-semibold text-blue-300">Get Your Own API Key</h4>
          <div className="space-y-2 text-xs text-slate-300">
            <p className="font-medium text-white">Option 1: OpenAI (Recommended)</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Go to{' '}
                <a
                  href="https://platform.openai.com/signup"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 underline"
                >
                  platform.openai.com/signup
                </a>
              </li>
              <li>Create account → Add payment method ($5-10/month is plenty)</li>
              <li>
                Go to{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 underline"
                >
                  API Keys
                </a>{' '}
                → Create new key
              </li>
              <li>
                Copy the key (starts with <code className="bg-slate-700 px-1 rounded">sk-</code>)
              </li>
              <li>Paste it in the "API key" field above</li>
              <li>
                Set a{' '}
                <a
                  href="https://platform.openai.com/account/limits"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 underline"
                >
                  monthly spending limit
                </a>{' '}
                to protect your wallet
              </li>
            </ol>
            <p className="mt-2 font-medium text-white">Option 2: Anthropic (Better quality)</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Go to{' '}
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 underline"
                >
                  console.anthropic.com
                </a>
              </li>
              <li>Create account → Add $5-10 credits</li>
              <li>
                Go to{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 underline"
                >
                  Settings → API Keys
                </a>{' '}
                → Create key
              </li>
              <li>
                Copy the key (starts with <code className="bg-slate-700 px-1 rounded">sk-ant-</code>
                )
              </li>
              <li>Select "Anthropic" above, paste the key</li>
            </ol>
            <p className="mt-2 text-slate-500">
              Typical cost: $2-5/month for active job searching.
            </p>
          </div>
          <button
            onClick={() => setShowKeyGuide(false)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Close guide
          </button>
        </div>
      )}

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
