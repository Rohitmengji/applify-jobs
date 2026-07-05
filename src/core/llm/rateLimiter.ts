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
