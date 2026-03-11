# Life Heatmap

A productivity tracking app that visualizes your daily effort as a GitHub-style contribution heatmap. Track activities, build streaks, and share your life stats on social media.

## Architecture

**Stack:** Express backend + React (Vite) frontend on the same port (5000)

- **Frontend:** React, Wouter routing, TanStack Query, Tailwind, Recharts, Framer Motion
- **Backend:** Express, Drizzle ORM, PostgreSQL
- **Auth:** Replit Auth (OIDC)
- **AI:** OpenAI via Replit AI Integrations

## Key Features

- GitHub-style life heatmap (180-day view)
- Activity Timer with circular UI
- Streak tracking
- Shareable Life Card for social media

### Premium Features (tier gating)
- AI Insights (OpenAI-powered productivity analysis)
- Analytics charts (weekly bar, daily line, category pie — Recharts)
- Goal tracking (set targets, track progress with progress bars)
- Leaderboard (top users by hours in last 30 days)
- Unlimited categories (free tier: 5 max)

## Database Schema

- `users` — auth + subscription tier fields (`tier`, `subscriptionStatus`, `subscriptionStartDate`, `subscriptionEndDate`)
- `sessions` — Replit Auth session store
- `categories` — user-defined activity categories (name, color)
- `activity_sessions` — logged work sessions (categoryId, startTime, endTime, durationMinutes, date)
- `goals` — premium goal tracking (name, categoryId, targetMinutes, deadline)

## Tier System

- **Free:** 5 categories max, heatmap, timer, share card
- **Premium:** Unlimited categories, AI insights, analytics, goals, leaderboard
- Tier is stored on `users.tier` ('free' | 'premium')
- Backend returns HTTP 402 with `{ upgrade_required: true }` for gated endpoints
- Frontend shows Crown icon upgrade prompts at natural breaking points

## Project Structure

```
client/src/
  pages/          dashboard, categories, logger, share, analytics, goals, leaderboard, landing
  hooks/          use-auth, use-categories, use-activities, use-goals, use-analytics, use-insights
  components/     layout (sidebar nav), heatmap
server/
  routes.ts       all API routes
  storage.ts      DatabaseStorage class
  db.ts           Drizzle + pg pool
  replit_integrations/auth/  Replit Auth setup
shared/
  schema.ts       Drizzle tables + Zod schemas
  routes.ts       API contract types
  models/auth.ts  users + sessions tables
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI via Replit integrations
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI base URL via Replit integrations
- `REPL_ID`, `ISSUER_URL` — Replit Auth OIDC config
