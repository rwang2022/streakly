-- Migration 17: rest timer notifications for the workout tracker.
--
-- When you tick off a set, /workout starts a rest countdown and asks
-- /api/rest-timer to send a push notification when it runs out. That's
-- the only way to reach a locked phone: iOS suspends a Home Screen app's
-- JavaScript as soon as it's in the background, so a timer in the page
-- itself would never fire.
--
-- The route waits out the rest period and then sends the push, but only
-- if the timer it was started for is still the current one. This table
-- holds that "current timer" per person: starting a new rest, adding
-- 15 seconds, or tapping Skip replaces or deletes the row, so a stale
-- notification never buzzes you mid-set.
--
-- Only the API route touches it (with the service-role key, which
-- bypasses RLS), so RLS is on with no policies: nobody can read or write
-- it through the public API.
--
-- Run this in the Supabase SQL editor on top of the earlier migrations.

create table if not exists public.rest_timers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.rest_timers enable row level security;
