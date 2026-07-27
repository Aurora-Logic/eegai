-- 012 — the acknowledgement photo is donor-only, and was not.
--
-- PLAN.md §M6 is explicit: "The acknowledgement photo is visible to that donor
-- only." The policy written in 006 did not say that. It said:
--
--   exists (select 1 from public.donations d where d.id = ...donation_id)
--
-- which delegates the whole question to whoever can see the donation. At the
-- time that was the donor and the claiming NGO, so it happened to be correct.
--
-- Then 011 gave volunteers a SELECT policy on donations — correctly, so they
-- could see pickups at all — and this policy silently widened with it. The
-- volunteer who collected an item could read the photograph of where someone's
-- belongings ended up, which is precisely the thing the donor was promised was
-- private to them.
--
-- Nobody changed this file to break it. That is the point worth keeping: a
-- policy phrased as "anyone who can see the parent row" inherits every future
-- change to the parent's visibility, including ones made years later by someone
-- who has never read this table. Name the readers instead.
--
-- Found by scripts/flow-check.mjs, which walks one donation the whole way and
-- then tries to read the photo as the volunteer who delivered it.

drop policy if exists acknowledgements_party_read on public.acknowledgements;

-- The donor of the item, named explicitly rather than inferred.
create policy acknowledgements_donor_read on public.acknowledgements
  for select using (
    exists (
      select 1
      from public.donations d
      where d.id = acknowledgements.donation_id
        and d.donor_id in (
          select p.id from public.profiles p where p.user_id = app.current_user_id()
        )
    )
  );

-- The NGO that wrote it keeps access through acknowledgements_ngo_write, which
-- is `for all` and therefore already covers select. Admins keep
-- acknowledgements_admin_all. Volunteers and everyone else now get nothing.

comment on policy acknowledgements_donor_read on public.acknowledgements is
  'Donor-only read (PLAN.md §M6). Deliberately does not delegate to donations '
  'visibility — that is how volunteers gained access in 011.';
