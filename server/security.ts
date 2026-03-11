/**
 * security.ts
 *
 * Centralised security middleware and guardrails.
 * All server-only logic lives here; nothing in this file is ever sent to the client.
 *
 * Contents:
 *  - Rate limiters (general, auth, AI)
 *  - AI kill switch (FEATURE_AI_INSIGHTS_ENABLED env var)
 *  - Per-user daily AI quota tracker (in-memory, resets at midnight UTC)
 *  - Request body size limit
 *  - Sanitised error response helper
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

// ─────────────────────────────────────────────────────────────────────────────
// 1.  RATE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

/** Applied to every /api/* route. 300 req per 15-min window per IP. */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
  skip: () => process.env.NODE_ENV === "test",
});

/** Applied to auth routes to prevent credential-stuffing. 30 req per 15-min per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
  skip: () => process.env.NODE_ENV === "test",
});

/**
 * Applied specifically to the AI insights endpoint.
 * 20 req per hour per IP (a secondary IP-level cap before the per-user quota kicks in).
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "AI insight quota reached. Try again in an hour." },
  skip: () => process.env.NODE_ENV === "test",
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.  AI KILL SWITCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set FEATURE_AI_INSIGHTS_ENABLED=false in the environment to immediately
 * disable all AI calls without a code deploy.  Defaults to enabled.
 *
 * This is a server-only variable — it is never surfaced to the client.
 */
export function isAiInsightsEnabled(): boolean {
  const flag = process.env.FEATURE_AI_INSIGHTS_ENABLED;
  if (flag === undefined || flag === null) return true;
  return flag.toLowerCase() !== "false" && flag !== "0";
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  PER-USER DAILY AI QUOTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory quota tracker.  Resets at midnight UTC.
 * Daily limit is controlled by AI_DAILY_QUOTA_PER_USER (default: 20).
 *
 * NOTE: This resets on server restart.  For a true persistent quota use
 * a database counter column — acceptable to upgrade later as usage grows.
 */
const DAILY_AI_QUOTA = parseInt(process.env.AI_DAILY_QUOTA_PER_USER || "20", 10);

interface QuotaEntry {
  count: number;
  /** ISO date string (YYYY-MM-DD) so we know which day this belongs to. */
  day: string;
}

const aiQuotaMap = new Map<string, QuotaEntry>();

function todayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Returns true if the user is within quota and increments their counter.
 * Returns false if they have exceeded the daily limit.
 */
export function checkAndIncrementAiQuota(userId: string): boolean {
  const today = todayUTC();
  const entry = aiQuotaMap.get(userId);

  if (!entry || entry.day !== today) {
    aiQuotaMap.set(userId, { count: 1, day: today });
    return true;
  }

  if (entry.count >= DAILY_AI_QUOTA) {
    return false;
  }

  entry.count += 1;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  SAFE ERROR RESPONSE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a client-safe error message.
 * Never exposes stack traces, internal paths, or env variable names.
 */
export function safeErrorMessage(err: unknown, statusCode: number): string {
  if (statusCode < 500) {
    if (err instanceof Error) return err.message;
    return "Bad request.";
  }
  return "An internal error occurred. Please try again.";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  LOG SANITISER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips fields that must never appear in logs:
 * Authorization headers, cookies, raw tokens, API keys, passwords.
 */
export function sanitiseForLog(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  const REDACT_KEYS = new Set([
    "authorization", "cookie", "set-cookie", "password", "token",
    "apikey", "api_key", "secret", "access_token", "refresh_token",
  ]);

  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    redacted[k] = REDACT_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : sanitiseForLog(v);
  }
  return redacted;
}
