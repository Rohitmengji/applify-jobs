import { ProfileSchema, type Profile } from '../profile.schema';

// IMPLEMENTATION.md §9 — JSON profile in chrome.storage.local.
// Never put the résumé here (use Dexie); never use chrome.storage.sync (~100 KB ceiling).

const KEY = 'profile';

// A blank starting profile. NOTE: this is a typed literal, NOT ProfileSchema.parse(...) —
// the schema requires firstName/lastName .min(1) and a valid email, which a brand-new
// empty profile legitimately doesn't have yet. Those constraints are enforced at SAVE
// time (saveProfile parses); the default just needs to be a valid Profile shape with the
// defaulted values filled in. (The spec's §9 snippet parses this and would throw at runtime.)
export const EMPTY: Profile = {
  schemaVersion: 1,
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
  documents: {},
  answerBank: [],
  settings: { llmEnabled: true, autoAdvanceWizard: true, confidenceThreshold: 0.6 },
};

export async function getProfile(): Promise<Profile> {
  const raw = await chrome.storage.local.get(KEY);
  if (!raw[KEY]) return EMPTY;
  const parsed = ProfileSchema.safeParse(raw[KEY]);
  if (!parsed.success) {
    console.warn('Profile failed validation, migrating/repairing', parsed.error);
    return repair(raw[KEY]); // see §25 for migration strategy
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

// STUB (§25): when ProfileSchema changes, bump schemaVersion and migrate old data
// here instead of wiping it. For now, fall back to a clean profile.
function repair(_raw: unknown): Profile {
  return EMPTY;
}
