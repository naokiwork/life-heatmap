import { pgTable, text, serial, integer, timestamp, date, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

export const activitySessions = pgTable("activity_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  date: date("date").notNull(),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  targetMinutes: integer("target_minutes").notNull(),
  deadline: timestamp("deadline"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export const insertActivitySessionSchema = createInsertSchema(activitySessions).omit({ id: true });
export type ActivitySession = typeof activitySessions.$inferSelect;
export type InsertActivitySession = z.infer<typeof insertActivitySessionSchema>;

export const insertGoalSchema = createInsertSchema(goals).omit({ id: true, createdAt: true });
export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
