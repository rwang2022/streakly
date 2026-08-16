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

- Apple Health / Google Fit auto-import
- Native App Store build via Capacitor (reuses this same codebase)
- Per-user personalized push send time (needs a paid Vercel tier — see
  the Push notifications section below for why Hobby can't do this)

## Updating an already-deployed project (rooms feature)

If you already ran the original `schema.sql`, don't re-run the whole file —
`create policy` will error on things that already exist. Instead, run
`supabase/migration_2_rooms.sql` in the SQL editor. It adds the `rooms` and
`room_memberships` tables plus the RLS policies that let roommates see each
other's activity, without touching anything you already have.

New here:
- **Rooms** — create a room from the Leaderboard page (gear icon top right),
  share its invite code or link, and everyone who joins shows up on that
  room's leaderboard together. No pairwise friending needed.
- **Friend/roommate profiles** — tapping anyone on the leaderboard (other
  than yourself) opens their 30-day activity history.
- Leaderboard rows now clearly label the score vs. the streak, and there's
  an (i) icon that explains the scoring formula on hover/tap.

## Migration 3: fix room lookup for signed-out visitors

If you already ran migration 2 and hit "Invite not found" on a join link
that should work (especially the very first time someone opens it before
signing in), run `supabase/migration_3_public_room_lookup.sql`. The original
policy only let logged-in requests read the `rooms` table, so a fresh
(signed-out) tap on a join link was silently shown zero rows by RLS —
indistinguishable from the room not existing. This opens read access to
room name/id (not membership or activity data) to anyone, which is what a
join-by-link flow needs.

## Migration 4: leave/delete rooms

Adds the missing DELETE policy so a room's creator can delete it (leaving,
for non-creators, already worked via the existing membership policy). Run
`supabase/migration_4_room_delete.sql` if you're on an existing deployment.

## What's new in this pass

- **Leave / delete rooms** from the Rooms page — non-creators get "Leave
  room," the creator gets "Delete room" (tap twice to confirm either).
- **Score-tier badges** replace the old top-3-only medals — every row gets
  a small badge (🐐 GOAT, 🔥 Locked in, 💪 Grinding, 🌱 Getting there, 😅
  Rusty) based on their own score, not just their rank.
- **Slacking is louder** — inactive (3+ days) rows get a distinct amber
  tint, a faded avatar, and a 👻 MIA badge instead of quietly greyed-out
  text.
- **Bottom nav fixed on iOS** — added `viewport-fit=cover` so the safe-area
  inset actually resolves, plus extra padding so the nav isn't flush
  against the home indicator.
- **Faster-feeling navigation** — added skeleton loading states for
  Dashboard, Leaderboard, History, and Profile so switching screens shows
  something instantly instead of a blank flash.

## Migration 5: close the activity backdating exploit

RLS only ever checked *ownership* of an activity row, never whether its
`logged_at` timestamp was plausible — anyone calling Supabase's REST API
directly (dev tools, curl, a script using their own session) could insert
an activity dated whenever they wanted and inflate their streak/consistency
score. Run `supabase/migration_5_activity_date_guard.sql`: it adds a
Postgres CHECK constraint restricting `logged_at` to `now() - 24h` through
`now() + 5min`, enforced by the database itself regardless of how the
insert request arrives. Added `not valid` so it doesn't choke on old rows
— see the file for an example query to find/clean up existing bad data.

Also fixed in this pass: server components run in UTC on Vercel regardless
of the visiting person's real timezone, which was silently shifting which
calendar day an activity landed on (especially in the evening, US
timezones). `layout.tsx` now captures the browser's IANA timezone on load
into a `streakly-tz` cookie, which `getRequestTimeZone()` reads server-side
and threads through all day-bucketing logic (`lib/date.ts`, `lib/scoring.ts`,
history/profile heatmaps).

## Migration 6: rate-limit activity inserts

Run `supabase/migration_6_rate_limit.sql`. A before-insert trigger rejects
a new activity if the user already has 12+ logged in the last 24 hours —
real defense-in-depth on top of the fraud heuristic below, enforced at the
database level so it can't be bypassed by calling the API directly.

## Migration 7: friend vouches

Run `supabase/migration_7_vouches.sql`. Adds `activity_vouches` — see
"Suspicious activity detection" below for what this is for.

## Migration 8: push notification subscriptions

Run `supabase/migration_8_push_subscriptions.sql`. Adds
`push_subscriptions`, needed only if you set up push reminders (see
below) — the app works fine without it.

## Migration 9: admin-only vouch clearing

Run `supabase/migration_9_admin_vouches.sql`. Adds `is_admin` to
`profiles` — see "Suspicious activity detection" below for what this
changes.

After running it, mark your own account as admin. First find your user
id in the Supabase SQL editor:

```sql
select id, username, display_name from public.profiles;
```

Then, with that id:

```sql
update public.profiles set is_admin = true where id = '<your-user-id>';
```

## Suspicious activity detection

`lib/fraud.ts` flags two patterns that look like gamed data rather than
genuine logging:

1. A long run of consecutive days logged at the *exact same* high
   duration (e.g. "300 min" five days straight) — real durations vary,
   identical repeats don't.
2. A burst of many activities all *created* within a short window,
   regardless of what dates they claim to be logged on — someone
   rapid-firing the log button to backfill a bunch of entries at once.

A flagged account gets a flat **-100** applied to their score (deliberately
uncapped, so it can go negative and actually sink their rank, not just
reset them to a new-user baseline) and a "🚨 Busted" badge on the
leaderboard. This is a heuristic, not proof — any friend or roommate
(never the flagged person themselves) can vouch on that person's profile
page that it's real, and every vouch is shown/credited by name as social
support. But only a vouch from an admin account (`is_admin = true`)
actually clears the penalty (badge changes to "🤝 Vouched") for 7 days —
see Migration 9 above for how to make yourself an admin. The flag itself
stays visible either way; only the punishment is what an admin's vouch
lifts.

## Streak freezes

One missed day per rolling 7-day window doesn't break a streak — same idea
as Duolingo. The missed day itself still doesn't count toward the streak
*number*, it just doesn't reset the chain. Shows as a small ❄️ wherever the
streak is displayed. See `lib/scoring.ts` (`FREEZE_WINDOW_DAYS`) if you
want to tune this.

## Push notifications (optional)

A daily "you haven't logged today" reminder, sent via Web Push. Entirely
optional — everything else in the app works without it.

**1. Run migration 8** (above) if you haven't.

**2. Generate a VAPID key pair** (used to sign push messages so browsers
trust they came from your server, not just anyone):

```
npx web-push generate-vapid-keys
```

**3. Get your Supabase service-role key.** In Supabase: **Project Settings
→ API → service_role secret**. This is different from the anon key you
already have — it bypasses row-level security, which the reminder cron
job legitimately needs (it has to check *every* subscribed user's
activity, not just one signed-in person's). Never expose this key to the
browser; it only ever belongs in a server-side env var.

**4. Generate a cron secret** — any random string works, e.g.:

```
openssl rand -hex 32
```

**5. Add these env vars in Vercel** (Project Settings → Environment
Variables — not just `.env.local`, since the cron job runs on Vercel's
infrastructure, not your machine):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the "Public Key" from step 2 |
| `VAPID_PRIVATE_KEY` | the "Private Key" from step 2 |
| `VAPID_SUBJECT` | `mailto:you@example.com` (any contact, required by the push spec) |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key from step 3 |
| `CRON_SECRET` | the random string from step 4 |

Vercel automatically sends `CRON_SECRET` as a bearer token on cron-invoked
requests once it's set — no extra config needed for that part.

**6. Redeploy.** `vercel.json` already defines the schedule:

```json
{ "schedule": "0 1 * * *" }
```

That's 1am UTC daily — roughly 8-9pm US Eastern, 5-6pm US Pacific,
depending on daylight saving. **Vercel's Hobby plan caps any single cron
job at once per day** (a paid tier is required to run more often), so this
one fixed UTC time is checked for everyone regardless of their own
timezone — it can't personalize send time per person the way a proper
notification system would on a paid plan. Adjust the hour in `vercel.json`
if 1am UTC lands at an awkward time for your friend group.

Once set up, anyone can turn reminders on/off from **Settings → Daily
reminder**.

## Testing

```
npm test
```

Runs the vitest suite covering `lib/scoring.ts` and `lib/fraud.ts` — the
two most consequential pieces of pure logic in the app (they decide
everyone's score and who gets penalized), so they're the ones worth
having a safety net around.

## Settings: data export & delete

Both live under **Settings**. Export downloads a JSON file of your profile,
activities, and friendships. Delete wipes your activities, friendships,
room memberships, and any rooms you created, then signs you out — it
deliberately leaves your account/profile row itself intact (so signing
back in doesn't break), which makes it a data wipe rather than full account
deletion. Full account deletion would need Supabase's admin API and a
service-role key, which this app doesn't otherwise require.

## What's new in this pass

A big one — most of it prompted by "what would actually make this app
succeed," not a single bug report:

- **Tests** — `npm test` now covers the scoring and fraud-detection logic
- **Streak freezes** — one missed day/week no longer kills a streak
- **Rate limiting** — a hard per-day cap on activity inserts, enforced by
  Postgres (migration 6)
- **Vouching** — friends can clear a wrongly-flagged "sus" penalty instead
  of it being a one-way, unappealable -100 (migration 7)
- **Data export & delete** — see above
- **Offline page** — a real fallback instead of a blank screen with no
  connection
- **Weekly recap** — a dashboard card comparing this week against friends
- **Push reminders** — optional, see the Push notifications section above
- Also: the room-scoped leaderboard now remembers which room you were on
  when you tap into a friend's profile and go back (previously always
  dropped you to the Friends tab); the #1 leaderboard spot gets a subtle
  gold glow; the browser tab favicon now actually matches the app icon
  instead of the default Next.js placeholder; the log-activity page now
  surfaces insert errors instead of silently claiming success when a save
  is rejected (e.g. by the rate limit or date-sanity check).

