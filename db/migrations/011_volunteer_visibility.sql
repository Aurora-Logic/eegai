-- 011 — the volunteer read rule from PLAN.md §6, which was never implemented.
--
-- The bug: pickups_volunteer_open tested `exists (... join public.donations d
-- ...)`, but volunteers had no SELECT policy on donations at all. That inner
-- query returned nothing, the exists() was always false, and no volunteer could
-- ever see an open pickup. The policy read as though it worked.
--
-- Two things were needed to fix it without creating a recursion:
--
--   1. `set row_security = off` on every helper. SECURITY DEFINER alone is not
--      enough — policies are still expanded inside the function body, so a
--      helper that reads `donations` from a policy *on* `donations` raises
--      "infinite recursion detected in policy for relation donations".
--
--   2. The donations policy takes lat/lng as arguments rather than looking the
--      row up again. The policy already has the row; re-reading it was both
--      the recursion and a wasted lookup.

-- ---------------------------------------------------------------------------
-- Volunteers
-- ---------------------------------------------------------------------------

/**
 * True when the signed-in volunteer may see this donation: it has a pickup
 * assigned to them, or an unassigned pickup within their service radius.
 *
 * Reads pickups/volunteers/profiles only — never donations — so it is safe to
 * call from the donations policy.
 */
create or replace function app.volunteer_may_see_donation(
  p_donation_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
set row_security = off
as $$
  select exists (
    select 1
    from public.pickups pk
    join public.profiles p on p.user_id = app.current_user_id()
    join public.volunteers v on v.profile_id = p.id
    where pk.donation_id = p_donation_id
      and v.verification_status = 'verified'
      and (
        -- Assigned to me: visible whatever the distance, because I am already
        -- carrying it.
        pk.volunteer_id = v.id
        -- Or unassigned and inside my service radius.
        or (
          pk.volunteer_id is null
          and (
            p_lat is null or p_lng is null or p.lat is null or p.lng is null
            or app.distance_km(p_lat, p_lng, p.lat, p.lng) <= v.service_radius_km
          )
        )
      )
  );
$$;

/** Same question, from the pickups side, where the donation must be looked up. */
create or replace function app.volunteer_may_see_pickup(p_donation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
set row_security = off
as $$
  select app.volunteer_may_see_donation(d.id, d.lat, d.lng)
  from public.donations d
  where d.id = p_donation_id;
$$;

revoke all on function app.volunteer_may_see_donation(uuid, double precision, double precision) from public;
revoke all on function app.volunteer_may_see_pickup(uuid) from public;
grant execute on function app.volunteer_may_see_donation(uuid, double precision, double precision) to eegai_app;
grant execute on function app.volunteer_may_see_pickup(uuid) to eegai_app;

create policy donations_volunteer_read on public.donations
  for select using (app.volunteer_may_see_donation(id, lat, lng));

drop policy if exists pickups_volunteer_open on public.pickups;

create policy pickups_volunteer_open on public.pickups
  for select using (app.volunteer_may_see_pickup(donation_id));

-- ---------------------------------------------------------------------------
-- The people at each end of the handover.
--
-- A volunteer knocking on a door needs the donor's name, and needs to know
-- which organisation to deliver to. Without these the API's joins silently drop
-- the row and the pickup list comes back empty — the same failure mode as the
-- bug above, one table along.
--
-- Deliberately narrow: only the counterparties of a donation this volunteer is
-- already entitled to see.
-- ---------------------------------------------------------------------------

create or replace function app.volunteer_may_see_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
set row_security = off
as $$
  select exists (
    select 1
    from public.pickups pk
    join public.donations d on d.id = pk.donation_id
    left join public.ngos n on n.id = d.claimed_by_ngo_id
    where app.volunteer_may_see_donation(d.id, d.lat, d.lng)
      and p_profile_id in (d.donor_id, n.profile_id)
  );
$$;

/**
 * The donor and the claiming NGO must be able to read each other too: the NGO
 * needs a name and number to arrange collection, the donor needs to know who
 * took their things. Same narrowness — only across a donation that already
 * links the two.
 */
create or replace function app.is_donation_counterparty_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
set row_security = off
as $$
  select exists (
    select 1
    from public.donations d
    join public.ngos n on n.id = d.claimed_by_ngo_id
    join public.profiles me on me.user_id = app.current_user_id()
    where (d.donor_id = me.id and p_profile_id = n.profile_id)
       or (n.profile_id = me.id and p_profile_id = d.donor_id)
  );
$$;

create or replace function app.volunteer_may_see_ngo(p_ngo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
set row_security = off
as $$
  select exists (
    select 1
    from public.pickups pk
    join public.donations d on d.id = pk.donation_id
    where d.claimed_by_ngo_id = p_ngo_id
      and app.volunteer_may_see_donation(d.id, d.lat, d.lng)
  );
$$;

revoke all on function app.volunteer_may_see_profile(uuid) from public;
revoke all on function app.is_donation_counterparty_profile(uuid) from public;
revoke all on function app.volunteer_may_see_ngo(uuid) from public;
grant execute on function app.volunteer_may_see_profile(uuid) to eegai_app;
grant execute on function app.is_donation_counterparty_profile(uuid) to eegai_app;
grant execute on function app.volunteer_may_see_ngo(uuid) to eegai_app;

create policy profiles_volunteer_counterparty on public.profiles
  for select using (app.volunteer_may_see_profile(id));

create policy profiles_donation_counterparty on public.profiles
  for select using (app.is_donation_counterparty_profile(id));

create policy ngos_volunteer_counterparty on public.ngos
  for select using (app.volunteer_may_see_ngo(id));

-- ---------------------------------------------------------------------------
-- Taking a pickup.
--
-- `SELECT ... FOR UPDATE` is checked against UPDATE policies, not just SELECT
-- ones. Without these two the row-lock in app accept finds nothing and the
-- volunteer is told "another volunteer took this one" — for an item nobody has
-- touched. A confusing message for a permission problem is the worst of both.
--
-- The state-machine trigger still decides which transitions are legal; these
-- policies only decide which *rows* a volunteer may write.
-- ---------------------------------------------------------------------------

create policy pickups_volunteer_take on public.pickups
  for update
  using (volunteer_id is null and app.volunteer_may_see_pickup(donation_id))
  with check (
    volunteer_id in (
      select v.id from public.volunteers v
      join public.profiles p on p.id = v.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy donations_volunteer_update on public.donations
  for update
  using (app.volunteer_may_see_donation(id, lat, lng))
  with check (app.volunteer_may_see_donation(id, lat, lng));
