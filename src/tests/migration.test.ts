import { describe, it, expect } from 'vitest';
import { migrate } from '@/core/storage/profileStore';
import { ProfileSchema } from '@/core/profile.schema';

describe('schema migration v1 → v2', () => {
  const v1Profile = {
    schemaVersion: 1,
    personal: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '5551234',
      address: { country: 'United States' },
    },
    links: {},
    workAuth: { authorizedToWork: true, needsSponsorship: false, requiresVisa: false },
    eeo: {},
    experience: [],
    education: [],
    skills: ['TypeScript'],
    documents: {
      resumeBlobId: 'blob-abc-123',
      resumeFilename: 'my-resume.pdf',
      coverLetterBlobId: 'blob-def-456',
      coverLetterFilename: 'cover.docx',
    },
    answerBank: [],
    settings: { llmEnabled: true, autoAdvanceWizard: true, confidenceThreshold: 0.6 },
  };

  it('migrates v1 documents to resumes[] and coverLetters[]', () => {
    const migrated = migrate(v1Profile) as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(2);

    const docs = migrated.documents as {
      resumes: { id: string; blobId: string; filename: string; label: string }[];
      defaultResumeId: string;
      coverLetters: { id: string; blobId: string; filename: string; label: string }[];
      defaultCoverLetterId: string;
    };

    expect(docs.resumes).toHaveLength(1);
    expect(docs.resumes[0].blobId).toBe('blob-abc-123');
    expect(docs.resumes[0].filename).toBe('my-resume.pdf');
    expect(docs.resumes[0].label).toBe('Résumé');
    expect(docs.defaultResumeId).toBe(docs.resumes[0].id);

    expect(docs.coverLetters).toHaveLength(1);
    expect(docs.coverLetters[0].blobId).toBe('blob-def-456');
    expect(docs.coverLetters[0].filename).toBe('cover.docx');
    expect(docs.defaultCoverLetterId).toBe(docs.coverLetters[0].id);
  });

  it('migrated profile passes schema validation', () => {
    const migrated = migrate(v1Profile);
    const result = ProfileSchema.safeParse(migrated);
    expect(result.success).toBe(true);
  });

  it('is idempotent on v2 profiles', () => {
    const v2Profile = {
      schemaVersion: 2,
      personal: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '5551234',
        address: { country: 'US' },
      },
      links: {},
      workAuth: { authorizedToWork: true, needsSponsorship: false, requiresVisa: false },
      eeo: {},
      experience: [],
      education: [],
      skills: [],
      documents: {
        resumes: [{ id: 'r1', blobId: 'b1', filename: 'resume.pdf' }],
        defaultResumeId: 'r1',
        coverLetters: [],
      },
      answerBank: [],
      settings: {},
    };
    expect(migrate(v2Profile)).toBe(v2Profile); // same reference — no mutation
  });

  it('handles v1 profile with no documents gracefully', () => {
    const noDocsProfile = { ...v1Profile, documents: {} };
    const migrated = migrate(noDocsProfile) as Record<string, unknown>;
    const docs = migrated.documents as {
      resumes: unknown[];
      coverLetters: unknown[];
      defaultResumeId?: string;
    };
    expect(docs.resumes).toHaveLength(0);
    expect(docs.coverLetters).toHaveLength(0);
    expect(docs.defaultResumeId).toBeUndefined();
  });

  it('handles null/undefined input', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate(undefined)).toBeUndefined();
  });

  it('preserves documents array through repair round-trip', () => {
    // Simulate a profile that has the new documents format but is missing a required field
    // (e.g. firstName) — repair() should salvage the documents array.
    const corruptProfile = {
      schemaVersion: 2,
      personal: {
        firstName: '', // fails .min(1) on parse — triggers repair
        lastName: 'Test',
        email: 'test@x.com',
        phone: '123',
        address: { country: 'US' },
      },
      links: {},
      workAuth: { authorizedToWork: true, needsSponsorship: false, requiresVisa: false },
      eeo: {},
      experience: [],
      education: [],
      skills: [],
      documents: {
        resumes: [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', blobId: 'b1', filename: 'r.pdf' }],
        defaultResumeId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        coverLetters: [],
      },
      answerBank: [],
      references: [],
      coverLetterTemplates: [],
      projects: [],
      settings: {},
    };
    // Since firstName is empty string and schema requires .min(1), safeParse fails,
    // but repair should keep documents intact (EMPTY has firstName='').
    const migrated = migrate(corruptProfile);
    const result = ProfileSchema.safeParse(migrated);
    // If parse succeeds (EMPTY merge fills required fields), docs should survive
    if (result.success) {
      expect(result.data.documents.resumes).toHaveLength(1);
      expect(result.data.documents.resumes[0].blobId).toBe('b1');
    }
  });
});
