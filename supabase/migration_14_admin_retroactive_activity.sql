-- Migration 14: let an admin add an activity for *any* user, backdated
-- beyond the normal 24-hour window regular users are limited to.
--
-- Two separate gates had to give, not just one:
--
-- 1. RLS: "users manage their own activities" (for all, using/with check
--    auth.uid() = user_id) only ever let someone insert a row for
--    themselves. This adds a new, additive INSERT policy for admins that
--    doesn't touch that one — permissive RLS policies OR together, so an
--    admin's insert for someone else now matches the new policy even
--    though it fails the owner-only one.
--
-- 2. The activities_logged_at_reasonable CHECK constraint (migration 5)
--    requires logged_at to be within 5 minutes future / 24 hours past —
--    that's a table-level constraint, so it applies no matter who's
--    inserting or what RLS policy let the insert through. It has to be
--    relaxed too, or an admin's backdated insert would still get
--    rejected by the database itself.
--
--    CHECK constraints can't contain a bare subquery (`select ... from
--    profiles`), unlike RLS policies — Postgres just doesn't allow it.
--    So the admin check has to be wrapped in a function first
--    (is_admin_user below), same trick already used for is_friend() and
--    share_room() elsewhere in this schema, just applied to a constraint
--    instead of a policy.

create or replace function public.is_admin_user(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

alter table public.activities drop constraint if exists activities_logged_at_reasonable;
alter table public.activities
  add constraint activities_logged_at_reasonable
  check (
    (logged_at <= now() + interval '5 minutes' and logged_at >= now() - interval '24 hours')
    or public.is_admin_user(auth.uid())
  ) not valid;

create policy "admins can add activities for any user"
  on public.activities for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );
