-- Migration 15: automatic activity logging from external sources — the
-- first being Strong (the iOS strength-training app) via Apple Health.
--
-- Strong has no API or webhooks; the only thing it exposes automatically
-- is what it writes to Apple Health. A one-time iOS Shortcut automation
-- ("when Strong is closed") reads the latest Health workout and POSTs it
-- to /api/integrations/strong with a per-user bearer token. That route
-- runs with the service-role key (no browser session, same as the cron
-- reminder route) and inserts an activities row on the user's behalf.
--
-- Two things this needs from the schema:
--
-- 1. A way to tell an auto-logged row apart from a hand-logged one, and a
--    stable per-workout key so the Shortcut firing repeatedly (it runs
--    every time you leave the app, not just after a workout) can't create
--    duplicates. -> activities.source + activities.external_id, with a
--    partial unique index on (user_id, external_id).
--
-- 2. Somewhere to keep the ingest tokens. Only the SHA-256 hash is stored
--    (the raw token is shown once, in Settings); the route hashes the
--    incoming bearer token and looks it up here. RLS mirrors
--    push_subscriptions (migration 8): purely private per-user rows, and
--    the service-role route bypasses RLS anyway.
--
-- Run this in the Supabase SQL editor on top of the earlier migrations.
--
-- Note: the activities_logged_at_reasonable CHECK (migration 5) is left
-- exactly as-is on purpose. Auto-logged workouts older than 24h are
-- rejected by that constraint, and the ingest route treats that as
-- "skip, not an error" rather than backdating around the guard — the
-- guard is what stops streak inflation and imported history would walk
-- straight through it.

alter table public.activities
  add column if not exists source text not null default 'manual';

alter table public.activities
  add column if not exists external_id text;

-- One activities row per external workout per user. Partial (external_id
-- is not null) so the millions of ordinary hand-logged rows are exempt.
create unique index if not exists activities_user_external_idx
  on public.activities (user_id, external_id)
  where external_id is not null;

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- SHA-256 hex of the raw token. The raw value is returned to the user
  -- exactly once (Settings -> Connect) and never persisted.
  token_hash text not null unique,
  label text not null default 'Apple Health',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists integration_tokens_user_idx
  on public.integration_tokens (user_id);

alter table public.integration_tokens enable row level security;

-- Private per-user data. The ingest route runs with the service-role key
-- (see src/lib/supabase/admin.ts), which bypasses RLS entirely, so this
-- policy only governs the Settings UI reading/creating/deleting a token.
create policy "users manage their own integration tokens"
  on public.integration_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
