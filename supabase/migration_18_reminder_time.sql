-- Migration 18: let each person pick when their daily reminder arrives.
--
-- Until now /api/cron/reminders ran once a day at a fixed UTC hour
-- (Vercel's Hobby plan caps its own cron at once per day). Now it runs
-- every hour and only nudges the people whose chosen local hour it is.
-- The hourly trigger comes from Supabase itself (pg_cron + pg_net, both
-- free), set up separately in supabase/hourly_reminders_cron.sql.
--
-- Run this in the Supabase SQL editor on top of the earlier migrations.

-- Local hour (0-23, in the subscription's time_zone) to send at.
alter table public.push_subscriptions
  add column if not exists reminder_hour smallint not null default 20
  check (reminder_hour between 0 and 23);

-- A device can have push turned on just for workout rest alerts
-- (migration 17) without wanting the daily nudge too.
alter table public.push_subscriptions
  add column if not exists daily_reminder boolean not null default true;

-- Local date of the last reminder sent, so a second run in the same hour
-- (a retry, or both schedulers firing) never sends twice in a day.
alter table public.push_subscriptions
  add column if not exists last_reminded_on date;
