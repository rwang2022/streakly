-- Streakly schema: profiles, friendships, activities, RLS policies

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friend check (requester_id <> addressee_id),
  constraint unique_pair unique (requester_id, addressee_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('gym', 'hike', 'walk', 'run', 'other')),
  duration_minutes integer,
  note text,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists activities_user_logged_idx on public.activities (user_id, logged_at desc);
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- Auto-create a profile row when a new auth user signs up (Google OAuth etc).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: are two users friends (accepted, either direction)?
create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.activities enable row level security;

-- Profiles: any signed-in user can look up basic profile info (needed for
-- username search / add-friend flow). Only the owner can write their row.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Friendships: visible to the two parties involved.
create policy "friendships visible to participants"
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "users can send friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester_id);

create policy "participants can update friendship status"
  on public.friendships for update
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "participants can delete a friendship"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Activities: owner has full access; friends can read (for leaderboard/history).
create policy "users manage their own activities"
  on public.activities for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "friends can read each other's activities"
  on public.activities for select
  to authenticated
  using (public.is_friend(auth.uid(), user_id));
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
