-- Migration 5: close the backdating exploit.
--
-- Row-level security only ever checked *ownership* of a row
-- (auth.uid() = user_id), never whether logged_at was a plausible value.
-- The app's UI never exposes a date picker (it always logs "now"), but
-- that's a client-side-only restriction — anyone calling Supabase's REST
-- API directly (dev tools, curl, a script using their own session) could
-- insert an activity with logged_at set to any date at all, past or
-- future, and inflate their streak/consistency score.
--
-- A CHECK constraint is enforced by Postgres itself on every insert AND
-- update, regardless of how the request reaches the database — the app's
-- UI can't be bypassed at the data layer the way it can be at the
-- JavaScript layer.
--
-- Added NOT VALID so it doesn't choke on existing rows (like old test
-- data) — it only applies going forward. Existing bad rows still need to
-- be cleaned up manually (see the DELETE example below).

alter table public.activities
  add constraint activities_logged_at_reasonable
  check (
    logged_at <= now() + interval '5 minutes'
    and logged_at >= now() - interval '24 hours'
  ) not valid;

-- Example: find/remove a specific user's out-of-window rows once you've
-- identified them (replace the UUID with the actual user_id from
-- Table Editor):
-- delete from public.activities
--   where user_id = '00000000-0000-0000-0000-000000000000'
--   and (logged_at > now() or logged_at < now() - interval '24 hours');
