import type { Profile } from '../profile.schema';
import { getProfile, saveProfile } from './profileStore';

// Profile variants: store multiple named profiles (Frontend, Fullstack, AI Engineer, etc.)
// and switch between them. The active profile is what gets used for filling.
//
// Stored in chrome.storage.local under 'profileVariants'.

const KEY = 'profileVariants';
const ACTIVE_KEY = 'activeVariant';
const MAX_VARIANTS = 20;

export interface ProfileVariant {
  id: string;
  name: string; // "Frontend", "Fullstack", "AI Engineer"
  createdAt: number;
}

export async function getVariants(): Promise<ProfileVariant[]> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as ProfileVariant[] | undefined) ?? [];
}

export async function getActiveVariantId(): Promise<string | null> {
  const raw = await chrome.storage.local.get(ACTIVE_KEY);
  return (raw[ACTIVE_KEY] as string | undefined) ?? null;
}

/** Save the current profile as a new named variant. */
export async function saveVariant(name: string): Promise<ProfileVariant> {
  const profile = await getProfile();
  const id = crypto.randomUUID();
  const variant: ProfileVariant = { id, name, createdAt: Date.now() };

  // Store the variant metadata (cap at MAX_VARIANTS, evict oldest if over)
  const variants = await getVariants();
  if (variants.length >= MAX_VARIANTS) {
    const oldest = variants.shift();
    if (oldest) await chrome.storage.local.remove(`profile_${oldest.id}`);
  }
  variants.push(variant);
  await chrome.storage.local.set({ [KEY]: variants });

  // Store the profile data under a variant-specific key
  await chrome.storage.local.set({ [`profile_${id}`]: profile });

  return variant;
}

/** Switch to a different profile variant. Saves the current profile first. */
export async function switchVariant(id: string): Promise<Profile | null> {
  // Save current profile under current variant (if any)
  const currentId = await getActiveVariantId();
  if (currentId) {
    const current = await getProfile();
    await chrome.storage.local.set({ [`profile_${currentId}`]: current });
  }

  // Load the target variant's profile
  const raw = await chrome.storage.local.get(`profile_${id}`);
  const data = raw[`profile_${id}`] as Profile | undefined;
  if (!data) return null;

  // Set as the active profile
  await saveProfile(data);
  await chrome.storage.local.set({ [ACTIVE_KEY]: id });
  return data;
}

/** Delete a profile variant. */
export async function deleteVariant(id: string): Promise<void> {
  const variants = await getVariants();
  const filtered = variants.filter((v) => v.id !== id);
  await chrome.storage.local.set({ [KEY]: filtered });
  await chrome.storage.local.remove(`profile_${id}`);

  // If we deleted the active variant, clear the active marker
  const active = await getActiveVariantId();
  if (active === id) {
    await chrome.storage.local.remove(ACTIVE_KEY);
  }
}

/** Rename a variant. */
export async function renameVariant(id: string, name: string): Promise<void> {
  const variants = await getVariants();
  const v = variants.find((x) => x.id === id);
  if (v) {
    v.name = name;
    await chrome.storage.local.set({ [KEY]: variants });
  }
}
