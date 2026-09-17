-- ===========================================================================
-- 027 — a person's coordinates are theirs alone
--
-- The counterparty policies from 011 (profiles_donation_counterparty,
-- profiles_volunteer_counterparty) let the other side of a donation read the
-- donor's profile row, because it needs a name and a phone number. RLS is
-- row-level, so the row came with `lat` and `lng`: an organisation that
-- claimed a jacket could read where the donor lives — and the same
-- organisation, approved as a hospital, is one the health lane promises never
-- learns a donor's location. A promise that holds only in one lane is not one.
--
-- Column privileges close it without touching the policies: the app role can
-- no longer select the two columns at all. Anything that needs coordinates
-- either runs as the owner (the matching functions are all SECURITY DEFINER
-- already) or asks for the caller's own through app.my_location().
-- ===========================================================================

revoke select on public.profiles from eegai_app;
grant select (id, user_id, full_name, phone, role, pincode, is_active, created_at, updated_at)
  on public.profiles to eegai_app;

create or replace function app.my_location()
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select p.lat, p.lng from public.profiles p where p.user_id = app.current_user_id();
$$;

revoke all on function app.my_location() from public;
grant execute on function app.my_location() to eegai_app;
