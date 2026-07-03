import type { Profile, ProfileKey } from '../profile.schema';
import {
  mappingSystemPrompt,
  draftSystemPrompt,
  resumeExtractSystemPrompt,
  PROFILE_KEYS,
} from './prompts';

// IMPLEMENTATION.md §19 — called ONLY from the background worker, so API keys never
// enter a web page. Supports OpenAI or Anthropic (auto-detected from key prefix or
// explicit provider setting).

export type LlmProvider = 'openai' | 'anthropic';

const OPENAI_MODEL = 'gpt-5.4-mini';
const ANTHROPIC_MODEL = 'claude-opus-4-7';
const VALID_KEYS = new Set<string>(PROFILE_KEYS);

// Only https origins are accepted as the LLM endpoint, so the user's API key is never
// shipped over http or to a malformed / credential-bearing URL (finding #7).
function safeBase(raw: string, provider: LlmProvider): string {
  const defaultUrl = provider === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com';
  try {
    const u = new URL(raw || defaultUrl);
    if (u.protocol !== 'https:') throw new Error('not https');
    return (u.origin + u.pathname).replace(/\/$/, '');
  } catch {
    throw new Error('Invalid LLM base URL — use an https:// origin');
  }
}

function detectProvider(key: string, explicit?: string): LlmProvider {
  if (explicit === 'openai' || explicit === 'anthropic') return explicit;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  return 'openai'; // default to OpenAI (covers sk-... keys)
}

async function getConfig(): Promise<{ key: string; base: string; provider: LlmProvider }> {
  const {
    llmApiKey = '',
    llmBaseUrl = '',
    llmProvider = '',
  } = await chrome.storage.local.get(['llmApiKey', 'llmBaseUrl', 'llmProvider']);
  const provider = detectProvider(llmApiKey, llmProvider);
  return { key: llmApiKey, base: safeBase(llmBaseUrl, provider), provider };
}

async function callLLM(system: string, user: string, maxTokens = 1024): Promise<string> {
  const { key, base, provider } = await getConfig();

  if (provider === 'openai') {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text().catch(() => '')}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  // Anthropic
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');
}

export async function mapFieldsWithLLM(
  unresolved: { uid: string; signals: unknown }[],
  _profile: Profile,
): Promise<{ uid: string; key: string | null; confidence: number }[]> {
  if (!unresolved.length) return [];
  // Field signals are scraped from an untrusted page; the prompt fences them and the
  // model is told to ignore embedded instructions. We still validate the result here:
  // any key the model returns that isn't a real ProfileKey is coerced to null (#15).
  const text = await callLLM(mappingSystemPrompt(), JSON.stringify(unresolved));
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean) as { uid: string; key: string | null; confidence: number }[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((m) => ({
      uid: String(m.uid),
      key: m.key && VALID_KEYS.has(m.key) ? (m.key as ProfileKey) : null,
      confidence: typeof m.confidence === 'number' ? m.confidence : 0,
    }));
  } catch {
    return [];
  }
}

// Returns the raw parsed JSON (or null). Shape is validated at merge time
// (mergeExtractedResume) so a malformed/partial response can never corrupt the profile.
export async function extractResumeWithLLM(text: string): Promise<unknown> {
  if (!text.trim()) return null;
  const out = await callLLM(resumeExtractSystemPrompt(), text, 4096);
  const clean = out.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function draftAnswerWithLLM(question: string, profile: Profile): Promise<string> {
  const ctx = {
    name: `${profile.personal.firstName} ${profile.personal.lastName}`,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      summary: e.description,
    })),
    education: profile.education.map((e) => ({
      degree: e.degree,
      field: e.field,
      school: e.school,
    })),
  };
  return callLLM(
    draftSystemPrompt(),
    `QUESTION: ${question}\n\nCANDIDATE PROFILE:\n${JSON.stringify(ctx)}`,
  );
}

// Tailor the candidate's résumé to a specific job. Returns the raw parsed JSON (or null);
// shape is validated by normalizeTailored before rendering, so a malformed/partial or
// hallucinated response can never produce a broken document.
export async function tailorResumeWithLLM(
  profile: Profile,
  jobInfo: { company: string; role: string; description?: string },
  baseText?: string,
): Promise<unknown> {
  const ctx = {
    name: `${profile.personal.firstName} ${profile.personal.lastName}`.trim(),
    email: profile.personal.email,
    phone: profile.personal.phone,
    city: profile.personal.address.city,
    links: profile.links,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location,
      dates: `${e.startDate} - ${e.current ? 'Present' : (e.endDate ?? '')}`,
      description: e.description,
    })),
    education: profile.education.map((e) => ({
      degree: e.degree,
      field: e.field,
      school: e.school,
      dates: `${e.startDate ?? ''} - ${e.endDate ?? ''}`,
    })),
  };
  const user = [
    `TARGET JOB: ${jobInfo.role || '(unspecified)'} at ${jobInfo.company || '(unspecified)'}`,
    jobInfo.description ? `JOB DESCRIPTION:\n${jobInfo.description}\n` : '',
    baseText ? `ORIGINAL RESUME TEXT (source of truth for wording):\n${baseText}\n` : '',
    `CANDIDATE PROFILE (facts — do not exceed these):\n${JSON.stringify(ctx)}`,
  ]
    .filter(Boolean)
    .join('\n');
  const { resumeTailorSystemPrompt } = await import('./prompts');
  const out = await callLLM(resumeTailorSystemPrompt(), user, 3000);
  const clean = out.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function generateCoverLetter(
  profile: Profile,
  jobInfo: { company: string; role: string; description?: string },
): Promise<string> {
  const ctx = {
    name: `${profile.personal.firstName} ${profile.personal.lastName}`,
    email: profile.personal.email,
    phone: profile.personal.phone,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location,
      dates: `${e.startDate} - ${e.current ? 'Present' : (e.endDate ?? '')}`,
      description: e.description,
    })),
    education: profile.education.map((e) => ({
      degree: e.degree,
      field: e.field,
      school: e.school,
    })),
    links: profile.links,
  };
  const { coverLetterSystemPrompt } = await import('./prompts');
  return callLLM(
    coverLetterSystemPrompt(),
    `COMPANY: ${jobInfo.company}\nROLE: ${jobInfo.role}\n${jobInfo.description ? `JOB DESCRIPTION:\n${jobInfo.description}\n\n` : ''}CANDIDATE PROFILE:\n${JSON.stringify(ctx)}`,
    1500,
  );
}
