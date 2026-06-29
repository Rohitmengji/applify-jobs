import type { Profile } from '../profile.schema';

// Job description analysis: extract required skills from a JD and compare against
// the user's profile to show match percentage and gaps.

const TECH_KEYWORDS = new Set([
  'javascript', 'typescript', 'react', 'next.js', 'node.js', 'python', 'java',
  'go', 'rust', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'scala',
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'graphql', 'rest', 'grpc', 'microservices',
  'react native', 'flutter', 'ios', 'android',
  'html', 'css', 'tailwind', 'sass', 'less',
  'vue', 'angular', 'svelte', 'solid',
  'django', 'flask', 'spring', 'express', 'nestjs', 'fastapi',
  'git', 'ci/cd', 'jenkins', 'github actions',
  'jest', 'vitest', 'playwright', 'cypress', 'selenium',
  'figma', 'sketch', 'adobe xd',
  'agile', 'scrum', 'kanban', 'jira',
  'machine learning', 'deep learning', 'nlp', 'computer vision',
  'tensorflow', 'pytorch', 'scikit-learn',
  'data science', 'data engineering', 'spark', 'hadoop',
  'blockchain', 'web3', 'solidity',
  'accessibility', 'wcag', 'a11y',
  'seo', 'analytics', 'google analytics',
  'stripe', 'payment', 'oauth', 'jwt',
  'prisma', 'drizzle', 'typeorm', 'sequelize',
  'webpack', 'vite', 'esbuild', 'rollup',
  'linux', 'bash', 'nginx', 'apache',
]);

// Experience level keywords
const LEVEL_KEYWORDS: Record<string, string[]> = {
  junior: ['junior', 'entry level', 'entry-level', '0-2 years', '1-2 years', 'new grad', 'associate'],
  mid: ['mid-level', 'mid level', '2-5 years', '3-5 years', '2+ years', '3+ years'],
  senior: ['senior', '5+ years', '5-8 years', '7+ years', 'lead', 'principal', 'staff'],
  executive: ['director', 'vp', 'vice president', 'cto', 'ceo', 'head of'],
};

export interface JdAnalysis {
  requiredSkills: string[];
  niceToHaveSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  matchPercentage: number;
  experienceLevel: string;
  yearsRequired: string | null;
  keywords: string[];
}

export function analyzeJobDescription(jdText: string, profile: Profile): JdAnalysis {
  const text = jdText.toLowerCase();

  // Extract skills mentioned in the JD
  const foundSkills: string[] = [];
  for (const skill of TECH_KEYWORDS) {
    const re = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) foundSkills.push(skill);
  }

  // Categorize as required vs nice-to-have based on context
  const requiredSkills: string[] = [];
  const niceToHaveSkills: string[] = [];

  for (const skill of foundSkills) {
    // Check if skill appears in "nice to have" / "preferred" / "bonus" context
    const skillIdx = text.indexOf(skill);
    const context = text.slice(Math.max(0, skillIdx - 200), skillIdx + skill.length + 50);
    if (/nice to have|preferred|bonus|plus|desired|ideally/i.test(context)) {
      niceToHaveSkills.push(skill);
    } else {
      requiredSkills.push(skill);
    }
  }

  // Compare against user's profile skills
  const userSkills = new Set(profile.skills.map((s) => s.toLowerCase()));
  // Also include skills implied by experience descriptions
  for (const exp of profile.experience) {
    const desc = exp.description.toLowerCase();
    for (const skill of TECH_KEYWORDS) {
      if (desc.includes(skill)) userSkills.add(skill);
    }
  }

  const matchedSkills = requiredSkills.filter((s) => userSkills.has(s));
  const missingSkills = requiredSkills.filter((s) => !userSkills.has(s));
  const matchPercentage = requiredSkills.length > 0
    ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
    : 100;

  // Detect experience level
  let experienceLevel = 'unknown';
  for (const [level, keywords] of Object.entries(LEVEL_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) {
      experienceLevel = level;
      break;
    }
  }

  // Extract years requirement
  const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(of)?\s*(experience|exp)/i);
  const yearsRequired = yearsMatch ? `${yearsMatch[1]}+ years` : null;

  return {
    requiredSkills,
    niceToHaveSkills,
    matchedSkills,
    missingSkills,
    matchPercentage,
    experienceLevel,
    yearsRequired,
    keywords: foundSkills,
  };
}

/** Extract job description text from the current page */
export function extractJobDescription(doc: Document): string {
  // Try structured data first
  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      const data = JSON.parse(ld.textContent ?? '');
      if (data.description) return stripHtml(data.description);
    } catch { /* ignore */ }
  }

  // Try common JD containers
  const selectors = [
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[data-testid*="description"]',
    '[id*="job-description"]',
    '.description',
    'article',
    '[class*="posting-page"]',
    '.job-details',
  ];

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent && el.textContent.trim().length > 200) {
      return el.textContent.trim().slice(0, 5000); // cap at 5k chars
    }
  }

  // Fallback: body text (first 3000 chars)
  return (doc.body.textContent ?? '').trim().slice(0, 3000);
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent ?? '';
}
