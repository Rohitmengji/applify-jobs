import type { Profile, ProfileKey } from '../profile.schema';
import {
  mappingSystemPrompt,
  draftSystemPrompt,
  resumeExtractSystemPrompt,
  PROFILE_KEYS,
} from './prompts';
import { llmLimiter, checkDailyBudget, recordDailyCall } from './rateLimiter';
import { getCachedMappings, setCachedMappings, deduplicateBatch } from './cache';
import { recordLlmCall } from '../storage/llmUsage';
import { consumeCredit, hasCreditsRemaining } from '../storage/credits';

// IMPLEMENTATION.md §19 — called ONLY from the background worker, so API keys never
// enter a web page. Supports OpenAI or Anthropic (auto-detected from key prefix or
// explicit provider setting).

export type LlmProvider = 'openai' | 'anthropic';

// Model tiers — use cheaper models for simple classification tasks (mapping),
// reserve expensive models for creative/complex tasks (tailoring, cover letters).
const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_MODEL_CHEAP = 'gpt-5.4-mini'; // already cheap; same model
const ANTHROPIC_MODEL = 'claude-opus-4-7';
const ANTHROPIC_MODEL_CHEAP = 'claude-haiku-4-20250414'; // ~10x cheaper for classification

type ModelTier = 'default' | 'cheap';
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
  const key = (llmApiKey as string).trim();
  if (!key) throw new Error('No API key configured — add one in Settings.');
  const provider = detectProvider(key, llmProvider);
  return { key, base: safeBase(llmBaseUrl, provider), provider };
}

const LLM_TIMEOUT_MS = 30_000;

async function callLLM(
  system: string,
  user: string,
  maxTokens = 1024,
  tier: ModelTier = 'default',
): Promise<string> {
  if (!llmLimiter.tryAcquire()) {
    const retry = Math.ceil(llmLimiter.retryAfterMs() / 1000);
    throw new Error(`Rate limited — too many AI calls. Try again in ${retry}s.`);
  }
  if (!(await checkDailyBudget())) {
    throw new Error('Daily AI call budget reached. Restart your browser to reset.');
  }
  // Credit system: check if user has credits remaining (or their own key)
  if (!(await hasCreditsRemaining())) {
    throw new Error(
      "Monthly AI credits exhausted. Add your own API key in Settings to continue, or wait for next month's reset.",
    );
  }
  const { key, base, provider } = await getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  const openaiModel = tier === 'cheap' ? OPENAI_MODEL_CHEAP : OPENAI_MODEL;
  const anthropicModel = tier === 'cheap' ? ANTHROPIC_MODEL_CHEAP : ANTHROPIC_MODEL;

  try {
    if (provider === 'openai') {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: openaiModel,
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
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel,
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
  } finally {
    clearTimeout(timer);
    void recordDailyCall();
    void consumeCredit(); // Deduct one credit for this AI call
  }
}

export async function mapFieldsWithLLM(
  unresolved: { uid: string; signals: unknown }[],
  _profile: Profile,
): Promise<{ uid: string; key: string | null; confidence: number }[]> {
  if (!unresolved.length) return [];

  // --- Cache layer: check for previously-seen field signals ---
  const { hits, misses } = await getCachedMappings(unresolved);
  const results: { uid: string; key: string | null; confidence: number }[] = [];

  // Populate results from cache hits
  for (const [uid, cached] of hits) {
    results.push({ uid, key: cached.key, confidence: cached.confidence });
  }

  // Nothing left to send to the LLM
  if (misses.length === 0) {
    // Record cache hits for usage stats
    void recordLlmCall('mapping', 0, true);
    return results;
  }

  // --- Batch dedup: collapse identical signals into one representative ---
  const { unique, fanout } = deduplicateBatch(misses);

  // Field signals are scraped from an untrusted page; the prompt fences them and the
  // model is told to ignore embedded instructions. We still validate the result here:
  // any key the model returns that isn't a real ProfileKey is coerced to null (#15).
  // Use cheap model tier for classification tasks.
  const text = await callLLM(mappingSystemPrompt(), JSON.stringify(unique), 1024, 'cheap');
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean) as unknown;
    if (!Array.isArray(parsed)) return results;
    const llmResults = parsed
      .filter((m): m is Record<string, unknown> => m != null && typeof m === 'object')
      .map((m) => ({
        uid: String(m.uid),
        key: typeof m.key === 'string' && VALID_KEYS.has(m.key) ? (m.key as ProfileKey) : null,
        confidence: typeof m.confidence === 'number' ? m.confidence : 0,
      }));

    // Fan out deduplicated results to all uids that shared the same signals
    for (const r of llmResults) {
      const siblings = fanout.get(r.uid) ?? [r.uid];
      for (const uid of siblings) {
        results.push({ uid, key: r.key, confidence: r.confidence });
      }
    }

    // Persist new results to cache for future calls
    await setCachedMappings(misses, results).catch(() => {});

    // Track usage: estimate ~150 tokens per field in the batch
    void recordLlmCall('mapping', unique.length * 150, false);

    return results;
  } catch {
    return results;
  }
}

// Returns the raw parsed JSON (or null). Shape is validated at merge time
// (mergeExtractedResume) so a malformed/partial response can never corrupt the profile.
export async function extractResumeWithLLM(text: string): Promise<unknown> {
  if (!text.trim()) return null;
  const out = await callLLM(resumeExtractSystemPrompt(), text, 4096);
  // Estimate tokens: system prompt ~200 + input text chars/4 + output ~1000
  void recordLlmCall('extract', Math.round(200 + text.length / 4 + 1000), false);
  const clean = out.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function draftAnswerWithLLM(question: string, profile: Profile): Promise<string> {
  // Compressed profile context — omit empty fields, truncate long descriptions
  const ctx: Record<string, unknown> = {
    name: `${profile.personal.firstName} ${profile.personal.lastName}`,
  };
  if (profile.skills.length) ctx.skills = profile.skills;
  if (profile.experience.length) {
    ctx.experience = profile.experience.map((e) => {
      const entry: Record<string, string> = { title: e.title, company: e.company };
      if (e.description) entry.summary = e.description.slice(0, 200);
      return entry;
    });
  }
  if (profile.education.length) {
    ctx.education = profile.education.map((e) => {
      const entry: Record<string, string> = { degree: e.degree, school: e.school };
      if (e.field) entry.field = e.field;
      return entry;
    });
  }
  const userMsg = `QUESTION: ${question}\n\nCANDIDATE PROFILE:\n${JSON.stringify(ctx)}`;
  const answer = await callLLM(draftSystemPrompt(), userMsg);
  // Estimate: system ~100 + question + profile context + answer ~200
  void recordLlmCall('draft', Math.round(100 + userMsg.length / 4 + 200), false);
  return answer;
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
  // Estimate: system ~300 + user prompt + output ~2000
  void recordLlmCall('tailor', Math.round(300 + user.length / 4 + 2000), false);
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
  const userMsg = `COMPANY: ${jobInfo.company}\nROLE: ${jobInfo.role}\n${jobInfo.description ? `JOB DESCRIPTION:\n${jobInfo.description}\n\n` : ''}CANDIDATE PROFILE:\n${JSON.stringify(ctx)}`;
  const result = await callLLM(coverLetterSystemPrompt(), userMsg, 1500);
  // Estimate: system ~200 + user + output ~1200
  void recordLlmCall('coverLetter', Math.round(200 + userMsg.length / 4 + 1200), false);
  return result;
}
