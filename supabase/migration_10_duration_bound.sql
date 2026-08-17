-- Migration 10: bound duration_minutes to a sane range.
--
-- The Log activity form has always let duration be left blank (an
-- optional field), but never actually constrained the number itself —
-- the input had no min/max, and the insert just passed whatever was
-- typed straight through. That's a client-side-only limit: same story as
-- migration 5's logged_at guard, anyone hitting Supabase's REST API
-- directly could insert a negative duration or something absurd like
-- 999999 minutes, which would then feed into the score/consistency math.
--
-- 1000 minutes (~16.5 hours) is comfortably above any real single
-- workout, so this only ever blocks garbage/typo'd input, not a long
-- hike or an all-day event. NULL (left blank) is still allowed.
--
-- Added NOT VALID so it doesn't choke on any existing out-of-range rows
-- — it only applies going forward. Existing bad rows still need to be
-- cleaned up manually (see the DELETE example below).

alter table public.activities
  add constraint activities_duration_reasonable
  check (
    duration_minutes is null
    or (duration_minutes >= 0 and duration_minutes <= 1000)
  ) not valid;

-- Example: find/remove out-of-range rows once you've identified them:
-- delete from public.activities
--   where duration_minutes < 0 or duration_minutes > 1000;
