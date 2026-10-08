-- Migration 19: remove the Strong / Apple Health auto-logging (migration 15).
--
-- It never worked: iOS Shortcuts can't read workouts from Apple Health,
-- so there was no way to get a Strong workout out automatically. Strong-
-- style logging now lives in Streakly itself (migration 16, /workout),
-- and the app no longer reads or writes anything below.
--
-- Only run this if you ran migration 15. Activities that were auto-logged
-- stay; they just lose their 'strong' source tag. Ingest tokens are
-- deleted, which is the point: nothing accepts them any more.

drop table if exists public.integration_tokens;

drop index if exists public.activities_user_external_idx;

alter table public.activities drop column if exists external_id;
alter table public.activities drop column if exists source;
