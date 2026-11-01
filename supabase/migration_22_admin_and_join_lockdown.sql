-- Migration 22: close two holes and two gaps found on a security re-audit.
-- Safe to run before the matching app deploy; nothing here breaks the
-- current app. Run migration 23 only AFTER the new app version is live.
--
-- 1. is_admin was user-editable. The profiles UPDATE policy ("users can
--    update their own profile") checks which ROW you update, never which
--    COLUMNS, and Supabase grants table-wide UPDATE to signed-in users by
--    default. So once migration 9 added is_admin, any signed-in user could
--    PATCH their own profile with {"is_admin": true} through the REST API
--    and get admin powers (delete anyone's activities, flag users, backdate
--    entries). Fix: swap the table-wide INSERT/UPDATE privileges for
--    column-level grants on only the columns the app writes. A column-level
--    REVOKE of is_admin alone would do nothing while table-wide UPDATE is
--    granted. The signup trigger (handle_new_user) is SECURITY DEFINER, so
--    it's unaffected, and admins are still set from the SQL editor.
--
-- 2. Creating a room couldn't read back its own new row. Migration 12 made
--    rooms readable by members only, but the creator only becomes a member
--    in the insert right after, and the app's insert(...).select() needs to
--    read the new row back, so Postgres rejected room creation. This lets a
--    creator read the rooms they created.
--
-- 3. Joining never checked the invite code. room_memberships' insert policy
--    only checked user_id = auth.uid(), so anyone who learned a room's id
--    (it appears in URLs like /leaderboard?room=<id>) could join without the
--    code. join_room_by_code() checks the code and inserts the membership in
--    one step. Migration 23 then removes direct joins.
--
-- 4. created_at was client-settable. The 12/day rate-limit trigger
--    (migration 6) and burst detection (lib/fraud.ts) both read created_at,
--    so backdating it on insert dodged both. A BEFORE INSERT trigger now
--    always stamps it with now().

-- 1. Column-level write access on profiles.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username, display_name, avatar_url) on public.profiles to authenticated;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;

-- 2. Creators can read the rooms they created.
drop policy if exists "creators can read their own rooms" on public.rooms;
create policy "creators can read their own rooms"
  on public.rooms for select
  to authenticated
  using (created_by = auth.uid());

-- 3. Join a room only with its invite code. Returns the room id, or NULL if
--    no room has that code. Joining twice is a no-op.
create or replace function public.join_room_by_code(code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  target_room uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a room.' using errcode = '28000';
  end if;

  select r.id into target_room
  from public.rooms r
  where r.invite_code = upper(trim(code));

  if target_room is null then
    return null;
  end if;

  insert into public.room_memberships (room_id, user_id)
  values (target_room, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return target_room;
end;
$$;

revoke execute on function public.join_room_by_code(text) from public, anon;
grant execute on function public.join_room_by_code(text) to authenticated;

-- 4. created_at is always set by the database.
create or replace function public.stamp_activity_created_at()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists activities_stamp_created_at on public.activities;
create trigger activities_stamp_created_at
  before insert on public.activities
  for each row execute procedure public.stamp_activity_created_at();
