import type { Profile, ProfileKey } from '../profile.schema';
import { mappingSystemPrompt, draftSystemPrompt, PROFILE_KEYS } from './prompts';

// IMPLEMENTATION.md §19 — called ONLY from the background worker, so API keys never
// enter a web page. Supports a direct Anthropic key or a serverless proxy via base URL.

const MODEL = 'claude-sonnet-4-6';
const VALID_KEYS = new Set<string>(PROFILE_KEYS);

// Only https origins are accepted as the LLM endpoint, so the user's API key is never
// shipped over http or to a malformed / credential-bearing URL (finding #7).
function safeBase(raw: string): string {
  try {
    const u = new URL(raw || 'https://api.anthropic.com');
    if (u.protocol !== 'https:') throw new Error('not https');
    return (u.origin + u.pathname).replace(/\/$/, '');
  } catch {
    throw new Error('Invalid LLM base URL — use an https:// origin');
  }
}

async function getKeyAndBase(): Promise<{ key: string; base: string }> {
  const { llmApiKey = '', llmBaseUrl = 'https://api.anthropic.com' } =
    await chrome.storage.local.get(['llmApiKey', 'llmBaseUrl']);
  return { key: llmApiKey, base: safeBase(llmBaseUrl) };
}

async function callClaude(system: string, user: string, maxTokens = 1024): Promise<string> {
  const { key, base } = await getKeyAndBase();
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
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
  const text = await callClaude(mappingSystemPrompt(), JSON.stringify(unresolved));
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
  return callClaude(
    draftSystemPrompt(),
    `QUESTION: ${question}\n\nCANDIDATE PROFILE:\n${JSON.stringify(ctx)}`,
  );
}
