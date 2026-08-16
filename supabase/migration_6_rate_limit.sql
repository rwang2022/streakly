-- Migration 6: rate-limit activity inserts at the database level.
--
-- lib/fraud.ts flags suspicious patterns after the fact (a visible flag +
-- score penalty), but nothing actually stops someone from inserting as
-- many activities as they want. This adds a hard cap enforced by Postgres
-- itself, on every insert, regardless of how the request reaches the
-- database — the same reasoning as migration_5's logged_at CHECK
-- constraint, just for volume instead of date validity.
--
-- 12/day is deliberately generous (well above what anyone training for
-- real would log) so it only ever blocks genuine spam, never a busy
-- legitimate day.

create or replace function public.enforce_activity_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.activities
  where user_id = new.user_id
    and created_at >= now() - interval '24 hours';

  if recent_count >= 12 then
    raise exception 'Too many activities logged in the last 24 hours. Try again later.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists activities_rate_limit on public.activities;
create trigger activities_rate_limit
  before insert on public.activities
  for each row execute procedure public.enforce_activity_rate_limit();
