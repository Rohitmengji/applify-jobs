import {
  ProfileSchema,
  ExperienceSchema,
  EducationSchema,
  AnswerSchema,
  StoredDocSchema,
  ReferenceSchema,
  CoverLetterTemplateSchema,
  ProjectSchema,
  type Profile,
} from '../profile.schema';

// IMPLEMENTATION.md §9 — JSON profile in chrome.storage.local.
// Never put the résumé here (use Dexie); never use chrome.storage.sync (~100 KB ceiling).

const KEY = 'profile';

// A blank starting profile. NOTE: this is a typed literal, NOT ProfileSchema.parse(...) —
// the schema requires firstName/lastName .min(1) and a valid email, which a brand-new
// empty profile legitimately doesn't have yet. Those constraints are enforced at SAVE
// time (saveProfile parses); the default just needs to be a valid Profile shape with the
// defaulted values filled in. (The spec's §9 snippet parses this and would throw at runtime.)
export const EMPTY: Profile = {
  schemaVersion: 2,
  personal: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: { country: 'United States' },
  },
  links: {},
  workAuth: {
    authorizedToWork: true,
    needsSponsorship: false,
    requiresVisa: false,
    authorizedCountries: [],
  },
  eeo: {},
  experience: [],
  education: [],
  skills: [],
  salary: { period: 'year', marketExpectations: {} }, // currency intentionally unset — user picks it (no INR assumption)
  documents: { resumes: [], coverLetters: [] },
  answerBank: [],
  references: [],
  coverLetterTemplates: [],
  projects: [],
  settings: { llmEnabled: true, autoAdvanceWizard: true, confidenceThreshold: 0.75 },
};

export async function getProfile(): Promise<Profile> {
  const raw = await chrome.storage.local.get(KEY);
  if (!raw[KEY]) return EMPTY;
  // Migrate v1 → v2 before validation
  const migrated = migrate(raw[KEY]);
  const parsed = ProfileSchema.safeParse(migrated);
  if (!parsed.success) {
    console.warn('Profile failed validation, migrating/repairing', parsed.error);
    return repair(migrated); // see §25 for migration strategy
  }
  return parsed.data;
}

export async function saveProfile(p: Profile): Promise<void> {
  const valid = ProfileSchema.parse(p); // throws on invalid — fail loud in the editor
  await chrome.storage.local.set({ [KEY]: valid });
}

export function onProfileChange(cb: (p: Profile) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]?.newValue) {
      const parsed = ProfileSchema.safeParse(changes[KEY].newValue);
      if (parsed.success) cb(parsed.data);
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

// Migrate v1 profile (single resumeBlobId) → v2 (resumes[]/coverLetters[] arrays).
// Idempotent: if already v2 or not an object, returns as-is.
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion === 2) return obj;
  // v1 → v2
  const docs = (obj.documents ?? {}) as Record<string, unknown>;
  const resumes: unknown[] = [];
  let defaultResumeId: string | undefined;
  if (docs.resumeBlobId && typeof docs.resumeBlobId === 'string') {
    const id = crypto.randomUUID();
    resumes.push({
      id,
      blobId: docs.resumeBlobId,
      filename: (docs.resumeFilename as string) || 'Resume',
      label: 'Résumé',
      createdAt: Date.now(),
    });
    defaultResumeId = id;
  }
  const coverLetters: unknown[] = [];
  let defaultCoverLetterId: string | undefined;
  if (docs.coverLetterBlobId && typeof docs.coverLetterBlobId === 'string') {
    const clId = crypto.randomUUID();
    coverLetters.push({
      id: clId,
      blobId: docs.coverLetterBlobId,
      filename: (docs.coverLetterFilename as string) || 'Cover Letter',
      label: 'Cover Letter',
      createdAt: Date.now(),
    });
    defaultCoverLetterId = clId;
  }
  return {
    ...obj,
    schemaVersion: 2,
    documents: {
      resumes,
      defaultResumeId,
      coverLetters,
      defaultCoverLetterId,
    },
  };
}

// §25: When ProfileSchema changes, attempt to migrate old data instead of wiping it.
// Strategy: deep-merge the old data with EMPTY defaults, then parse. This preserves
// any valid fields while filling in new required fields with defaults.
function repair(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const obj = raw as Record<string, unknown>;

  // Deep merge: for each top-level key in EMPTY, use the existing value if present,
  // otherwise use the default. For nested objects, merge recursively.
  function deepMerge(
    base: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(patch)) {
      const bVal = base[key];
      const pVal = patch[key];
      if (
        pVal != null &&
        typeof pVal === 'object' &&
        !Array.isArray(pVal) &&
        bVal != null &&
        typeof bVal === 'object' &&
        !Array.isArray(bVal)
      ) {
        result[key] = deepMerge(bVal as Record<string, unknown>, pVal as Record<string, unknown>);
      } else if (pVal !== undefined) {
        result[key] = pVal;
      }
    }
    return result;
  }

  const merged = deepMerge(EMPTY as unknown as Record<string, unknown>, obj);
  // Force the current schema version
  merged.schemaVersion = 2;

  const parsed = ProfileSchema.safeParse(merged);
  if (parsed.success) return parsed.data;

  // Salvage rather than wipe: one corrupt row shouldn't cost the user their whole profile.
  // Drop only the individual array elements that fail their element schema, then re-parse.
  const keep = <T>(v: unknown, schema: { safeParse: (x: unknown) => { success: boolean } }): T[] =>
    Array.isArray(v) ? (v.filter((e) => schema.safeParse(e).success) as T[]) : [];
  merged.experience = keep(merged.experience, ExperienceSchema);
  merged.education = keep(merged.education, EducationSchema);
  merged.answerBank = keep(merged.answerBank, AnswerSchema);
  merged.references = keep(merged.references, ReferenceSchema);
  merged.coverLetterTemplates = keep(merged.coverLetterTemplates, CoverLetterTemplateSchema);
  merged.projects = keep(merged.projects, ProjectSchema);
  if (Array.isArray(merged.skills))
    merged.skills = merged.skills.filter((s) => typeof s === 'string');
  // Salvage document arrays
  if (
    merged.documents &&
    typeof merged.documents === 'object' &&
    !Array.isArray(merged.documents)
  ) {
    const docs = merged.documents as Record<string, unknown>;
    docs.resumes = keep(docs.resumes, StoredDocSchema);
    docs.coverLetters = keep(docs.coverLetters, StoredDocSchema);
  }

  // Also drop any invalid optional link (all four are optional url-or-''), so a single bad
  // URL doesn't fail the parse and wipe the whole profile.
  if (merged.links && typeof merged.links === 'object' && !Array.isArray(merged.links)) {
    const links = merged.links as Record<string, unknown>;
    const validLink = (v: unknown): boolean => {
      if (v === '') return true;
      if (typeof v !== 'string') return false;
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    };
    for (const k of ['linkedin', 'github', 'portfolio', 'website']) {
      if (k in links && !validLink(links[k])) delete links[k];
    }
  }

  const salvaged = ProfileSchema.safeParse(merged);
  if (salvaged.success) return salvaged.data;

  // Still invalid (e.g. a required personal field is corrupt) — start fresh as a last resort.
  console.warn('Profile repair failed, starting fresh:', salvaged.error);
  return EMPTY;
}
