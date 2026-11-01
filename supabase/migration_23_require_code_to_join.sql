-- Migration 23: remove direct joins.
--
-- Run this ONLY after the app version that joins through
-- join_room_by_code() (migration 22) is deployed. The old app inserts
-- membership rows directly, so its joins would start failing.
--
-- After this, the only ways into room_memberships are:
--   - join_room_by_code(code), which checks the invite code, and
--   - a room's creator adding themselves right after creating it (this
--     relies on migration 22's "creators can read their own rooms" policy,
--     since the check below reads the rooms table).

drop policy if exists "users can join a room" on public.room_memberships;
drop policy if exists "creators can add themselves to their room" on public.room_memberships;

create policy "creators can add themselves to their room"
  on public.room_memberships for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.created_by = auth.uid()
    )
  );
