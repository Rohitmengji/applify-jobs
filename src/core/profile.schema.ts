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

// A stored document (résumé or cover letter) — one entry per uploaded/generated file.
export const StoredDocSchema = z.object({
  id: z.string().uuid(),
  blobId: z.string(), // FK into Dexie blobStore
  filename: z.string(),
  label: z.string().optional(), // user-assigned label, e.g. "Frontend Résumé"
  createdAt: z.number().optional(),
});
export type StoredDoc = z.infer<typeof StoredDocSchema>;

// Phase 2 — professional references
export const ReferenceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  relationship: z.string().optional(), // "Manager", "Colleague", "Professor"
  company: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

// Phase 2 — reusable cover-letter templates
export const CoverLetterTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1), // "Generic", "Startup-focused", "Enterprise"
  body: z.string().min(1),
});

// Phase 2 — portfolio / projects
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  url: z.string().optional(),
  description: z.string().optional(),
});

export const ProfileSchema = z.object({
  schemaVersion: z.literal(2),
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
  salary: z
    .object({
      current: z.string().optional(), // current CTC/salary e.g. "1212000"
      expected: z.string().optional(), // expected/desired salary e.g. "2475000"
      // Optional (NOT defaulted): an unset currency must be distinguishable from a chosen
      // one, so we never assume INR and mis-convert a non-INR user's salary.
      currency: z.string().optional(), // home currency
      period: z.string().default('year'), // year | month | hour
      // Per-market salary expectations: when a form asks in a different currency, use
      // the market-specific amount the user set (not a raw conversion). Key = currency code.
      marketExpectations: z
        .record(z.string(), z.string()) // e.g. { USD: "95600", GBP: "72000", EUR: "82500" }
        .default({}),
    })
    .default({}),
  documents: z
    .object({
      resumes: z.array(StoredDocSchema).default([]),
      defaultResumeId: z.string().optional(), // id of the StoredDoc to use by default
      coverLetters: z.array(StoredDocSchema).default([]),
      defaultCoverLetterId: z.string().optional(),
      // Legacy fields kept for reading old profiles during migration (not written anymore)
      resumeBlobId: z.string().optional(),
      resumeFilename: z.string().optional(),
      coverLetterBlobId: z.string().optional(),
      coverLetterFilename: z.string().optional(),
    })
    .default({}),
  answerBank: z.array(AnswerSchema).default([]),
  references: z.array(ReferenceSchema).default([]),
  coverLetterTemplates: z.array(CoverLetterTemplateSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
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
export type Reference = z.infer<typeof ReferenceSchema>;
export type CoverLetterTemplate = z.infer<typeof CoverLetterTemplateSchema>;
export type Project = z.infer<typeof ProjectSchema>;

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
  | 'salary.expected'
  | 'documents.resume'
  | 'documents.coverLetter'
  | 'references.name'
  | 'references.email'
  | 'references.phone'
  | 'references.company'
  | 'references.relationship'
  | 'projects.url'
  | 'skills'
  | 'experience' // resolved per-row by the experience/education filler
  | 'education'
  | 'freeText'; // routed to answer bank / LLM
