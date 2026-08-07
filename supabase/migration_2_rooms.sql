-- Migration 2: Rooms (group leaderboards without pairwise friending).
-- Run this in the Supabase SQL editor on top of the original schema.sql.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_memberships (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_memberships_user_idx on public.room_memberships (user_id);
create index if not exists room_memberships_room_idx on public.room_memberships (room_id);

-- Helper: do two users share at least one room?
create or replace function public.share_room(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.room_memberships m1
    join public.room_memberships m2 on m1.room_id = m2.room_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- Helper: is a user a member of a given room?
create or replace function public.is_room_member(uid uuid, rid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_memberships
    where user_id = uid and room_id = rid
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_memberships enable row level security;

-- Rooms: readable by any authenticated user (needed so a join-by-code page
-- can preview the room name before the user has joined). Nothing sensitive
-- lives on this table.
create policy "rooms are readable by authenticated users"
  on public.rooms for select
  to authenticated
  using (true);

create policy "users can create rooms"
  on public.rooms for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Memberships: visible to other members of the same room (so the app can
-- render room rosters/leaderboards), and to the user's own rows.
create policy "memberships visible to roommates"
  on public.room_memberships for select
  to authenticated
  using (
    user_id = auth.uid() or public.is_room_member(auth.uid(), room_id)
  );

create policy "users can join a room"
  on public.room_memberships for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can leave a room"
  on public.room_memberships for delete
  to authenticated
  using (user_id = auth.uid());

-- Extend activity visibility: roommates can read each other's activities,
-- same as accepted friends already can.
create policy "roommates can read each other's activities"
  on public.activities for select
  to authenticated
  using (public.share_room(auth.uid(), user_id));
