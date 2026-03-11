/**
 * rateLimit.ts
 *
 * Sliding-window rate limiter backed by Cloudflare KV.
 * Each key is stored as a JSON array of timestamps, pruned on every check.
 *
 * SERVER-ONLY — never imported by the frontend.
 */

export interface RateLimitOptions {
  /** KV namespace binding */
  kv: KVNamespace;
  /** Unique key (e.g. IP address or `user:<id>`) */
  key: string;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Max requests allowed in the window */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // ms epoch
}

export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { kv, key, windowMs, max } = opts;
  const now = Date.now();
  const windowStart = now - windowMs;

  const stored = await kv.get(`rl:${key}`, "json") as number[] | null;
  const timestamps: number[] = (stored ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: (timestamps[0] ?? now) + windowMs,
    };
  }

  timestamps.push(now);
  // TTL = windowMs in seconds (rounded up), so KV auto-expires stale keys
  await kv.put(`rl:${key}`, JSON.stringify(timestamps), {
    expirationTtl: Math.ceil(windowMs / 1000),
  });

  return {
    allowed: true,
    remaining: max - timestamps.length,
    resetAt: windowStart + windowMs,
  };
}

/**
 * Rate limit profiles used across the Worker.
 * Adjust max / windowMs here to tune billing protection.
 */
export const RATE_LIMITS = {
  /** General API — 300 req / 15 min per IP */
  general: { windowMs: 15 * 60 * 1000, max: 300 },
  /** Auth endpoints — 30 req / 15 min per IP (brute-force protection) */
  auth: { windowMs: 15 * 60 * 1000, max: 30 },
  /** AI insights — 20 req / hour per user (cost protection) */
  ai: { windowMs: 60 * 60 * 1000, max: 20 },
} as const;
