import type { ProfileKey } from '../profile.schema';

// IMPLEMENTATION.md §19 — field-mapping + answer-drafting prompts.

export const PROFILE_KEYS: ProfileKey[] = [
  'personal.firstName',
  'personal.middleName',
  'personal.lastName',
  'personal.preferredName',
  'personal.email',
  'personal.phone',
  'personal.address.line1',
  'personal.address.line2',
  'personal.address.city',
  'personal.address.state',
  'personal.address.zip',
  'personal.address.country',
  'links.linkedin',
  'links.github',
  'links.portfolio',
  'links.website',
  'workAuth.authorizedToWork',
  'workAuth.needsSponsorship',
  'workAuth.requiresVisa',
  'eeo.gender',
  'eeo.race',
  'eeo.hispanicLatino',
  'eeo.veteranStatus',
  'eeo.disabilityStatus',
  'documents.resume',
  'documents.coverLetter',
  'skills',
  'freeText',
];

export function mappingSystemPrompt(): string {
  return [
    'You map web form fields to profile keys for a job-application autofill tool.',
    'You will receive an array of fields (each with a label and HTML attributes).',
    `Valid keys: ${PROFILE_KEYS.join(', ')}.`,
    'Use "freeText" for open questions (e.g. "why do you want to work here").',
    'Use null if no key fits.',
    'Respond with ONLY a JSON array, no prose, no markdown fences:',
    '[{"uid":"...","key":"personal.firstName"|null,"confidence":0.0-1.0}]',
  ].join('\n');
}

export function draftSystemPrompt(): string {
  return [
    'You draft concise, professional answers to job-application free-text questions,',
    'in the first person, grounded ONLY in the provided candidate profile.',
    'Do not invent facts not present in the profile. 2–5 sentences unless the question implies otherwise.',
    'Respond with ONLY the answer text.',
  ].join('\n');
}
