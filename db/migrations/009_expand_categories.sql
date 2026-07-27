-- 009 — the category set widens beyond clothes/books/toys.
--
-- The EEGAI brief names clothing, books, educational materials, furniture and
-- household essentials. `toys` is kept rather than dropped: there are live rows
-- using it, Postgres cannot remove an enum value without rewriting every
-- dependent column, and a toy is a real thing people give.
--
-- ALTER TYPE ... ADD VALUE works inside a transaction on PG12+, provided the
-- new value is not *used* in the same transaction. Nothing below uses them;
-- the seed and the checklist gates do that afterwards.

alter type public.donation_category add value if not exists 'education';
alter type public.donation_category add value if not exists 'furniture';
alter type public.donation_category add value if not exists 'household';

comment on type public.donation_category is
  'clothes | books | toys | education | furniture | household. Mirrored in src/lib/validation/donation.ts.';
