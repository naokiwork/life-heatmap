import { db } from "./db";
import { categories, activitySessions, type InsertCategory, type InsertActivitySession } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getCategories(userId: string): Promise<typeof categories.$inferSelect[]>;
  createCategory(category: InsertCategory): Promise<typeof categories.$inferSelect>;
  deleteCategory(id: number, userId: string): Promise<void>;
  
  getActivitySessions(userId: string): Promise<any[]>;
  createActivitySession(session: InsertActivitySession): Promise<typeof activitySessions.$inferSelect>;

  // Tier tracking
  getUserTier(userId: string): Promise<'free' | 'premium'>;
  canCreateCategory(userId: string): Promise<boolean>;
  getCategoryCount(userId: string): Promise<number>;
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

    return sessions.map(s => ({
      ...s.session,
      category: s.category
    }));
  }

  async createActivitySession(session: InsertActivitySession) {
    const [created] = await db.insert(activitySessions).values(session).returning();
    return created;
  }

  async getUserTier(userId: string): Promise<'free' | 'premium'> {
    const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId));
    return (user?.tier as 'free' | 'premium') || 'free';
  }

  async getCategoryCount(userId: string): Promise<number> {
    const result = await db.select({ count: db.sql<number>`count(*)`.mapWith(Number) })
      .from(categories)
      .where(eq(categories.userId, userId));
    return result[0]?.count || 0;
  }

  async canCreateCategory(userId: string): Promise<boolean> {
    const tier = await this.getUserTier(userId);
    if (tier === 'premium') return true;
    
    const count = await this.getCategoryCount(userId);
    return count < 5; // Free tier limit: 5 categories
  }
}

export const storage = new DatabaseStorage();
