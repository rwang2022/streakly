-- Migration 21: saved workout templates ("Push day", "Legs", ...).
--
-- A template is just a named list of exercises with a set count each,
-- like Strong's. Starting one fills a new workout with those exercises
-- and empty set rows; the "Previous" column (migration 16) supplies last
-- time's numbers, so weights and reps aren't stored here.
--
-- Templates are private: no friend or roommate read policies.
--
-- `exercises` is a JSON array of
--   { "exercise_id": text|null, "exercise_name": text,
--     "equipment": text|null, "sets": 1-20 }
-- shaped by src/lib/workout.ts (planFromDraft / planFromSets).
--
-- ("Repeat" on a past workout in History needs no migration: it reads
-- that workout's sets straight from workout_sets.)
--
-- Run this in the Supabase SQL editor on top of the earlier migrations.

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  exercises jsonb not null check (
    jsonb_typeof(exercises) = 'array'
    and jsonb_array_length(exercises) between 1 and 50
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_templates_user_idx
  on public.workout_templates (user_id, updated_at desc);

alter table public.workout_templates enable row level security;

create policy "users manage their own workout templates"
  on public.workout_templates for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
