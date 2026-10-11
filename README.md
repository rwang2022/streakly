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

## Migration 10: bound activity duration

Run `supabase/migration_10_duration_bound.sql`. Adds a CHECK constraint
so `duration_minutes` on `activities` has to be between 0 and 1000 (or
NULL, since it's an optional field) — closes the same
client-side-only-limit gap as migration 5's `logged_at` guard.

## Migration 11: manual mod flags

Run `supabase/migration_11_manual_flags.sql`. Adds a `manual_flags`
table so an admin (`is_admin = true`, see Migration 9) can flag someone
as suspicious directly from their profile page, independent of the
automatic heuristic in `lib/fraud.ts`. Same -100 penalty and badge as an
algorithmic flag, but a friend/admin vouch never clears it — only an
admin removing the flag does. See "Suspicious activity detection" below.

## Migration 12: room lookup lockdown (security fix)

Run `supabase/migration_12_room_lookup_lockdown.sql`. Closes a real hole:
`rooms` had been readable by *anyone* — including fully unauthenticated
requests hitting Supabase's REST API directly, no app or login required
— since migration 2. That meant every room's name and invite code (a
join token — whoever has it can join the room and see members' activity)
could be dumped from the whole table in one request, bypassing the
"shared via a link" model entirely.

This locks `rooms` SELECT down to members only, and moves the
join-by-code lookup (used by both `/join/<code>` and the "enter a code"
box on the Rooms page) to a `SECURITY DEFINER` function,
`get_room_by_invite_code`, that returns just `(id, name)` for the one
matching room — never the invite_code itself, never any other room.
**Run this one even if you don't care about the other migrations.**

## Migration 13: flag timers + admin activity deletion

Run `supabase/migration_13_flag_timer_and_admin_delete.sql`. Two
independent additions:

1. `manual_flags.expires_at` (nullable) — a manual flag (Migration 11)
   can now be given a duration instead of only ever being permanent.
   Set it when flagging someone, or change it later with "Edit time" on
   an already-flagged profile. `NULL` still means permanent. Once
   `expires_at` passes, the flag stops counting toward the -100 penalty
   automatically — `lib/moderation.ts`'s `getManualFlags()` filters
   expired rows out at the query level, so nothing else in the app needs
   to know or check.
2. A new `activities` DELETE policy letting an admin (`is_admin = true`)
   remove a single fraudulent entry from *anyone's* history, not just
   their own. Shows up as a small trash-can button on each activity row
   on a profile page, admin-only. This is a scalpel next to the -100
   penalty's sledgehammer — useful when only one or two logged entries
   are actually fake and the rest of someone's history is legit.

## Migration 14: admin retroactive activity entry

Run `supabase/migration_14_admin_retroactive_activity.sql`. Lets an
admin (`is_admin = true`) log an activity for *any* user, backdated past
the normal 24-hour window everyone else is limited to — useful for
backfilling something someone forgot to log. Shows up as "Add activity
for them (admin)" on a profile page, right below the mod-flag button.

Two things had to change together for this to actually work, not just
the RLS policy: the `activities_logged_at_reasonable` CHECK constraint
(Migration 5) applies no matter who's inserting or what RLS let the
insert through, so it now has an `is_admin_user()` escape hatch too —
CHECK constraints can't hold a bare subquery the way RLS policies can,
hence the wrapper function instead of an inline `exists (...)`.

## Migration 15: Strong / Apple Health auto-logging (removed)

This tried to auto-log Strong workouts through Apple Health and an iOS
Shortcut, but Shortcuts can't read workouts from Apple Health, so it
never worked. The code is gone; the workout tracker (Migration 16)
replaces it. If you ran `migration_15_strong_integration.sql`, run
`migration_19_remove_strong_integration.sql` to drop what it added. If
you never ran 15, skip both.

## Migration 16: workout tracker (sets, reps, weight)

Run `supabase/migration_16_workout_sets.sql`. Adds a workout
logger (sets, reps and weight, like the Strong app) at `/workout` (linked from the top of the Log page):
start a workout, add exercises, fill in weight and reps per set, then
Finish. The "Previous" column shows what you did for that exercise last
time; tap it to copy those numbers in.

A finished workout is still one ordinary Gym activity (duration = time
from Start to Finish), so streaks, scoring and the existing guardrails
all apply unchanged. The detail lives in a new `workout_sets` table,
saved together with the activity in one transaction by the
`log_workout()` function, and deleted with it. History shows the
breakdown under each workout.

The exercise list (`src/data/exercises.json`, 753 exercises with their
equipment) comes from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db),
which is public domain (Unlicense). Stretches, images and instructions
are left out. To refresh it, download that repo's `dist/exercises.json`
and run `node scripts/build-exercises.mjs path/to/exercises.json`.

An in-progress workout is kept in the browser's localStorage, so
closing the app mid-workout doesn't lose it.

## Migration 17: rest timer notifications

Run `supabase/migration_17_rest_timers.sql`. Ticking off a set in the
workout tracker starts a rest countdown (default 1:30, adjustable,
remembered per device). With the app open it chimes when rest is over;
with the phone locked, `/api/rest-timer` sends a push notification.

That push needs the same setup as the daily reminder (VAPID keys and
`SUPABASE_SERVICE_ROLE_KEY`, see "Push notifications" below), and the
person has to tap **Turn on** in the workout screen. On iPhone that only
works from the Home Screen app. Turning it on there doesn't turn on the
daily reminder (that's the `daily_reminder` flag from migration 18).

The route waits out the rest inside the function (`after()` with
`maxDuration = 300`), so rests are capped at 4:45. That relies on
Vercel's Fluid compute (on by default for new projects), which allows
300s on the Hobby plan. A `rest_timers` row per person makes sure a
skipped or replaced rest never sends a stale notification.

## Migration 18: choose the daily reminder time

Run `supabase/migration_18_reminder_time.sql`, then set up the hourly
schedule (step 7 of "Push notifications" below). Adds `reminder_hour`,
`daily_reminder` and `last_reminded_on` to `push_subscriptions`. The
reminder job now runs hourly and only nudges devices whose chosen local
hour it is, at most once per local day. Turning the reminder off keeps
the device subscribed, so workout rest alerts keep working.

## Migration 20: import history from Strong

Run `supabase/migration_20_strong_import.sql`. **Settings → Import from
Strong** reads the CSV that Strong exports (Settings → Export Strong
Data) in the browser (`src/lib/strongImport.ts`), groups its rows into
workouts, and saves them through `import_workouts()`.

Imported workouts are history only: they appear in History (tagged
"Imported from Strong", not on the heatmap) and feed the workout
tracker's "Previous" numbers, but they live in `imported_workouts`, not
`activities`, so they never count toward streak, score or the
leaderboard. That keeps the 24-hour backdating guard meaningful.
Re-importing the same file skips workouts already imported. Strong's
exercise names ("Bench Press (Barbell)") are kept as-is and show under
"Your exercises" in the exercise picker.

The migration also adds `workout_sets.performed_at` (backfilled from each
workout's date) so "Previous" sorts by when sets were done, and lets a
set belong to either an activity or an imported workout.

## Migration 21: workout templates

Run `supabase/migration_21_workout_templates.sql`. Adds
`workout_templates`: a name plus a list of exercises with a set count
each, like Strong's templates. Weights and reps aren't stored; starting a
template gives empty sets and the "Previous" column fills in last time's
numbers as usual. Templates are private to their owner.

- **Save as template**: during a workout (below Add exercise), or under
  any past or imported workout in History (expand its exercises). It's
  named after the workout, or "Workout Oct 9" if it has no name.
- **Start, rename, delete**: listed under "Templates" on `/workout`
  before a workout starts.
- **Repeat**: under a past or imported workout in History, starts a new
  workout with the same exercises and set counts. This part needs no
  migration.

## Short logs don't count toward the streak

No migration needed — this is pure application logic in
`lib/scoring.ts`'s `countsTowardStreak()`. Any activity explicitly
logged at 5 minutes or under (creatine, chia seeds, a vitamin — quick
things worth having a record of, but not a workout) is still saved and
still shows up in the activity list/history, it just doesn't light up
its day on the heatmap or count toward streak, consistency, or volume.
Leaving duration blank is unaffected — that still gets the default
20-minute credit it always has. `history/page.tsx` and
`profile/[id]/page.tsx` build their calendar heatmaps with the same
filter so a day never shows "active" there while the real streak
calculation silently skipped it.

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

On top of the heuristic, an admin can also flag someone directly — for
judgment calls the pattern-matching can't see (someone admits to fudging
a log, say). This shows the same "🚨 Busted" badge and -100 penalty, but
lives in a separate `manual_flags` table (Migration 11) and is *not*
cleared by anyone vouching, admin or otherwise — vouches only ever
address the algorithmic side. Only an admin removing the flag (the same
button toggles back to "Flag as suspicious") lifts a manual flag. If
someone is flagged both ways at once, vouching clears the algorithmic
half but the manual flag alone keeps the penalty in place.

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

**6. Redeploy.**

**7. Run the job every hour.** Each person picks their own reminder time
(migration 18), so the job has to run hourly, but **Vercel's Hobby plan
caps its cron at once per day**. Supabase's free pg_cron does it instead:
enable the `pg_cron` and `pg_net` extensions (Database → Extensions), put
your `CRON_SECRET` into `supabase/hourly_reminders_cron.sql`, and run it
in the SQL editor. The once-a-day Vercel cron in `vercel.json` is left
in place; it's harmless, since a device is never reminded twice in a day.

Once set up, anyone can turn reminders on/off and pick the hour from
**Settings → Daily reminder** (default 8 PM, in their own timezone).

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

