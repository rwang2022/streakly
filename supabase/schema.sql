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
create policy "rooms are readable by anyone"
  on public.rooms for select
  to public
  using (true);

create policy "users can create rooms"
  on public.rooms for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "creator can delete their room"
  on public.rooms for delete
  to authenticated
  using (auth.uid() = created_by);

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
-- Migration 6: rate-limit activity inserts at the database level.
-- 12/day is deliberately generous — only ever blocks genuine spam.

create or replace function public.enforce_activity_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.activities
  where user_id = new.user_id
    and created_at >= now() - interval '24 hours';

  if recent_count >= 12 then
    raise exception 'Too many activities logged in the last 24 hours. Try again later.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists activities_rate_limit on public.activities;
create trigger activities_rate_limit
  before insert on public.activities
  for each row execute procedure public.enforce_activity_rate_limit();
-- Migration 7: friends/roommates can vouch to clear a suspicious flag.

create table if not exists public.activity_vouches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vouched_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint no_self_vouch check (user_id <> vouched_by),
  constraint unique_voucher_per_user unique (user_id, vouched_by)
);

create index if not exists activity_vouches_user_idx on public.activity_vouches (user_id);

alter table public.activity_vouches enable row level security;

create policy "vouches visible to the people involved"
  on public.activity_vouches for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = vouched_by
    or public.is_friend(auth.uid(), user_id)
    or public.share_room(auth.uid(), user_id)
  );

create policy "friends or roommates can vouch"
  on public.activity_vouches for insert
  to authenticated
  with check (
    auth.uid() = vouched_by
    and auth.uid() <> user_id
    and (public.is_friend(auth.uid(), user_id) or public.share_room(auth.uid(), user_id))
  );

create policy "a voucher can update their own vouch"
  on public.activity_vouches for update
  to authenticated
  using (auth.uid() = vouched_by)
  with check (auth.uid() = vouched_by);

create policy "a voucher can retract their own vouch"
  on public.activity_vouches for delete
  to authenticated
  using (auth.uid() = vouched_by);

-- Migration 8: web push subscriptions, for the "you haven't logged today"
-- reminder (see /api/cron/reminders and README.md for the full setup —
-- this table alone doesn't send anything, it just stores where to send).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- IANA zone (e.g. "America/New_York"), captured client-side at
  -- subscribe time — same source as the streakly-tz cookie. Needed so the
  -- cron job can tell what "today" means for each person without a live
  -- request from their browser.
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Purely private per-user data — no one else ever needs to read it. The
-- daily reminder job itself runs with the service-role key server-side
-- (see /api/cron/reminders), which bypasses RLS entirely, so no policy
-- is needed to grant it access.
create policy "users manage their own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migration 9: only an admin's vouch actually clears a suspicious-activity
-- penalty. Anyone can still vouch (migration_7's RLS above already lets any
-- friend/roommate insert a row, unchanged) — that stays visible on the
-- flagged person's profile as social support, credited by name. But the
-- -100 penalty only lifts once the admin specifically has vouched;
-- everyone else's vouch alone no longer clears it. See lib/vouches.ts.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Migration 10: bound duration_minutes to a sane range (0-1000, NULL
-- still allowed for the optional field) — same client-side-only-limit
-- problem as migration 5's logged_at guard, closed the same way with a
-- database-level CHECK. See migration_10_duration_bound.sql.

alter table public.activities
  add constraint activities_duration_reasonable
  check (
    duration_minutes is null
    or (duration_minutes >= 0 and duration_minutes <= 1000)
  ) not valid;

-- Migration 11: let an admin manually flag someone as suspicious — a
-- persistent, single-row-per-user flag separate from (and not clearable
-- by) the friend-vouch system. See migration_11_manual_flags.sql for the
-- full rationale.

create table if not exists public.manual_flags (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  flagged_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint no_self_flag check (user_id <> flagged_by)
);

alter table public.manual_flags enable row level security;

create policy "flags visible to the people involved"
  on public.manual_flags for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = flagged_by
    or public.is_friend(auth.uid(), user_id)
    or public.share_room(auth.uid(), user_id)
  );

create policy "admins can flag"
  on public.manual_flags for insert
  to authenticated
  with check (
    auth.uid() = flagged_by
    and auth.uid() <> user_id
    and exists (
      select 1 from public.profiles where id = auth.uid() and is_admin
    )
  );

create policy "admins can update a flag"
  on public.manual_flags for update
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

create policy "admins can remove a flag"
  on public.manual_flags for delete
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- Migration 12: stop leaking every room (name + invite code) to anyone,
-- including unauthenticated requests hitting the REST API directly. See
-- migration_12_room_lookup_lockdown.sql for the full rationale.

drop policy if exists "rooms are readable by anyone" on public.rooms;

create policy "rooms are readable by members"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(auth.uid(), id));

create or replace function public.get_room_by_invite_code(code text)
returns table (id uuid, name text)
language sql
stable
security definer set search_path = public
as $$
  select r.id, r.name
  from public.rooms r
  where r.invite_code = code;
$$;

grant execute on function public.get_room_by_invite_code(text) to anon, authenticated;
