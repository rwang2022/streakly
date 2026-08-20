-- Migration 13: an optional expiry on manual mod flags, and letting an
-- admin delete another user's individual fraudulent activity entries.
--
-- 1. manual_flags.expires_at (nullable timestamptz). NULL means
--    permanent, same as before this migration. When set, the flag stops
--    counting toward isSuspicious once expires_at passes — see
--    lib/moderation.ts's getManualFlags(), which now filters on this in
--    the query itself rather than the app trusting every row it gets
--    back. An admin can set/extend/shorten this from the profile page
--    (ModFlagButton), same place the flag itself is created.
--
-- 2. A new DELETE policy on activities: until now, only the owner could
--    delete their own activity rows ("users manage their own activities",
--    for all). There was no way for an admin to remove a specific
--    fraudulent entry from someone else's history — the only tool was
--    the blunt -100 whole-account penalty. This adds a narrow, additive
--    policy (doesn't touch the existing owner policy) letting an admin
--    delete any single activity row.

alter table public.manual_flags
  add column if not exists expires_at timestamptz;

create policy "admins can delete any activity"
  on public.activities for delete
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );
