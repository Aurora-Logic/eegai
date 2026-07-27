-- Seed data for local development. Runs automatically on `supabase db reset`.
--
-- Target (PLAN.md §10): 2 admins, 5 verified NGOs across Nashik pincodes,
-- 4 volunteers, and 30 donations spread across every state — so that every
-- feature is demoable from a fresh reset with no manual clicking.
--
-- M0 has no tables to seed yet: profiles land in M1, donations in M2. This file
-- exists now so the reset path is wired end to end and later milestones only
-- append.

-- Nashik pincodes the seed will spread NGOs and donations across, kept here so
-- M1 onward draws from one list:
--   422001 Nashik City      422005 Deolali
--   422002 Panchavati       422009 Satpur
--   422003 Nashik Road      422010 Ambad
--   422004 Gangapur Road    422013 Indira Nagar

select 'seed: nothing to insert at M0' as note;
