-- Migration 7: let friends vouch for someone flagged as "suspicious",
-- clearing the -100 penalty without silently hiding that it happened.
--
-- The fraud heuristic in lib/fraud.ts is just a heuristic — it can flag a
-- genuinely consistent person (an athlete who really does train the same
-- way every day, someone catching up on a backlog of real workouts in one
-- sitting). Rather than a one-way, unappealable penalty, any friend or
-- roommate (not the flagged person themselves) can vouch that it's real.
-- One vouch is enough — this app runs on trust between people who already
-- know each other, not adversarial moderation.

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

-- Visible to the vouched person, the voucher, and anyone who'd be able to
-- see the vouched person's activity in the first place (friends/roommates)
-- — the leaderboard/profile computation runs as the *viewer*, and needs to
-- be able to check whether the person being scored has a valid vouch.
create policy "vouches visible to the people involved"
  on public.activity_vouches for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = vouched_by
    or public.is_friend(auth.uid(), user_id)
    or public.share_room(auth.uid(), user_id)
  );

-- Only a friend or roommate can vouch, and only for someone else — never
-- for yourself.
create policy "friends or roommates can vouch"
  on public.activity_vouches for insert
  to authenticated
  with check (
    auth.uid() = vouched_by
    and auth.uid() <> user_id
    and (public.is_friend(auth.uid(), user_id) or public.share_room(auth.uid(), user_id))
  );

-- Re-vouching (e.g. the vouch aged out and the pattern is still flagged)
-- should refresh the timestamp rather than error on the unique constraint.
create policy "a voucher can update their own vouch"
  on public.activity_vouches for update
  to authenticated
  using (auth.uid() = vouched_by)
  with check (auth.uid() = vouched_by);

-- A voucher can retract their own vouch.
create policy "a voucher can retract their own vouch"
  on public.activity_vouches for delete
  to authenticated
  using (auth.uid() = vouched_by);
