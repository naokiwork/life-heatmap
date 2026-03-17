import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth/replitAuth";
import { registerAuthRoutes } from "./replit_integrations/auth/routes";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import OpenAI from "openai";
import Stripe from "stripe";
import { aiLimiter, isAiInsightsEnabled, checkAndIncrementAiQuota } from "./security";

// STRIPE_SECRET_KEY is server-only — never expose to client
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const requirePremium = async (req: any, res: any): Promise<boolean> => {
  const tier = await storage.getUserTier(req.user.claims.sub);
  if (tier !== 'premium') {
    res.status(402).json({
      message: "This feature requires Premium.",
      upgrade_required: true,
    });
    return false;
  }
  return true;
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // ─── Tier Status ─────────────────────────────────────────────
  app.get("/api/tier", isAuthenticated, async (req: any, res) => {
    const tier = await storage.getUserTier(req.user.claims.sub);
    const categoryCount = await storage.getCategoryCount(req.user.claims.sub);
    res.json({ tier, categoryCount, categoryLimit: tier === 'premium' ? null : 5 });
  });

  // ─── Categories ───────────────────────────────────────────────
  app.get(api.categories.list.path, isAuthenticated, async (req: any, res) => {
    const cats = await storage.getCategories(req.user.claims.sub);
    res.json(cats);
  });

  app.post(api.categories.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.categories.create.input.parse(req.body);
      const canCreate = await storage.canCreateCategory(req.user.claims.sub);
      if (!canCreate) {
        return res.status(402).json({
          message: "Category limit reached. Upgrade to Premium for unlimited categories.",
          upgrade_required: true,
        });
      }
      const category = await storage.createCategory({ ...input, userId: req.user.claims.sub });
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete(api.categories.delete.path, isAuthenticated, async (req: any, res) => {
    await storage.deleteCategory(Number(req.params.id), req.user.claims.sub);
    res.status(204).send();
  });

  // ─── Activity Sessions ────────────────────────────────────────
  app.get(api.activitySessions.list.path, isAuthenticated, async (req: any, res) => {
    const sessions = await storage.getActivitySessions(req.user.claims.sub);
    res.json(sessions);
  });

  app.post(api.activitySessions.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.activitySessions.create.input.extend({
        categoryId: z.coerce.number(),
        durationMinutes: z.coerce.number(),
        startTime: z.coerce.date(),
        endTime: z.coerce.date(),
      }).parse(req.body);
      const dateStr = input.startTime.toISOString().split('T')[0];
      const session = await storage.createActivitySession({ ...input, userId: req.user.claims.sub, date: dateStr });
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ─── Goals (Premium) ──────────────────────────────────────────
  app.get("/api/goals", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    const userGoals = await storage.getGoals(req.user.claims.sub);
    res.json(userGoals);
  });

  app.post("/api/goals", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    try {
      const schema = z.object({
        name: z.string().min(1),
        categoryId: z.coerce.number().optional().nullable(),
        targetMinutes: z.coerce.number().min(1),
        deadline: z.string().optional().nullable(),
      });
      const input = schema.parse(req.body);
      const goal = await storage.createGoal({
        userId: req.user.claims.sub,
        name: input.name,
        categoryId: input.categoryId ?? null,
        targetMinutes: input.targetMinutes,
        deadline: input.deadline ? new Date(input.deadline) : null,
      });
      res.status(201).json(goal);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/goals/:id", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    await storage.deleteGoal(Number(req.params.id), req.user.claims.sub);
    res.status(204).send();
  });

  // ─── Analytics (Premium) ─────────────────────────────────────
  app.get("/api/analytics/weekly", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    const data = await storage.getWeeklyAnalytics(req.user.claims.sub);
    res.json(data);
  });

  app.get("/api/analytics/daily", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    const days = Number(req.query.days) || 30;
    const data = await storage.getDailyAnalytics(req.user.claims.sub, days);
    res.json(data);
  });

  app.get("/api/analytics/categories", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    const data = await storage.getCategoryBreakdown(req.user.claims.sub);
    res.json(data);
  });

  // ─── Leaderboard (Premium) ───────────────────────────────────
  app.get("/api/leaderboard", isAuthenticated, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;
    const board = await storage.getLeaderboard();
    res.json(board);
  });

  // ─── AI Insights (Premium) ───────────────────────────────────
  // Server-only: AI_INTEGRATIONS_OPENAI_API_KEY is NEVER sent to the client.
  // Protected by: premium gate, IP rate limit (aiLimiter), kill switch, per-user daily quota.
  app.get(api.insights.get.path, isAuthenticated, aiLimiter, async (req: any, res) => {
    if (!await requirePremium(req, res)) return;

    // Kill switch — set FEATURE_AI_INSIGHTS_ENABLED=false to disable instantly
    if (!isAiInsightsEnabled()) {
      return res.status(503).json({ message: "AI Insights are temporarily unavailable." });
    }

    // Per-user daily quota (default: 20 calls/day, set AI_DAILY_QUOTA_PER_USER to override)
    const userId: string = req.user.claims.sub;
    if (!checkAndIncrementAiQuota(userId)) {
      return res.status(429).json({
        message: "Daily AI insight limit reached. Come back tomorrow!",
      });
    }

    const sessions = await storage.getActivitySessions(userId);
    if (sessions.length < 3) {
      return res.json([{ insight: "Not enough data yet. Log more activities!", type: "neutral" }]);
    }
    try {
      const recentSessions = sessions.slice(0, 50).map(s => ({
        category: s.category?.name,
        durationMinutes: s.durationMinutes,
        date: s.date,
      }));
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a productivity AI. Analyze the user's activity sessions and provide 3 short insights (under 15 words each) about their behavior, trends, or motivation. Return JSON in this format: { insights: [{ insight: 'string', type: 'positive' | 'negative' | 'neutral' }] }" },
          { role: "user", content: JSON.stringify(recentSessions) },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(response.choices[0].message?.content || '{"insights":[]}');
      res.json(parsed.insights || []);
    } catch (e) {
      // Log the error server-side but never expose it to the client
      console.error("[ai-insights] OpenAI call failed:", (e as Error)?.message ?? "unknown");
      res.json([{ insight: "Keep up the good work!", type: "positive" }]);
    }
  });

  // ─── Stripe Billing Routes ────────────────────────────────────────────────────
  // STRIPE_SECRET_KEY is server-only — all these routes run server-side only.

  /** POST /api/billing/checkout — Create a Stripe Checkout Session */
  app.post("/api/billing/checkout", isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured (STRIPE_SECRET_KEY missing)" });
    }
    const userId: string = req.user.claims.sub;
    const userRecord = await storage.getUser(userId);

    let customerId: string | undefined = userRecord?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRecord?.email ?? undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await storage.updateStripeCustomer(userId, customerId);
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return res.status(503).json({ message: "Stripe price not configured (STRIPE_PRICE_ID missing)" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.protocol}://${req.get("host")}/?upgraded=true`,
      cancel_url: `${req.protocol}://${req.get("host")}/`,
      subscription_data: { metadata: { userId } },
      metadata: { userId },
    });

    res.json({ url: session.url });
  });

  /** POST /api/billing/portal — Open Stripe Customer Portal */
  app.post("/api/billing/portal", isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured (STRIPE_SECRET_KEY missing)" });
    }
    const userId: string = req.user.claims.sub;
    const userRecord = await storage.getUser(userId);

    if (!userRecord?.stripeCustomerId) {
      return res.status(404).json({ message: "No billing account found. Please subscribe first." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userRecord.stripeCustomerId,
      return_url: `${req.protocol}://${req.get("host")}/`,
    });

    res.json({ url: portalSession.url });
  });

  /**
   * POST /api/billing/webhook — Stripe webhook handler
   * Uses raw body for signature verification — MUST be registered before any
   * body-parsing middleware touches this path (bodyParser.raw is used).
   */
  app.post(
    "/api/billing/webhook",
    (req: any, res: any, next: any) => {
      // Parse raw body for Stripe signature verification
      let rawBody = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { rawBody += chunk; });
      req.on("end", () => { req.rawBody = rawBody; next(); });
    },
    async (req: any, res: any) => {
      if (!stripe) {
        return res.status(503).json({ message: "Stripe not configured" });
      }
      const signature = req.headers["stripe-signature"];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!signature || !webhookSecret) {
        return res.status(400).json({ error: "Missing stripe-signature or webhook secret" });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
      } catch (e) {
        console.error("[webhook] Stripe signature verification failed:", (e as Error).message);
        return res.status(400).json({ error: "Invalid signature" });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          if (userId && session.subscription) {
            await storage.updateSubscription(userId, {
              tier: "premium",
              subscriptionStatus: "active",
              subscriptionStartDate: new Date(),
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
            });
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          const isActive = sub.status === "active" || sub.status === "trialing";
          if (userId) {
            await storage.updateSubscription(userId, {
              tier: isActive ? "premium" : "free",
              subscriptionStatus: isActive ? "active" : sub.status,
              stripeSubscriptionId: sub.id,
            });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          if (userId) {
            await storage.updateSubscription(userId, {
              tier: "free",
              subscriptionStatus: "canceled",
              subscriptionEndDate: new Date(),
              stripeSubscriptionId: null,
            });
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          if (customerId) {
            await storage.updateSubscriptionByCustomer(customerId, { subscriptionStatus: "inactive" });
          }
          break;
        }
        default:
          break;
      }

      res.json({ received: true });
    }
  );

  return httpServer;
}
