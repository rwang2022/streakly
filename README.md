# Streakly

A friends-only fitness accountability app: log workouts, get a consistency-weighted
score, and see who's actually showing up on a shared leaderboard.

Sign-in is Google-only (via Supabase Auth) to keep friction near zero — no
passwords. After first sign-in you pick a unique `@username`, which is how
friends find and add you (no invite links needed).

## Stack

- Next.js 16 (App Router) + Tailwind CSS v4 — installable as a PWA on
  iOS/Android home screens, no Apple Developer fee required.
- Supabase — Auth (Google OAuth), Postgres, and row-level security.

## 1. Create a Supabase project

1. Go to https://supabase.com, create a new project.
2. In **Project Settings → API**, copy the `Project URL` and `anon public` key.
3. In the SQL editor, run the contents of `supabase/schema.sql` — this
   creates the `profiles`, `friendships`, and `activities` tables, an
   auto-profile trigger, and all row-level security policies.

## 2. Enable Google sign-in

1. In Supabase: **Authentication → Providers → Google** → enable it.
2. Create OAuth credentials in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Application type: **Web application**
   - Authorized redirect URI: the callback URL Supabase shows you on the
     Google provider settings page (looks like
     `https://<project-ref>.supabase.co/auth/v1/callback`)
3. Paste the Google Client ID and Client Secret into Supabase's Google
   provider settings and save.
4. In **Authentication → URL Configuration**, add your app's URL (e.g.
   `http://localhost:3000` for local dev, and your production URL later) to
   the redirect allow list.

## 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the two values from
step 1:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
```

## 4. Run it

```
npm install
npm run dev
```

Visit http://localhost:3000. On a phone, open the deployed URL in Safari
(iOS) or Chrome (Android) and use "Add to Home Screen" to install it like a
native app.

## Deploying

Push to a GitHub repo and import it into [Vercel](https://vercel.com) (free
tier is fine) — add the same two env vars in the Vercel project settings.
Once deployed, add the production URL to Supabase's redirect allow list
(step 2.4) or Google sign-in will fail in production.

## How scoring works

See `src/lib/scoring.ts`. Score is 0–100, weighted so consistency dominates:

```
score = 0.7 × consistency_pct + 0.2 × streak_component + 0.1 × volume_component
```

- `consistency_pct`: % of the last 30 days with at least one logged activity.
- `streak_component`: current daily streak, capped at 30 days.
- `volume_component`: total minutes logged in the last 30 days, capped at
  ~20 min/day average — a small nudge, not a way to buy rank.

Anyone with no activity in 3+ days is flagged "slacking" on the leaderboard.

## Security notes

- All auth (password-less, Google OAuth only) is handled by Supabase.
- Postgres row-level security ensures you can only read/write your own
  activity data, plus read (not write) an accepted friend's activity data
  for the leaderboard. No cross-friend-group data leakage.
- Friend requests require mutual acceptance — no one sees your data until
  you accept them.
- Usernames are the only public-ish surface (needed so friends can find each
  other); activity logs, notes, and scores are never exposed outside your
  accepted friends.

## What's next (v2 ideas)

- Streak freezes (1 grace day/week)
- Push notification reminders
- Apple Health / Google Fit auto-import
- Native App Store build via Capacitor (reuses this same codebase)
