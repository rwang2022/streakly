-- Runs the daily-reminder job every hour, from Supabase (free), so each
-- person's reminder can go out at their own chosen local hour (see
-- migration 18). Vercel's Hobby plan only allows its cron once a day.
--
-- Before running:
--   1. Database -> Extensions: enable pg_cron and pg_net.
--   2. Replace YOUR_CRON_SECRET below with the CRON_SECRET env var from
--      Vercel (and the URL, if the site has moved).
--
-- To stop it later:  select cron.unschedule('streakly-hourly-reminders');
-- Running this again with the same name replaces the existing schedule.

select cron.schedule(
  'streakly-hourly-reminders',
  '0 * * * *',
  $$
  select net.http_get(
    url := 'https://streakly.rwang.dev/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 30000
  );
  $$
);
