import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./replit_integrations/auth/replitAuth";
import { registerAuthRoutes } from "./replit_integrations/auth/routes";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Endpoint to check user's tier status
  app.get("/api/tier", isAuthenticated, async (req: any, res) => {
    const tier = await storage.getUserTier(req.user.claims.sub);
    const categoryCount = await storage.getCategoryCount(req.user.claims.sub);
    res.json({ tier, categoryCount, categoryLimit: tier === 'premium' ? null : 5 });
  });

  app.get(api.categories.list.path, isAuthenticated, async (req: any, res) => {
    const categories = await storage.getCategories(req.user.claims.sub);
    res.json(categories);
  });

  app.post(api.categories.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const input = api.categories.create.input.parse(req.body);
      
      // Check tier limit
      const canCreate = await storage.canCreateCategory(req.user.claims.sub);
      if (!canCreate) {
        return res.status(402).json({
          message: "Category limit reached. Upgrade to Premium for unlimited categories.",
          upgrade_required: true,
          tier: "premium"
        });
      }
      
      const category = await storage.createCategory({ ...input, userId: req.user.claims.sub });
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.categories.delete.path, isAuthenticated, async (req: any, res) => {
    await storage.deleteCategory(Number(req.params.id), req.user.claims.sub);
    res.status(204).send();
  });

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

      const session = await storage.createActivitySession({
        ...input,
        userId: req.user.claims.sub,
        date: dateStr,
      });
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.insights.get.path, isAuthenticated, async (req: any, res) => {
    const tier = await storage.getUserTier(req.user.claims.sub);
    
    // AI Insights is a premium-only feature
    if (tier !== 'premium') {
      return res.status(402).json({
        message: "AI Insights are available in Premium. Upgrade to unlock deeper productivity analysis.",
        upgrade_required: true,
        tier: "premium"
      });
    }

    const sessions = await storage.getActivitySessions(req.user.claims.sub);
    if (sessions.length < 3) {
      return res.json([
        { insight: "Not enough data yet. Log more activities!", type: "neutral" }
      ]);
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
          { role: "user", content: JSON.stringify(recentSessions) }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(response.choices[0].message?.content || '{"insights":[]}');
      res.json(parsed.insights || []);
    } catch (e) {
      console.error(e);
      res.json([
        { insight: "Keep up the good work!", type: "positive" }
      ]);
    }
  });

  return httpServer;
}
