-- Migration 3: let a join-by-link page preview a room's name before the
-- visitor has signed in. The original rooms policy only covered the
-- `authenticated` role, so a fresh (logged-out) visit to /join/<code>
-- silently saw zero rows via RLS and showed "Invite not found" even for a
-- real code.

drop policy if exists "rooms are readable by authenticated users" on public.rooms;

create policy "rooms are readable by anyone"
  on public.rooms for select
  to public
  using (true);
