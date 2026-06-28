import { ProfileSchema, type Profile } from '../profile.schema';

// IMPLEMENTATION.md §9 — JSON profile in chrome.storage.local.
// Never put the résumé here (use Dexie); never use chrome.storage.sync (~100 KB ceiling).

const KEY = 'profile';

export const EMPTY: Profile = ProfileSchema.parse({
  schemaVersion: 1,
  personal: {
    firstName: '',
    lastName: '',
    email: 'x@x.com',
    phone: '',
    address: { country: 'United States' },
  },
  links: {},
  workAuth: {},
  eeo: {},
  experience: [],
  education: [],
  skills: [],
  documents: {},
  answerBank: [],
  settings: {},
});

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
