-- ─────────────────────────────────────────────────────────────────────────────
-- Life Heatmap — Supabase Schema
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dqzmljdcgeizwtzcsoic/sql/new
--
-- Includes:
--   1. Table definitions (matching existing Drizzle schema)
--   2. Row Level Security (RLS) policies
--   3. SQL functions for analytics (called via supabase.rpc())
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────
create table if not exists users (
  id                     varchar primary key,
  email                  varchar unique,
  first_name             varchar,
  last_name              varchar,
  profile_image_url      varchar,
  tier                   varchar not null default 'free',
  subscription_status    varchar not null default 'inactive',
  subscription_start_date timestamptz,
  subscription_end_date  timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ─── Sessions (only needed for Express dev; not used in Worker) ───────────────
create table if not exists sessions (
  sid    varchar primary key,
  sess   jsonb not null,
  expire timestamptz not null
);
create index if not exists idx_session_expire on sessions(expire);

-- ─── Categories ───────────────────────────────────────────────────────────────
create table if not exists categories (
  id      serial primary key,
  user_id varchar not null references users(id) on delete cascade,
  name    text not null,
  color   text not null
);

-- ─── Activity Sessions ────────────────────────────────────────────────────────
create table if not exists activity_sessions (
  id               serial primary key,
  user_id          varchar not null references users(id) on delete cascade,
  category_id      integer not null references categories(id) on delete restrict,
  start_time       timestamptz not null,
  end_time         timestamptz not null,
  duration_minutes integer not null,
  date             date not null
);

-- ─── Goals ───────────────────────────────────────────────────────────────────
create table if not exists goals (
  id             serial primary key,
  user_id        varchar not null references users(id) on delete cascade,
  name           text not null,
  category_id    integer references categories(id) on delete set null,
  target_minutes integer not null,
  deadline       timestamptz,
  created_at     timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- The Worker uses the service role key which BYPASSES RLS.
-- RLS provides a defence-in-depth layer if the anon key is ever used.
-- ─────────────────────────────────────────────────────────────────────────────

alter table users             enable row level security;
alter table categories        enable row level security;
alter table activity_sessions enable row level security;
alter table goals             enable row level security;

-- Users: can only read/update their own row
create policy "users_select_own" on users for select using (auth.uid()::text = id);
create policy "users_update_own" on users for update using (auth.uid()::text = id);

-- Categories: users own their categories
create policy "categories_select_own" on categories for select using (auth.uid()::text = user_id);
create policy "categories_insert_own" on categories for insert with check (auth.uid()::text = user_id);
create policy "categories_delete_own" on categories for delete using (auth.uid()::text = user_id);

-- Activity sessions
create policy "sessions_select_own" on activity_sessions for select using (auth.uid()::text = user_id);
create policy "sessions_insert_own" on activity_sessions for insert with check (auth.uid()::text = user_id);

-- Goals
create policy "goals_select_own" on goals for select using (auth.uid()::text = user_id);
create policy "goals_insert_own" on goals for insert with check (auth.uid()::text = user_id);
create policy "goals_delete_own" on goals for delete using (auth.uid()::text = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SQL FUNCTIONS (called via supabase.rpc() from the Worker)
-- Using SECURITY DEFINER so they run as the DB owner, bypassing RLS.
-- The Worker already enforces auth before calling these.
-- ─────────────────────────────────────────────────────────────────────────────

-- Weekly analytics: hours per category per week for last 4 weeks
create or replace function get_weekly_analytics(p_user_id varchar)
returns jsonb
language sql
security definer
as $$
  with raw as (
    select
      date_trunc('week', a.date::timestamptz) as week_start,
      c.name as category_name,
      sum(a.duration_minutes) as total_minutes
    from activity_sessions a
    left join categories c on a.category_id = c.id
    where a.user_id = p_user_id
      and a.start_time >= now() - interval '28 days'
    group by week_start, c.name
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'week', to_char(week_start, 'YYYY-MM-DD'),
      'category', category_name,
      'hours', round((total_minutes / 60.0)::numeric, 1)
    )
  ), '[]'::jsonb)
  from raw;
$$;

-- Daily analytics: total hours per day for last N days
create or replace function get_daily_analytics(p_user_id varchar, p_days integer)
returns jsonb
language sql
security definer
as $$
  with days as (
    select generate_series(
      (now() - (p_days || ' days')::interval)::date,
      now()::date,
      '1 day'::interval
    )::date as day
  ),
  agg as (
    select date, sum(duration_minutes) as total_minutes
    from activity_sessions
    where user_id = p_user_id
      and start_time >= now() - (p_days || ' days')::interval
    group by date
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'hours', coalesce(round((a.total_minutes / 60.0)::numeric, 1), 0)
    ) order by d.day
  ), '[]'::jsonb)
  from days d
  left join agg a on a.date = d.day;
$$;

-- Category breakdown: all-time hours per category
create or replace function get_category_breakdown(p_user_id varchar)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', c.name,
      'color', c.color,
      'hours', round((sum(a.duration_minutes) / 60.0)::numeric, 1)
    )
  ), '[]'::jsonb)
  from activity_sessions a
  left join categories c on a.category_id = c.id
  where a.user_id = p_user_id
  group by c.name, c.color;
$$;

-- Leaderboard: top 10 users by hours in last 30 days
create or replace function get_leaderboard()
returns jsonb
language sql
security definer
as $$
  with ranked as (
    select
      a.user_id,
      u.first_name,
      u.last_name,
      u.profile_image_url,
      sum(a.duration_minutes) as total_minutes,
      rank() over (order by sum(a.duration_minutes) desc) as rank
    from activity_sessions a
    left join users u on a.user_id = u.id
    where a.start_time >= now() - interval '30 days'
    group by a.user_id, u.first_name, u.last_name, u.profile_image_url
    limit 10
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', rank,
      'userId', user_id,
      'name', trim(coalesce(first_name, 'User') || ' ' || coalesce(left(last_name, 1) || '.', '')),
      'profileImageUrl', profile_image_url,
      'hours', round((total_minutes / 60.0)::numeric, 1),
      'score', round((total_minutes * 1.5)::numeric)
    ) order by rank
  ), '[]'::jsonb)
  from ranked;
$$;
