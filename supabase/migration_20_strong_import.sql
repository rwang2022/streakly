-- Migration 20: import workout history from a Strong CSV export.
--
-- Imported workouts are history only. They show in History and feed the
-- workout tracker's "Previous" numbers, but they are NOT activities, so
-- they never count toward streak, score or the leaderboard. That keeps
-- the 24-hour backdating guard (migrations 5 and 14) intact: a made-up
-- CSV can't buy anyone a streak.
--
-- Shape:
--   imported_workouts  one row per imported session (date, name, length)
--   workout_sets       now hangs off EITHER an activity (logged in the
--                      app) OR an imported workout, never both
--   performed_at       when the set was actually done, so "Previous"
--                      sorts real dates rather than import time
--
-- Importing the same file twice is safe: each session has an
-- external_key (Strong's date + workout name), unique per person, and
-- import_workouts() skips ones already there.
--
-- Run this in the Supabase SQL editor on top of the earlier migrations.

create table if not exists public.imported_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'strong' check (source in ('strong')),
  external_key text not null check (char_length(external_key) <= 200),
  started_at timestamptz not null,
  name text check (char_length(name) <= 200),
  duration_minutes integer check (duration_minutes between 0 and 1000),
  created_at timestamptz not null default now(),
  unique (user_id, external_key)
);

create index if not exists imported_workouts_user_started_idx
  on public.imported_workouts (user_id, started_at desc);

alter table public.imported_workouts enable row level security;

create policy "users manage their own imported workouts"
  on public.imported_workouts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "friends can read each other's imported workouts"
  on public.imported_workouts for select
  to authenticated
  using (public.is_friend(auth.uid(), user_id));

create policy "roommates can read each other's imported workouts"
  on public.imported_workouts for select
  to authenticated
  using (public.share_room(auth.uid(), user_id));

-- workout_sets: allow a set to belong to an imported workout instead.
alter table public.workout_sets alter column activity_id drop not null;

alter table public.workout_sets
  add column if not exists imported_workout_id uuid
  references public.imported_workouts(id) on delete cascade;

alter table public.workout_sets
  add column if not exists performed_at timestamptz not null default now();

-- Sets saved before this migration: performed when their workout was.
update public.workout_sets ws
  set performed_at = a.logged_at
  from public.activities a
  where a.id = ws.activity_id;

alter table public.workout_sets drop constraint if exists workout_sets_one_parent;
alter table public.workout_sets
  add constraint workout_sets_one_parent
  check ((activity_id is null) <> (imported_workout_id is null));

create index if not exists workout_sets_imported_idx
  on public.workout_sets (imported_workout_id);
create index if not exists workout_sets_user_exercise_performed_idx
  on public.workout_sets (user_id, exercise_name, performed_at desc);

-- The owner policy from migration 16 only allowed sets under your own
-- activity; now your own imported workout qualifies too.
drop policy if exists "users manage their own workout sets" on public.workout_sets;
create policy "users manage their own workout sets"
  on public.workout_sets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.activities a
        where a.id = activity_id and a.user_id = auth.uid()
      )
      or exists (
        select 1 from public.imported_workouts w
        where w.id = imported_workout_id and w.user_id = auth.uid()
      )
    )
  );

-- log_workout() (migration 16) now also stamps performed_at.
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
      exercise_position, set_number, weight, reps, unit, performed_at
    ) values (
      new_activity_id,
      auth.uid(),
      nullif(s->>'exercise_id', ''),
      s->>'exercise_name',
      (s->>'exercise_position')::integer,
      (s->>'set_number')::integer,
      (s->>'weight')::numeric,
      (s->>'reps')::integer,
      coalesce(s->>'unit', 'lb'),
      p_started_at
    );
  end loop;

  return new_activity_id;
end;
$$;

-- Saves a batch of imported workouts (each with its sets) in one
-- transaction, skipping any already imported. Returns how many were new.
-- security invoker: RLS and every table CHECK apply as usual.
create or replace function public.import_workouts(p_workouts jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  w jsonb;
  s jsonb;
  new_id uuid;
  added integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if jsonb_typeof(p_workouts) <> 'array' or jsonb_array_length(p_workouts) > 100 then
    raise exception 'Invalid workouts';
  end if;

  for w in select * from jsonb_array_elements(p_workouts)
  loop
    if jsonb_array_length(w->'sets') > 500 then
      raise exception 'Too many sets in one workout';
    end if;

    insert into public.imported_workouts (user_id, source, external_key, started_at, name, duration_minutes)
    values (
      auth.uid(),
      'strong',
      w->>'external_key',
      (w->>'started_at')::timestamptz,
      nullif(trim(w->>'name'), ''),
      (w->>'duration_minutes')::integer
    )
    on conflict (user_id, external_key) do nothing
    returning id into new_id;

    continue when new_id is null;
    added := added + 1;

    for s in select * from jsonb_array_elements(w->'sets')
    loop
      insert into public.workout_sets (
        imported_workout_id, user_id, exercise_id, exercise_name,
        exercise_position, set_number, weight, reps, unit, performed_at
      ) values (
        new_id,
        auth.uid(),
        null,
        s->>'exercise_name',
        (s->>'exercise_position')::integer,
        (s->>'set_number')::integer,
        (s->>'weight')::numeric,
        (s->>'reps')::integer,
        coalesce(s->>'unit', 'lb'),
        (w->>'started_at')::timestamptz
      );
    end loop;
  end loop;

  return added;
end;
$$;

grant execute on function public.import_workouts(jsonb) to authenticated;
