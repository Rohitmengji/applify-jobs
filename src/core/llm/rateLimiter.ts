// LLM rate limiter — prevents more than N calls per rolling window.
// Used in the background worker to protect against runaway cost if the user
// rapidly triggers "Draft with AI" or the auto-batch enrichment loops.

const DEFAULT_MAX_CALLS = 20; // per window
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

export class RateLimiter {
  private timestamps: number[] = [];
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = DEFAULT_MAX_CALLS, windowMs = DEFAULT_WINDOW_MS) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Returns true if the call is allowed, false if rate-limited. */
  tryAcquire(): boolean {
    const now = Date.now();
    // Evict timestamps outside the rolling window
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.max) return false;
    this.timestamps.push(now);
    return true;
  }

  /** How many calls remain before hitting the limit. */
  remaining(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return Math.max(0, this.max - this.timestamps.length);
  }

  /** Time in ms until the next slot opens (0 if not rate-limited). */
  retryAfterMs(): number {
    if (this.timestamps.length < this.max) return 0;
    const oldest = this.timestamps[0];
    return Math.max(0, this.windowMs - (Date.now() - oldest));
  }
}

// Singleton for the background worker's LLM calls
export const llmLimiter = new RateLimiter();

// --- Daily call budget (persists across service worker restarts via chrome.storage.session) ---
// MV3 kills the service worker after 30s of inactivity, resetting the in-memory limiter.
// This daily counter survives restarts (session storage lives until browser close) and caps
// total LLM calls per browser session to prevent runaway cost.
const DAILY_KEY = 'llmDailyUsage';
const DAILY_CAP = 500; // generous but bounded

interface DailyUsage {
  date: string; // YYYY-MM-DD
  count: number;
}

async function getDailyUsage(): Promise<DailyUsage> {
  try {
    const raw = await chrome.storage.session.get(DAILY_KEY);
    return (raw[DAILY_KEY] as DailyUsage | undefined) ?? { date: '', count: 0 };
  } catch {
    return { date: '', count: 0 };
  }
}

/** Check the daily budget. Returns true if allowed, false if capped. */
export async function checkDailyBudget(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await getDailyUsage();
  // New day → reset
  if (usage.date !== today) return true;
  return usage.count < DAILY_CAP;
}

/** Increment the daily call counter. Call after each successful LLM request. */
export async function recordDailyCall(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await getDailyUsage();
  const updated: DailyUsage =
    usage.date === today ? { date: today, count: usage.count + 1 } : { date: today, count: 1 };
  try {
    await chrome.storage.session.set({ [DAILY_KEY]: updated });
  } catch {
    /* session storage unavailable — skip */
  }
}
