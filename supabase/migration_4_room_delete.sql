-- Migration 4: let a room's creator delete it (leaving is already covered
-- by the "users can leave a room" policy on room_memberships from
-- migration 2 — this adds the missing DELETE policy on rooms itself).

create policy "creator can delete their room"
  on public.rooms for delete
  to authenticated
  using (auth.uid() = created_by);
