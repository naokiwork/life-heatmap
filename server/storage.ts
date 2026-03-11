import { db } from "./db";
import { categories, activitySessions, type InsertCategory, type InsertActivitySession } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getCategories(userId: string): Promise<typeof categories.$inferSelect[]>;
  createCategory(category: InsertCategory): Promise<typeof categories.$inferSelect>;
  deleteCategory(id: number, userId: string): Promise<void>;
  
  getActivitySessions(userId: string): Promise<any[]>;
  createActivitySession(session: InsertActivitySession): Promise<typeof activitySessions.$inferSelect>;
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
}

export const storage = new DatabaseStorage();
