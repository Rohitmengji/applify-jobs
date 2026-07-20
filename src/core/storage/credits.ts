// Credit management system — tracks AI usage per user on a monthly basis.
// Admin sets credit limits; when exhausted, the user must provide their own API key.

const CREDITS_KEY = 'creditConfig';
const USAGE_KEY = 'creditUsage';
const USER_ID_KEY = 'userId';

export interface CreditConfig {
  /** Monthly credit allocation (set by admin). 1 credit = 1 AI call. */
  monthlyLimit: number;
  /** Whether user has admin-provided key (shared key mode). */
  sharedKeyEnabled: boolean;
  /** Override: user has their own key configured. */
  userKeyActive: boolean;
  /** When credits were last reset (ISO date string, e.g. "2026-07"). */
  lastResetMonth: string;
}

export interface CreditUsage {
  /** Current month's usage count. */
  used: number;
  /** Month this usage belongs to (e.g. "2026-07"). */
  month: string;
  /** Daily breakdown: { "2026-07-20": 5, ... } */
  daily: Record<string, number>;
}

const DEFAULT_CONFIG: CreditConfig = {
  monthlyLimit: 100,
  sharedKeyEnabled: true,
  userKeyActive: false,
  lastResetMonth: getCurrentMonth(),
};

const DEFAULT_USAGE: CreditUsage = {
  used: 0,
  month: getCurrentMonth(),
  daily: {},
};

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Get or create a unique user ID for this installation. */
export async function getUserId(): Promise<string> {
  const raw = await chrome.storage.local.get(USER_ID_KEY);
  if (raw[USER_ID_KEY]) return raw[USER_ID_KEY] as string;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [USER_ID_KEY]: id });
  return id;
}

/** Get the current credit configuration. */
export async function getCreditConfig(): Promise<CreditConfig> {
  const raw = await chrome.storage.local.get(CREDITS_KEY);
  return (raw[CREDITS_KEY] as CreditConfig) ?? { ...DEFAULT_CONFIG };
}

/** Save credit configuration (admin action). */
export async function saveCreditConfig(config: CreditConfig): Promise<void> {
  await chrome.storage.local.set({ [CREDITS_KEY]: config });
}

/** Get current month's usage, resetting if month has changed. */
export async function getCreditUsage(): Promise<CreditUsage> {
  const raw = await chrome.storage.local.get(USAGE_KEY);
  const usage = (raw[USAGE_KEY] as CreditUsage) ?? { ...DEFAULT_USAGE };
  const currentMonth = getCurrentMonth();

  // Auto-reset on new month
  if (usage.month !== currentMonth) {
    const fresh: CreditUsage = { used: 0, month: currentMonth, daily: {} };
    await chrome.storage.local.set({ [USAGE_KEY]: fresh });
    return fresh;
  }
  return usage;
}

/** Record one credit used. Returns false if over limit. */
export async function consumeCredit(): Promise<boolean> {
  const config = await getCreditConfig();

  // If user has their own key, don't consume shared credits
  if (config.userKeyActive) return true;

  const usage = await getCreditUsage();

  if (usage.used >= config.monthlyLimit) {
    return false; // Over limit
  }

  const today = getToday();
  usage.used += 1;
  usage.daily[today] = (usage.daily[today] ?? 0) + 1;
  await chrome.storage.local.set({ [USAGE_KEY]: usage });
  return true;
}

/** Check if credits are available (without consuming). */
export async function hasCreditsRemaining(): Promise<boolean> {
  const config = await getCreditConfig();
  if (config.userKeyActive) return true;
  const usage = await getCreditUsage();
  return usage.used < config.monthlyLimit;
}

/** Get remaining credits for display. */
export async function getRemainingCredits(): Promise<number> {
  const config = await getCreditConfig();
  if (config.userKeyActive) return Infinity;
  const usage = await getCreditUsage();
  return Math.max(0, config.monthlyLimit - usage.used);
}

/** Mark that user has configured their own API key. */
export async function setUserKeyActive(active: boolean): Promise<void> {
  const config = await getCreditConfig();
  config.userKeyActive = active;
  await saveCreditConfig(config);
}
