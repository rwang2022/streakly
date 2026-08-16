-- Migration 9: only an admin's vouch actually clears a suspicious-activity
-- penalty. Anyone can still vouch (migration_7's RLS already lets any
-- friend/roommate insert a row, unchanged here) — that stays visible on
-- the flagged person's profile as social support, credited by name. But
-- the -100 penalty only lifts once the admin specifically has vouched;
-- everyone else's vouch alone no longer clears it. See lib/vouches.ts.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- After running this, mark your own account as admin. Find your user id
-- first (run this and look for your row by username/display_name):
--   select id, username, display_name from public.profiles;
-- Then, with that id:
--   update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000000';
