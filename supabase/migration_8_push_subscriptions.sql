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
