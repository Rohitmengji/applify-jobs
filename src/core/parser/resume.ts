import type { Profile } from '../profile.schema';

// IMPLEMENTATION.md §M8 — seed the profile from résumé text. This is the deterministic
// layer (regex/keyword extraction over plain text) — fully testable and dependency-free.
// PDF→text and AI-structured experience/education extraction can layer on top later.

export interface ParsedResume {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  skills: string[];
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// A loose phone matcher: 10+ digits possibly grouped with spaces/()-/+ and an optional ext.
const PHONE_RE = /(?:\+?\d[\d().\-\s]{8,}\d)/;
const URL_RE = /\bhttps?:\/\/[^\s)<>"']+/gi;

// A curated set of common skills; multi-word entries (e.g. "next.js") match literally,
// single tokens match on word boundaries so "r" or "go" don't match inside other words.
const KNOWN_SKILLS = [
  'javascript',
  'typescript',
  'react',
  'next.js',
  'node.js',
  'redux',
  'zustand',
  'graphql',
  'rest',
  'python',
  'java',
  'kotlin',
  'swift',
  'go',
  'rust',
  'c++',
  'c#',
  'ruby',
  'php',
  'sql',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'docker',
  'kubernetes',
  'aws',
  'gcp',
  'azure',
  'terraform',
  'tailwind',
  'css',
  'html',
  'vue',
  'angular',
  'svelte',
  'django',
  'flask',
  'spring',
  'express',
  'nestjs',
  'prisma',
  'git',
  'ci/cd',
  'jest',
  'vitest',
  'playwright',
  'cypress',
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSkills(textLower: string): string[] {
  const found: string[] = [];
  for (const skill of KNOWN_SKILLS) {
    const re = new RegExp(`(^|[^a-z0-9+.#])${escapeRe(skill)}([^a-z0-9+.#]|$)`, 'i');
    if (re.test(textLower)) found.push(skill);
  }
  return found;
}

function classifyUrl(
  raw: string,
): keyof Pick<ParsedResume, 'linkedin' | 'github' | 'portfolio'> | null {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin';
    if (/(^|\.)github\.com$/.test(host)) return 'github';
    return 'portfolio';
  } catch {
    return null;
  }
}

// Heuristic name guess: the first non-empty line that looks like a person's name
// (2–4 capitalized words, no digits/@/url).
function guessName(text: string): { firstName?: string; lastName?: string } {
  for (const rawLine of text.split(/\r?\n/).slice(0, 8)) {
    const line = rawLine.trim();
    if (!line || line.length > 60) continue;
    if (/[@\d]|https?:/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Z][A-Za-z'.-]+$/.test(w))) continue;
    return { firstName: words[0], lastName: words[words.length - 1] };
  }
  return {};
}

export function parseResumeText(text: string): ParsedResume {
  const skills = extractSkills(text.toLowerCase());

  const links: Pick<ParsedResume, 'linkedin' | 'github' | 'portfolio'> = {};
  for (const url of text.match(URL_RE) ?? []) {
    const clean = url.replace(/[.,);]+$/, '');
    const kind = classifyUrl(clean);
    if (kind && !links[kind]) links[kind] = clean;
  }

  return {
    ...guessName(text),
    email: text.match(EMAIL_RE)?.[0],
    phone: text.match(PHONE_RE)?.[0]?.trim(),
    ...links,
    skills,
  };
}

// Merge parsed fields into a profile NON-destructively: only fill empties, union skills.
// The user still reviews everything in the editor before saving.
export function applyParsedResume(profile: Profile, parsed: ParsedResume): Profile {
  const p = profile.personal;
  return {
    ...profile,
    personal: {
      ...p,
      firstName: p.firstName || parsed.firstName || '',
      lastName: p.lastName || parsed.lastName || '',
      email: p.email || parsed.email || '',
      phone: p.phone || parsed.phone || '',
    },
    links: {
      ...profile.links,
      linkedin: profile.links.linkedin || parsed.linkedin || '',
      github: profile.links.github || parsed.github || '',
      portfolio: profile.links.portfolio || parsed.portfolio || '',
    },
    skills: Array.from(new Set([...profile.skills, ...parsed.skills])),
  };
}
