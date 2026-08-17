-- Migration 11: let an admin manually flag someone as suspicious.
--
-- Until now the only way to get flagged was the automatic heuristic in
-- lib/fraud.ts (identical-duration streaks, logging bursts) — there was
-- no way for a mod to flag someone based on judgment calls the heuristic
-- can't see (e.g. someone admits to fudging a log, or a pattern that's
-- obviously gamed but doesn't happen to trip either detector). This adds
-- that as a first-class, persistent flag rather than routing it through
-- the friend-vouch system, which exists to *clear* algorithmic
-- false-positives, not to *create* new flags.
--
-- One row per user (user_id is the primary key, not a per-flagger log
-- like activity_vouches) — a manual flag is a single on/off moderation
-- state, not something that should accumulate multiple entries. Flagging
-- someone already flagged just updates who/why/when.
--
-- Same -100 penalty and "🚨 Busted" badge as an algorithmic flag (see
-- lib/leaderboard.ts / profile page), but a manual flag is NOT cleared by
-- a friend/admin vouch — vouches only ever clear the heuristic side.
-- Only an admin removing the flag lifts it. This is deliberate: a mod's
-- own judgment call shouldn't be overridable by the same
-- friends-vouch-for-each-other mechanism it was meant to route around.

create table if not exists public.manual_flags (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  flagged_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint no_self_flag check (user_id <> flagged_by)
);

alter table public.manual_flags enable row level security;

-- Same visibility model as activity_vouches: the people directly involved,
-- plus anyone who'd already see this person's suspicion badge on a shared
-- leaderboard (friends/roommates) — not a secret mod-only list.
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
