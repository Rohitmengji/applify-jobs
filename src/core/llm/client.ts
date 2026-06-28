import type { Profile } from '../profile.schema';
import { mappingSystemPrompt, draftSystemPrompt } from './prompts';

// IMPLEMENTATION.md §19 — called ONLY from the background worker, so API keys never
// enter a web page. Supports a direct Anthropic key or a serverless proxy via base URL.

const MODEL = 'claude-sonnet-4-6';

async function getKeyAndBase(): Promise<{ key: string; base: string }> {
  const { llmApiKey = '', llmBaseUrl = 'https://api.anthropic.com' } =
    await chrome.storage.local.get(['llmApiKey', 'llmBaseUrl']);
  return { key: llmApiKey, base: llmBaseUrl };
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
  const text = await callClaude(mappingSystemPrompt(), JSON.stringify(unresolved));
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
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
