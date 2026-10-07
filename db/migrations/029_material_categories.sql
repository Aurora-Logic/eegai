-- ===========================================================================
-- 029 — thirteen material categories, and material requests from organisations
--
-- The wall had six broad categories and one set of condition questions per
-- category. The new list is thirteen, each with its own questions, because
-- "is it within its expiry date" is the only question that matters for food
-- and is meaningless for a cricket bat.
--
-- Postgres cannot remove a value from an enum, so the old six stay in the type
-- and every row is migrated onto the new list (migration 030). Nothing reads
-- the old values any more: src/lib/validation/donation.ts is the list the
-- product offers.
--
-- Values only in this file. ALTER TYPE ... ADD VALUE works inside a
-- transaction, but the new value cannot be *used* in the same one — which is
-- why the data migration is the next file rather than the next paragraph.
-- ===========================================================================

alter type public.donation_category add value if not exists 'clothing';
alter type public.donation_category add value if not exists 'footwear';
alter type public.donation_category add value if not exists 'stationery';
alter type public.donation_category add value if not exists 'art_craft';
alter type public.donation_category add value if not exists 'food_groceries';
alter type public.donation_category add value if not exists 'toiletries';
alter type public.donation_category add value if not exists 'kitchen';
alter type public.donation_category add value if not exists 'household_bedding';
alter type public.donation_category add value if not exists 'sports';
alter type public.donation_category add value if not exists 'toys_games';
alter type public.donation_category add value if not exists 'cleaning';
alter type public.donation_category add value if not exists 'baby_child';

comment on type public.donation_category is
  'The thirteen in src/lib/validation/donation.ts. The pre-029 six remain in the type because Postgres cannot drop an enum value; no row uses them.';
