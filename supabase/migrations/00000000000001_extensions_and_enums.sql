-- M0 — foundation: extensions and the shared enum vocabulary.
--
-- Every enum the data model needs (PLAN.md §6) is declared here, up front, even
-- where the table that uses it lands in a later milestone. Enums are cheap to
-- create and awkward to alter inside a migration that is also creating tables,
-- so they get their own file.

create extension if not exists pgcrypto with schema extensions;

-- Radius filtering for the wall is lat/lng maths in Postgres — no Google Maps
-- in v1 (PLAN.md §3). earthdistance depends on cube.
create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- One role per user in v1, stored as a column on profiles.
create type public.user_role as enum ('donor', 'ngo', 'volunteer', 'admin');

-- Shared by ngos and volunteers.
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'suspended');

create type public.donation_category as enum ('clothes', 'books', 'toys');

create type public.donation_condition as enum ('like_new', 'good', 'usable');

-- The state machine in PLAN.md §7. 'cancelled' and 'rejected' are terminal, as
-- is 'acknowledged'.
create type public.donation_status as enum (
  'posted',
  'claimed',
  'scheduled',
  'in_transit',
  'received',
  'acknowledged',
  'cancelled',
  'rejected'
);

create type public.delivery_method as enum ('courier', 'volunteer');

create type public.pickup_slot as enum ('morning', 'evening');

create type public.notification_channel as enum ('sms', 'whatsapp', 'push');
