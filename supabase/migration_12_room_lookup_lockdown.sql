-- Migration 12: stop leaking every room (name + invite code) to anyone,
-- including fully unauthenticated requests.
--
-- Since migration 2, `rooms` has had a `to public using (true)` SELECT
-- policy, added so the /join/<code> page could preview a room's name
-- before the visitor had signed in. The comment at the time called this
-- safe ("nothing sensitive lives on this table") — but invite_code is a
-- bearer token: anyone who has it can join the room and then see every
-- member's workout history via the existing roommate-activity policy.
-- RLS can't scope "only the row matching the code the client already
-- has" — `using (true)` makes every row visible to any query regardless
-- of what WHERE clause the app happens to send, so a direct REST call
-- like `GET /rest/v1/rooms?select=*` (no app, no login required) could
-- dump the entire table and harvest every invite code in the product.
--
-- Fixed with two changes:
--  1. Replace the blanket policy with a member-only one for authenticated
--     users — the only thing the app's own room list/leaderboard code
--     ever actually needed.
--  2. A SECURITY DEFINER function for the specific join-by-code lookup,
--     returning only (id, name) for the one matching room — never the
--     invite_code itself, never any other room's row.

drop policy if exists "rooms are readable by anyone" on public.rooms;

create policy "rooms are readable by members"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(auth.uid(), id));

create or replace function public.get_room_by_invite_code(code text)
returns table (id uuid, name text)
language sql
stable
security definer set search_path = public
as $$
  select r.id, r.name
  from public.rooms r
  where r.invite_code = code;
$$;

-- Callable by signed-out visitors too (that's the whole point — previewing
-- an invite link before you've logged in) as well as signed-in users
-- joining via a pasted code.
grant execute on function public.get_room_by_invite_code(text) to anon, authenticated;
