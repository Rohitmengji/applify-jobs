// Admin configuration — manages users, credit allocations, and key visibility.
// Only accessible through the admin panel (password-protected).

const ADMIN_KEY = 'adminConfig';
const ADMIN_PASS_KEY = 'adminPasswordHash';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  monthlyCredits: number;
  creditsUsed: number;
  lastActive: string; // ISO timestamp
  hasOwnKey: boolean;
  ownKeyProvider?: 'openai' | 'anthropic';
  ownKeyMasked?: string; // last 4 chars only, for admin display
  registeredAt: string; // ISO timestamp
  isActive: boolean;
  /** Daily usage log: { "2026-07-20": { calls: 5, types: { mapping: 2, draft: 3 } } } */
  usageLog?: Record<string, { calls: number; types: Record<string, number> }>;
}

export interface AdminConfig {
  /** Default monthly credits for new users. */
  defaultMonthlyCredits: number;
  /** Admin's shared API key (used for all users without their own key). */
  sharedApiKey: string;
  sharedApiProvider: 'openai' | 'anthropic';
  /** All registered users. */
  users: UserRecord[];
  /** Global kill switch — disable AI for all users. */
  aiEnabled: boolean;
  /** Admin notes / log. */
  notes: string;
}

const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  defaultMonthlyCredits: 100,
  sharedApiKey: '',
  sharedApiProvider: 'openai',
  users: [],
  aiEnabled: true,
  notes: '',
};

/** Hash a password using SHA-256 (for admin auth). */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Set the admin password (first-time setup). */
export async function setAdminPassword(password: string): Promise<void> {
  const hash = await hashPassword(password);
  await chrome.storage.local.set({ [ADMIN_PASS_KEY]: hash });
}

/** Verify admin password. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const raw = await chrome.storage.local.get(ADMIN_PASS_KEY);
  const storedHash = raw[ADMIN_PASS_KEY] as string | undefined;
  if (!storedHash) return false;
  const inputHash = await hashPassword(password);
  // Constant-time comparison to prevent timing attacks
  if (inputHash.length !== storedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < inputHash.length; i++) {
    mismatch |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Check if admin password has been set. */
export async function isAdminSetup(): Promise<boolean> {
  const raw = await chrome.storage.local.get(ADMIN_PASS_KEY);
  return !!raw[ADMIN_PASS_KEY];
}

/** Get admin config (requires prior auth check). */
export async function getAdminConfig(): Promise<AdminConfig> {
  const raw = await chrome.storage.local.get(ADMIN_KEY);
  return (raw[ADMIN_KEY] as AdminConfig) ?? { ...DEFAULT_ADMIN_CONFIG };
}

/** Save admin config. */
export async function saveAdminConfig(config: AdminConfig): Promise<void> {
  await chrome.storage.local.set({ [ADMIN_KEY]: config });
}

/** Register a new user (called on first extension use). */
export async function registerUser(id: string, name: string, email: string): Promise<void> {
  const config = await getAdminConfig();
  const existing = config.users.find((u) => u.id === id);
  if (existing) {
    existing.lastActive = new Date().toISOString();
    existing.name = name || existing.name;
    existing.email = email || existing.email;
  } else {
    config.users.push({
      id,
      name,
      email,
      monthlyCredits: config.defaultMonthlyCredits,
      creditsUsed: 0,
      lastActive: new Date().toISOString(),
      hasOwnKey: false,
      registeredAt: new Date().toISOString(),
      isActive: true,
    });
  }
  await saveAdminConfig(config);
}

/** Update a user's monthly credit allocation. */
export async function setUserCredits(userId: string, credits: number): Promise<void> {
  const config = await getAdminConfig();
  const user = config.users.find((u) => u.id === userId);
  if (user) {
    user.monthlyCredits = credits;
    await saveAdminConfig(config);
  }
}

/** Record that a user has provided their own API key. */
export async function recordUserKey(
  userId: string,
  provider: 'openai' | 'anthropic',
  keyLast4: string,
): Promise<void> {
  const config = await getAdminConfig();
  const user = config.users.find((u) => u.id === userId);
  if (user) {
    user.hasOwnKey = true;
    user.ownKeyProvider = provider;
    user.ownKeyMasked = `****${keyLast4}`;
    await saveAdminConfig(config);
  }
}

/** Deactivate a user (revoke access). */
export async function deactivateUser(userId: string): Promise<void> {
  const config = await getAdminConfig();
  const user = config.users.find((u) => u.id === userId);
  if (user) {
    user.isActive = false;
    await saveAdminConfig(config);
  }
}

/** Reset all users' monthly usage (called on month rollover). */
export async function resetAllMonthlyUsage(): Promise<void> {
  const config = await getAdminConfig();
  for (const user of config.users) {
    user.creditsUsed = 0;
  }
  await saveAdminConfig(config);
}

/** Record a credit usage event for a specific user (call type + timestamp). */
export async function recordUserUsage(userId: string, callType: string): Promise<void> {
  const config = await getAdminConfig();
  const user = config.users.find((u) => u.id === userId);
  if (!user) return;

  const today = new Date().toISOString().slice(0, 10);
  user.creditsUsed += 1;
  user.lastActive = new Date().toISOString();

  if (!user.usageLog) user.usageLog = {};
  if (!user.usageLog[today]) user.usageLog[today] = { calls: 0, types: {} };
  user.usageLog[today].calls += 1;
  user.usageLog[today].types[callType] = (user.usageLog[today].types[callType] ?? 0) + 1;

  await saveAdminConfig(config);
}

/** Get usage summary for a user over the last N days. */
export function getUserUsageSummary(
  user: UserRecord,
  days = 30,
): { date: string; calls: number; types: Record<string, number> }[] {
  if (!user.usageLog) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return Object.entries(user.usageLog)
    .filter(([date]) => date >= cutoffStr)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));
}
