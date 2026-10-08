-- Migration 16: Strong-style strength logging — exercises, sets, weight, reps.
--
-- A workout is still one ordinary `activities` row (type 'gym'), so the
-- streak, score, leaderboard, rate limit and logged_at guard all keep
-- working exactly as before with no changes. This only adds the detail
-- underneath it: one `workout_sets` row per set, hanging off that
-- activity and deleted along with it.
--
-- Exercises come from Free Exercise DB (bundled client-side in
-- src/data/exercises.json), so there's no exercises table: a set stores
-- the exercise's id from that list plus its name at the time. Custom
-- exercises someone types in themselves just have a null exercise_id.
-- "What did I lift last time" is looked up by exercise_name.
--
-- Run this in the Supabase SQL editor on top of the earlier migrations.

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text,
  exercise_name text not null check (char_length(exercise_name) between 1 and 120),
  -- Order of the exercise within the workout, then of the set within it.
  exercise_position integer not null check (exercise_position between 0 and 100),
  set_number integer not null check (set_number between 1 and 100),
  weight numeric(6, 2) check (weight >= 0 and weight <= 2000),
  reps integer check (reps >= 0 and reps <= 1000),
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  created_at timestamptz not null default now()
);

create index if not exists workout_sets_activity_idx
  on public.workout_sets (activity_id);
create index if not exists workout_sets_user_exercise_idx
  on public.workout_sets (user_id, exercise_name, created_at desc);

alter table public.workout_sets enable row level security;

-- Owner has full access, but only to sets on their own activities — so
-- nobody can hang sets off someone else's workout.
create policy "users manage their own workout sets"
  on public.workout_sets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.user_id = auth.uid()
    )
  );

-- Same visibility as the activities themselves (schema.sql, migration 2).
create policy "friends can read each other's workout sets"
  on public.workout_sets for select
  to authenticated
  using (public.is_friend(auth.uid(), user_id));

create policy "roommates can read each other's workout sets"
  on public.workout_sets for select
  to authenticated
  using (public.share_room(auth.uid(), user_id));

-- Saves a finished workout in one transaction: the activities row plus
-- every set. Two separate inserts from the browser could leave a workout
-- logged with its sets missing if the second one failed.
--
-- security invoker, so RLS, the logged_at CHECK (migration 5), the daily
-- rate limit (migration 6) and the duration bound (migration 10) all
-- apply exactly as they do to a hand-logged activity.
create or replace function public.log_workout(
  p_started_at timestamptz,
  p_duration_minutes integer,
  p_note text,
  p_sets jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_activity_id uuid;
  s jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) > 500 then
    raise exception 'Invalid sets';
  end if;

  insert into public.activities (user_id, type, duration_minutes, note, logged_at)
  values (auth.uid(), 'gym', p_duration_minutes, nullif(trim(p_note), ''), p_started_at)
  returning id into new_activity_id;

  for s in select * from jsonb_array_elements(p_sets)
  loop
    insert into public.workout_sets (
      activity_id, user_id, exercise_id, exercise_name,
      exercise_position, set_number, weight, reps, unit
    ) values (
      new_activity_id,
      auth.uid(),
      nullif(s->>'exercise_id', ''),
      s->>'exercise_name',
      (s->>'exercise_position')::integer,
      (s->>'set_number')::integer,
      (s->>'weight')::numeric,
      (s->>'reps')::integer,
      coalesce(s->>'unit', 'lb')
    );
  end loop;

  return new_activity_id;
end;
$$;

grant execute on function public.log_workout(timestamptz, integer, text, jsonb) to authenticated;
