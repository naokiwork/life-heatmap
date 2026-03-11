import { db } from "./db";
import { categories, activitySessions, goals, type InsertCategory, type InsertActivitySession, type InsertGoal } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, desc, gte, sql } from "drizzle-orm";

export interface IStorage {
  getCategories(userId: string): Promise<typeof categories.$inferSelect[]>;
  createCategory(category: InsertCategory): Promise<typeof categories.$inferSelect>;
  deleteCategory(id: number, userId: string): Promise<void>;

  getActivitySessions(userId: string): Promise<any[]>;
  createActivitySession(session: InsertActivitySession): Promise<typeof activitySessions.$inferSelect>;

  getGoals(userId: string): Promise<any[]>;
  createGoal(goal: InsertGoal): Promise<typeof goals.$inferSelect>;
  deleteGoal(id: number, userId: string): Promise<void>;

  // Tier tracking
  getUserTier(userId: string): Promise<'free' | 'premium'>;
  canCreateCategory(userId: string): Promise<boolean>;
  getCategoryCount(userId: string): Promise<number>;

  // Analytics
  getWeeklyAnalytics(userId: string): Promise<any[]>;
  getDailyAnalytics(userId: string, days: number): Promise<any[]>;
  getCategoryBreakdown(userId: string): Promise<any[]>;

  // Leaderboard
  getLeaderboard(): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  async getCategories(userId: string) {
    return await db.select().from(categories).where(eq(categories.userId, userId));
  }

  async createCategory(category: InsertCategory) {
    const [created] = await db.insert(categories).values(category).returning();
    return created;
  }

  async deleteCategory(id: number, userId: string) {
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }

  async getActivitySessions(userId: string) {
    const sessions = await db.select({
      session: activitySessions,
      category: categories,
    })
      .from(activitySessions)
      .leftJoin(categories, eq(activitySessions.categoryId, categories.id))
      .where(eq(activitySessions.userId, userId))
      .orderBy(desc(activitySessions.startTime));

    return sessions.map(s => ({ ...s.session, category: s.category }));
  }

  async createActivitySession(session: InsertActivitySession) {
    const [created] = await db.insert(activitySessions).values(session).returning();
    return created;
  }

  async getGoals(userId: string) {
    const rows = await db.select({
      goal: goals,
      category: categories,
    })
      .from(goals)
      .leftJoin(categories, eq(goals.categoryId, categories.id))
      .where(eq(goals.userId, userId))
      .orderBy(desc(goals.createdAt));

    // Compute progress for each goal
    const result = await Promise.all(rows.map(async (row) => {
      let actualMinutesQuery = db.select({ total: sql<number>`COALESCE(SUM(duration_minutes), 0)` })
        .from(activitySessions)
        .where(eq(activitySessions.userId, userId));

      if (row.goal.categoryId) {
        actualMinutesQuery = db.select({ total: sql<number>`COALESCE(SUM(duration_minutes), 0)` })
          .from(activitySessions)
          .where(and(
            eq(activitySessions.userId, userId),
            eq(activitySessions.categoryId, row.goal.categoryId)
          ));
      }

      // If deadline set, only count sessions since goal creation
      const [{ total }] = await actualMinutesQuery;

      return {
        ...row.goal,
        category: row.category,
        actualMinutes: Number(total) || 0,
        progress: Math.min(100, Math.round((Number(total) / row.goal.targetMinutes) * 100)),
      };
    }));

    return result;
  }

  async createGoal(goal: InsertGoal) {
    const [created] = await db.insert(goals).values(goal).returning();
    return created;
  }

  async deleteGoal(id: number, userId: string) {
    await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  }

  async getUserTier(userId: string): Promise<'free' | 'premium'> {
    const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId));
    return (user?.tier as 'free' | 'premium') || 'free';
  }

  async getCategoryCount(userId: string): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(eq(categories.userId, userId));
    return Number(count) || 0;
  }

  async canCreateCategory(userId: string): Promise<boolean> {
    const tier = await this.getUserTier(userId);
    if (tier === 'premium') return true;
    const count = await this.getCategoryCount(userId);
    return count < 5;
  }

  // Analytics: last N weeks, grouped by week and category
  async getWeeklyAnalytics(userId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 28);

    const rows = await db.select({
      session: activitySessions,
      category: categories,
    })
      .from(activitySessions)
      .leftJoin(categories, eq(activitySessions.categoryId, categories.id))
      .where(and(
        eq(activitySessions.userId, userId),
        gte(activitySessions.startTime, since)
      ))
      .orderBy(activitySessions.date);

    // Group by week number and category
    const weekMap: Record<string, Record<string, number>> = {};
    rows.forEach(({ session, category }) => {
      const d = new Date(session.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      const catName = category?.name || 'Unknown';
      if (!weekMap[weekKey]) weekMap[weekKey] = {};
      weekMap[weekKey][catName] = (weekMap[weekKey][catName] || 0) + session.durationMinutes;
    });

    return Object.entries(weekMap).map(([week, cats]) => ({
      week,
      ...Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round(v / 60 * 10) / 10]))
    }));
  }

  // Analytics: daily totals last N days
  async getDailyAnalytics(userId: string, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db.select({
      date: activitySessions.date,
      total: sql<number>`SUM(duration_minutes)`,
    })
      .from(activitySessions)
      .where(and(eq(activitySessions.userId, userId), gte(activitySessions.startTime, since)))
      .groupBy(activitySessions.date)
      .orderBy(activitySessions.date);

    // Fill in missing days with 0
    const result: { date: string; hours: number }[] = [];
    for (let i = days; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = rows.find(r => r.date === dateStr);
      result.push({ date: dateStr, hours: found ? Math.round(Number(found.total) / 60 * 10) / 10 : 0 });
    }
    return result;
  }

  // Analytics: all-time category breakdown
  async getCategoryBreakdown(userId: string) {
    const rows = await db.select({
      categoryName: categories.name,
      color: categories.color,
      totalMinutes: sql<number>`SUM(duration_minutes)`,
    })
      .from(activitySessions)
      .leftJoin(categories, eq(activitySessions.categoryId, categories.id))
      .where(eq(activitySessions.userId, userId))
      .groupBy(categories.name, categories.color);

    return rows.map(r => ({
      name: r.categoryName,
      color: r.color,
      hours: Math.round(Number(r.totalMinutes) / 60 * 10) / 10,
    }));
  }

  // Leaderboard: top users by total hours in last 30 days
  async getLeaderboard() {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const rows = await db.select({
      userId: activitySessions.userId,
      totalMinutes: sql<number>`SUM(duration_minutes)`,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
    })
      .from(activitySessions)
      .leftJoin(users, eq(activitySessions.userId, users.id))
      .where(gte(activitySessions.startTime, since))
      .groupBy(activitySessions.userId, users.firstName, users.lastName, users.profileImageUrl)
      .orderBy(desc(sql`SUM(duration_minutes)`))
      .limit(10);

    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: `${r.firstName || 'User'} ${r.lastName ? r.lastName[0] + '.' : ''}`.trim(),
      profileImageUrl: r.profileImageUrl,
      hours: Math.round(Number(r.totalMinutes) / 60 * 10) / 10,
      score: Math.round(Number(r.totalMinutes) * 1.5),
    }));
  }
}

export const storage = new DatabaseStorage();
