-- 001 — extensions, the enum vocabulary, and request-scoped identity.
--
-- This replaces what Supabase gave us for free. The important idea is that RLS
-- is still doing the authorization work: the API connects as `wok_app`, a role
-- with no BYPASSRLS, and announces who the caller is by setting two GUCs inside
-- the request transaction. Policies read those through app.current_user_id()
-- and app.current_user_role().
--
-- The API sets those GUCs from a *verified* JWT, never from request input.
-- If the API forgets to set them, every helper returns null and every policy
-- fails closed.

create extension if not exists pgcrypto;

-- Radius filtering for the wall is lat/lng maths in Postgres (PLAN.md §3).
-- earthdistance depends on cube.
create extension if not exists cube;
create extension if not exists earthdistance;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums (PLAN.md §6)
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('donor', 'ngo', 'volunteer', 'admin');

create type public.verification_status as enum ('pending', 'verified', 'rejected', 'suspended');

create type public.donation_category as enum ('clothes', 'books', 'toys');

create type public.donation_condition as enum ('like_new', 'good', 'usable');

-- The state machine in PLAN.md §7. acknowledged, cancelled and rejected are terminal.
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

-- ---------------------------------------------------------------------------
-- Request-scoped identity
-- ---------------------------------------------------------------------------

-- `true` as the second argument to current_setting means "return null if unset"
-- rather than raising. That is what makes an unauthenticated request fail
-- closed instead of erroring out with a 500.
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function app.current_user_role()
returns public.user_role
language sql
stable
as $$
  select nullif(current_setting('app.user_role', true), '')::public.user_role;
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(app.current_user_role() = 'admin', false);
$$;

-- Distance in kilometres between two lat/lng pairs. Wraps earthdistance so
-- call sites read as intent rather than as extension trivia.
create or replace function app.distance_km(
  lat_a double precision,
  lng_a double precision,
  lat_b double precision,
  lng_b double precision
)
returns double precision
language sql
immutable
as $$
  select earth_distance(ll_to_earth(lat_a, lng_a), ll_to_earth(lat_b, lng_b)) / 1000.0;
$$;

grant usage on schema app to wok_app;
grant execute on all functions in schema app to wok_app;
grant usage on schema public to wok_app;
