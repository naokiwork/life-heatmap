/**
 * api.ts — Cloudflare Worker (production backend)
 *
 * Framework: Hono (Edge-native, no Node.js dependencies)
 * Auth:      Replit OIDC → our own signed JWT (HS256, jose library)
 * DB:        Supabase JS client (REST/PostgREST — no TCP required)
 * Secrets:   All secrets are Worker environment bindings — NEVER in client code
 *
 * Secrets to set via `wrangler secret put <NAME>`:
 *   SUPABASE_SERVICE_ROLE_KEY  — server-only, never exposed to client
 *   JWT_SECRET                 — server-only
 *   REPL_CLIENT_ID             — Replit app ID (= REPL_ID on Replit)
 *   OPENAI_API_KEY             — server-only
 *
 * Public vars in wrangler.toml [vars] (safe to be in source):
 *   SUPABASE_URL
 *   OPENAI_BASE_URL
 *   FRONTEND_ORIGIN
 *   WORKER_URL
 *   ENVIRONMENT
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";
import { buildLoginRedirect, handleCallback, verifyAppJwt } from "./auth";
import { checkRateLimit, RATE_LIMITS } from "./rateLimit";
import * as db from "./storage";

// ─── Worker environment typings ───────────────────────────────────────────────

export interface Env {
  // Public vars (wrangler.toml [vars])
  SUPABASE_URL: string;
  OPENAI_BASE_URL: string;
  FRONTEND_ORIGIN: string;
  WORKER_URL: string;
  ENVIRONMENT: string;

  // Secrets (wrangler secret put)
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  REPL_CLIENT_ID: string;
  OPENAI_API_KEY: string;

  // KV namespace binding
  RATE_LIMIT_KV: KVNamespace;

  // Kill switch (set to "false" to disable AI instantly)
  FEATURE_AI_INSIGHTS_ENABLED?: string;
  AI_DAILY_QUOTA_PER_USER?: string;
}

// ─── App setup ────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: { userId: string; tier: string } }>();

// CORS — allows only the Pages frontend (not *)
app.use("/api/*", async (c, next) => {
  const origin = c.env.FRONTEND_ORIGIN;
  return cors({
    origin,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })(c, next);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSupabase(env: Env) {
  // Service role key is server-only — grants full DB access, bypasses RLS
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function makeOpenAI(env: Env) {
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL || undefined,
  });
}

/** Extract and verify the Bearer JWT from Authorization header */
async function authenticate(c: any): Promise<{ userId: string; tier: string } | null> {
  const auth = c.req.header("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const claims = await verifyAppJwt(token, c.env.JWT_SECRET);
    return { userId: claims.sub, tier: claims.tier ?? "free" };
  } catch {
    return null;
  }
}

/** Middleware: require valid JWT */
const requireAuth = async (c: any, next: () => Promise<void>) => {
  const user = await authenticate(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  c.set("userId", user.userId);
  c.set("tier", user.tier);
  await next();
};

/** Middleware: require premium tier */
const requirePremium = async (c: any, next: () => Promise<void>) => {
  const tier = c.get("tier");
  if (tier !== "premium") {
    return c.json({ message: "This feature requires Premium.", upgrade_required: true }, 402);
  }
  await next();
};

/** IP-based rate limit check (returns 429 if exceeded) */
async function ipRateLimit(c: any, profile: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS]) {
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
  const result = await checkRateLimit({
    kv: c.env.RATE_LIMIT_KV,
    key: `ip:${ip}`,
    ...profile,
  });
  if (!result.allowed) {
    return c.json({ message: "Too many requests. Please slow down." }, 429);
  }
  return null;
}

/** Per-user rate limit check */
async function userRateLimit(c: any, userId: string, profile: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS]) {
  const result = await checkRateLimit({
    kv: c.env.RATE_LIMIT_KV,
    key: `user:${userId}`,
    ...profile,
  });
  if (!result.allowed) {
    return c.json({ message: "Daily AI insight limit reached. Come back tomorrow!" }, 429);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.get("/api/login", async (c) => {
  const limited = await ipRateLimit(c, RATE_LIMITS.auth);
  if (limited) return limited;

  return buildLoginRedirect({
    clientId: c.env.REPL_CLIENT_ID,
    callbackUrl: `${c.env.WORKER_URL}/api/callback`,
    kv: c.env.RATE_LIMIT_KV,
  });
});

app.get("/api/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.redirect(`${c.env.FRONTEND_ORIGIN}/?error=missing_params`);
  }

  const supabase = makeSupabase(c.env);

  return handleCallback({
    clientId: c.env.REPL_CLIENT_ID,
    callbackUrl: `${c.env.WORKER_URL}/api/callback`,
    jwtSecret: c.env.JWT_SECRET,
    frontendOrigin: c.env.FRONTEND_ORIGIN,
    kv: c.env.RATE_LIMIT_KV,
    supabase,
    code,
    state,
  });
});

app.get("/api/logout", (c) => {
  return c.redirect(`${c.env.FRONTEND_ORIGIN}/`);
});

app.get("/api/auth/user", requireAuth, async (c) => {
  const supabase = makeSupabase(c.env);
  const user = await db.getUser(supabase, c.get("userId"));
  if (!user) return c.json({ message: "User not found" }, 404);
  return c.json(user);
});

// ─── Tier ─────────────────────────────────────────────────────────────────────

app.get("/api/tier", requireAuth, async (c) => {
  const supabase = makeSupabase(c.env);
  const userId = c.get("userId");
  const tier = await db.getUserTier(supabase, userId);
  const categoryCount = await db.getCategoryCount(supabase, userId);
  return c.json({ tier, categoryCount, categoryLimit: tier === "premium" ? null : 5 });
});

// ─── Categories ───────────────────────────────────────────────────────────────

app.get("/api/categories", requireAuth, async (c) => {
  const supabase = makeSupabase(c.env);
  const cats = await db.getCategories(supabase, c.get("userId"));
  return c.json(cats);
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

app.post("/api/categories", requireAuth, async (c) => {
  const limited = await ipRateLimit(c, RATE_LIMITS.general);
  if (limited) return limited;

  const body = await c.req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) return c.json({ message: parsed.error.errors[0].message }, 400);

  const supabase = makeSupabase(c.env);
  const userId = c.get("userId");

  const canCreate = await db.canCreateCategory(supabase, userId);
  if (!canCreate) {
    return c.json({
      message: "Category limit reached. Upgrade to Premium for unlimited categories.",
      upgrade_required: true,
    }, 402);
  }

  const cat = await db.createCategory(supabase, userId, parsed.data);
  return c.json(cat, 201);
});

app.delete("/api/categories/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) return c.json({ message: "Invalid id" }, 400);
  const supabase = makeSupabase(c.env);
  await db.deleteCategory(supabase, id, c.get("userId"));
  return new Response(null, { status: 204 });
});

// ─── Activity Sessions ────────────────────────────────────────────────────────

app.get("/api/activity-sessions", requireAuth, async (c) => {
  const supabase = makeSupabase(c.env);
  const sessions = await db.getActivitySessions(supabase, c.get("userId"));
  return c.json(sessions);
});

const createSessionSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationMinutes: z.coerce.number().int().positive().max(1440),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

app.post("/api/activity-sessions", requireAuth, async (c) => {
  const limited = await ipRateLimit(c, RATE_LIMITS.general);
  if (limited) return limited;

  const body = await c.req.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: parsed.error.errors[0].message }, 400);

  const supabase = makeSupabase(c.env);
  const session = await db.createActivitySession(supabase, c.get("userId"), parsed.data);
  return c.json(session, 201);
});

// ─── Goals (Premium) ──────────────────────────────────────────────────────────

app.get("/api/goals", requireAuth, requirePremium, async (c) => {
  const supabase = makeSupabase(c.env);
  return c.json(await db.getGoals(supabase, c.get("userId")));
});

const createGoalSchema = z.object({
  name: z.string().min(1).max(100),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  targetMinutes: z.coerce.number().int().positive().max(525600),
  deadline: z.string().optional().nullable(),
});

app.post("/api/goals", requireAuth, requirePremium, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: parsed.error.errors[0].message }, 400);

  const supabase = makeSupabase(c.env);
  const goal = await db.createGoal(supabase, c.get("userId"), {
    name: parsed.data.name,
    categoryId: parsed.data.categoryId ?? null,
    targetMinutes: parsed.data.targetMinutes,
    deadline: parsed.data.deadline ?? null,
  });
  return c.json(goal, 201);
});

app.delete("/api/goals/:id", requireAuth, requirePremium, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) return c.json({ message: "Invalid id" }, 400);
  const supabase = makeSupabase(c.env);
  await db.deleteGoal(supabase, id, c.get("userId"));
  return new Response(null, { status: 204 });
});

// ─── Analytics (Premium) ──────────────────────────────────────────────────────

app.get("/api/analytics/weekly", requireAuth, requirePremium, async (c) => {
  const supabase = makeSupabase(c.env);
  return c.json(await db.getWeeklyAnalytics(supabase, c.get("userId")));
});

app.get("/api/analytics/daily", requireAuth, requirePremium, async (c) => {
  const days = Math.min(365, Math.max(1, Number(c.req.query("days") ?? 30)));
  const supabase = makeSupabase(c.env);
  return c.json(await db.getDailyAnalytics(supabase, c.get("userId"), days));
});

app.get("/api/analytics/categories", requireAuth, requirePremium, async (c) => {
  const supabase = makeSupabase(c.env);
  return c.json(await db.getCategoryBreakdown(supabase, c.get("userId")));
});

// ─── Leaderboard (Premium) ────────────────────────────────────────────────────

app.get("/api/leaderboard", requireAuth, requirePremium, async (c) => {
  const supabase = makeSupabase(c.env);
  return c.json(await db.getLeaderboard(supabase));
});

// ─── AI Insights (Premium) ────────────────────────────────────────────────────
// SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY are server-only secrets.
// They are bound via `wrangler secret put` and never sent to the frontend.

app.get("/api/insights", requireAuth, requirePremium, async (c) => {
  // Kill switch: set FEATURE_AI_INSIGHTS_ENABLED=false to disable instantly
  const killSwitch = c.env.FEATURE_AI_INSIGHTS_ENABLED;
  if (killSwitch !== undefined && killSwitch.toLowerCase() === "false") {
    return c.json({ message: "AI Insights are temporarily unavailable." }, 503);
  }

  const userId = c.get("userId");

  // IP-level cap
  const ipLimited = await ipRateLimit(c, RATE_LIMITS.ai);
  if (ipLimited) return ipLimited;

  // Per-user daily quota
  const quota = Number(c.env.AI_DAILY_QUOTA_PER_USER ?? "20");
  const userLimited = await userRateLimit(c, userId, { windowMs: 24 * 60 * 60 * 1000, max: quota });
  if (userLimited) return userLimited;

  const supabase = makeSupabase(c.env);
  const sessions = await db.getActivitySessions(supabase, userId);

  if (sessions.length < 3) {
    return c.json([{ insight: "Not enough data yet. Log more activities!", type: "neutral" }]);
  }

  try {
    const openai = makeOpenAI(c.env);
    const recentSessions = sessions.slice(0, 50).map((s: any) => ({
      category: s.category?.name,
      durationMinutes: s.duration_minutes,
      date: s.date,
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a productivity AI. Analyze the user's activity sessions and provide 3 short insights (under 15 words each) about their behavior, trends, or motivation. Return JSON: { insights: [{ insight: 'string', type: 'positive' | 'negative' | 'neutral' }] }",
        },
        { role: "user", content: JSON.stringify(recentSessions) },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message?.content || '{"insights":[]}');
    return c.json(parsed.insights ?? []);
  } catch (e) {
    // Log error server-side — never expose API error details to client
    console.error("[ai-insights] OpenAI error:", (e as Error).message);
    return c.json([{ insight: "Keep up the good work!", type: "positive" }]);
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  // Never expose stack traces or internal details to the client
  console.error("[worker-error]", err.message);
  return c.json({ message: "An internal error occurred. Please try again." }, 500);
});

app.notFound((c) => c.json({ message: "Not found" }, 404));

export default app;
