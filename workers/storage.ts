/**
 * storage.ts (Worker)
 *
 * All database operations via Supabase JS client (uses PostgREST REST API
 * — no TCP/Node.js required, works natively in Cloudflare Workers).
 *
 * The SUPABASE_SERVICE_ROLE_KEY is a server-only secret.
 * It is bound via `wrangler secret put` and never exposed to the client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(
  supabase: SupabaseClient,
  userId: string,
  payload: { name: string; color: string }
) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: payload.name, color: payload.color })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(
  supabase: SupabaseClient,
  id: number,
  userId: string
) {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getCategoryCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

// ─── Activity Sessions ────────────────────────────────────────────────────────

export async function getActivitySessions(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*, category:categories(*)")
    .eq("user_id", userId)
    .order("start_time", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createActivitySession(
  supabase: SupabaseClient,
  userId: string,
  payload: {
    categoryId: number;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    date: string;
  }
) {
  const { data, error } = await supabase
    .from("activity_sessions")
    .insert({
      user_id: userId,
      category_id: payload.categoryId,
      start_time: payload.startTime,
      end_time: payload.endTime,
      duration_minutes: payload.durationMinutes,
      date: payload.date,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function getGoals(supabase: SupabaseClient, userId: string) {
  const { data: rows, error } = await supabase
    .from("goals")
    .select("*, category:categories(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Compute actual progress for each goal
  const goals = await Promise.all(
    (rows ?? []).map(async (goal: any) => {
      let query = supabase
        .from("activity_sessions")
        .select("duration_minutes")
        .eq("user_id", userId);

      if (goal.category_id) {
        query = query.eq("category_id", goal.category_id);
      }

      const { data: sessions } = await query;
      const actualMinutes = (sessions ?? []).reduce(
        (sum: number, s: any) => sum + (s.duration_minutes ?? 0),
        0
      );

      return {
        ...goal,
        actualMinutes,
        progress: Math.min(100, Math.round((actualMinutes / goal.target_minutes) * 100)),
      };
    })
  );

  return goals;
}

export async function createGoal(
  supabase: SupabaseClient,
  userId: string,
  payload: {
    name: string;
    categoryId?: number | null;
    targetMinutes: number;
    deadline?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      name: payload.name,
      category_id: payload.categoryId ?? null,
      target_minutes: payload.targetMinutes,
      deadline: payload.deadline ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(supabase: SupabaseClient, id: number, userId: string) {
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Tier ────────────────────────────────────────────────────────────────────

export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<"free" | "premium"> {
  const { data, error } = await supabase
    .from("users")
    .select("tier")
    .eq("id", userId)
    .single();
  if (error) return "free";
  return (data?.tier as "free" | "premium") ?? "free";
}

export async function canCreateCategory(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const tier = await getUserTier(supabase, userId);
  if (tier === "premium") return true;
  const count = await getCategoryCount(supabase, userId);
  return count < 5;
}

// ─── Analytics (uses Supabase RPC for GROUP BY queries) ──────────────────────

export async function getWeeklyAnalytics(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("get_weekly_analytics", { p_user_id: userId });
  if (error) throw error;
  return data ?? [];
}

export async function getDailyAnalytics(supabase: SupabaseClient, userId: string, days: number) {
  const { data, error } = await supabase.rpc("get_daily_analytics", { p_user_id: userId, p_days: days });
  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBreakdown(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("get_category_breakdown", { p_user_id: userId });
  if (error) throw error;
  return data ?? [];
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export async function getLeaderboard(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("get_leaderboard");
  if (error) throw error;
  return data ?? [];
}

// ─── User upsert ─────────────────────────────────────────────────────────────

export async function getUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}
