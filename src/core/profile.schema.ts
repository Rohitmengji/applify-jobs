import { z } from 'zod';

// IMPLEMENTATION.md §8 — the profile is the contract everything maps to.
// Define it once with Zod; infer the TS type.

const dateStr = z.string().regex(/^\d{4}(-\d{2})?(-\d{2})?$/, 'use YYYY, YYYY-MM, or YYYY-MM-DD');

export const ExperienceSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  startDate: dateStr,
  endDate: dateStr.optional(),
  current: z.boolean().default(false),
  description: z.string().default(''),
});

export const EducationSchema = z.object({
  id: z.string().uuid(),
  school: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  gpa: z.string().optional(),
});

export const AnswerSchema = z.object({
  id: z.string().uuid(),
  questionPattern: z.string().min(1), // matched fuzzily against field labels
  answer: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  schemaVersion: z.literal(1),
  personal: z.object({
    firstName: z.string().min(1),
    middleName: z.string().optional(),
    lastName: z.string().min(1),
    preferredName: z.string().optional(),
    email: z.string().email(),
    phone: z.string().min(1),
    address: z.object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().default('United States'),
    }),
  }),
  links: z.object({
    linkedin: z.string().url().optional().or(z.literal('')),
    github: z.string().url().optional().or(z.literal('')),
    portfolio: z.string().url().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
  }),
  workAuth: z.object({
    authorizedToWork: z.boolean().default(true),
    needsSponsorship: z.boolean().default(false),
    requiresVisa: z.boolean().default(false),
    // Countries you can work in WITHOUT sponsorship. When a work-auth question names a
    // country, the answer is derived from this (defaults to your home country if empty).
    authorizedCountries: z.array(z.string()).default([]),
  }),
  // EEO/voluntary disclosures — all optional, default to "decline to self-identify".
  eeo: z
    .object({
      gender: z.string().optional(),
      race: z.string().optional(),
      hispanicLatino: z.string().optional(),
      veteranStatus: z.string().optional(),
      disabilityStatus: z.string().optional(),
    })
    .default({}),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(z.string()).default([]),
  documents: z
    .object({
      resumeBlobId: z.string().optional(), // FK into Dexie blobStore
      resumeFilename: z.string().optional(),
      coverLetterBlobId: z.string().optional(),
      coverLetterFilename: z.string().optional(),
    })
    .default({}),
  answerBank: z.array(AnswerSchema).default([]),
  settings: z
    .object({
      llmEnabled: z.boolean().default(true),
      autoAdvanceWizard: z.boolean().default(true),
      confidenceThreshold: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type SavedAnswer = z.infer<typeof AnswerSchema>;

// Dot-path keys the engine maps fields to. Keep in sync with the schema.
export type ProfileKey =
  | 'personal.firstName'
  | 'personal.middleName'
  | 'personal.lastName'
  | 'personal.preferredName'
  | 'personal.email'
  | 'personal.phone'
  | 'personal.address.line1'
  | 'personal.address.line2'
  | 'personal.address.city'
  | 'personal.address.state'
  | 'personal.address.zip'
  | 'personal.address.country'
  | 'links.linkedin'
  | 'links.github'
  | 'links.portfolio'
  | 'links.website'
  | 'workAuth.authorizedToWork'
  | 'workAuth.needsSponsorship'
  | 'workAuth.requiresVisa'
  | 'eeo.gender'
  | 'eeo.race'
  | 'eeo.hispanicLatino'
  | 'eeo.veteranStatus'
  | 'eeo.disabilityStatus'
  | 'documents.resume'
  | 'documents.coverLetter'
  | 'skills'
  | 'experience' // resolved per-row by the experience/education filler
  | 'education'
  | 'freeText'; // routed to answer bank / LLM
