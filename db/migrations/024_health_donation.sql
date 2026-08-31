-- 024 — the second lane: blood, hair and breast milk coordination.
--
-- The developer brief describes a different shape of product from the goods
-- wall this app already runs, and the two must not be confused with each other:
--
--   goods lane   a donor posts a thing, an organisation claims it, a volunteer
--                or a courier moves it, and the app tracks the handover.
--   health lane  an institution posts a need, nearby consenting donors are
--                alerted, a donor opts in and then goes to the institution.
--                The app never touches the donation.
--
-- Brief §6 forbids collection, storage, testing and transport for the health
-- lane, and forbids medical eligibility checks. So nothing here reaches
-- pickups, shipments, OTPs or acknowledgements — that machinery belongs to the
-- goods lane alone, and a health request has no delivery concept at all.
--
-- Brief §5's privacy rules are the reason this is a migration rather than a
-- screen: they are enforceable in exactly one place, and it is not the API.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

create type public.health_category as enum ('blood', 'hair', 'breast_milk');

create type public.blood_group as enum ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');

create type public.request_urgency as enum ('routine', 'urgent', 'critical');

create type public.health_request_status as enum ('open', 'fulfilled', 'closed', 'cancelled');

-- ---------------------------------------------------------------------------
-- The institution is the organisation we already verify.
--
-- Brief §3 names three user types and this app already has them: donor,
-- ngo, admin. A separate `institutions` table would mean a second verification
-- queue, a second admin screen and a second thing for an operator to forget.
-- What an institution has that an ordinary organisation does not is permission
-- to ask for a category of health donation, so that is what gets added.
--
-- Empty array — the default — means "not a health institution", which is every
-- organisation already on the platform.
-- ---------------------------------------------------------------------------

alter table public.ngos
  add column health_categories public.health_category[] not null default '{}',
  add column visit_instructions text;

comment on column public.ngos.health_categories is
  'Which health donations this institution may request. Admin-granted; empty means none.';
comment on column public.ngos.visit_instructions is
  'Where to go and what to bring, shown to a donor only after they opt in.';

-- ---------------------------------------------------------------------------
-- The donor's side: preferences and consent, in one row.
--
-- No location column. The donor's coordinates already live on `profiles` and
-- copying them here would create a second copy to keep in step and a second
-- place to leak them from. Brief §5 says the exact location is never shown
-- publicly; the fewer rows that hold it, the easier that is to keep true.
-- ---------------------------------------------------------------------------

create table public.donor_health_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,

  -- Which of the three they are willing to be asked about. Empty means they
  -- have a health profile but are not currently offering anything.
  categories public.health_category[] not null default '{}',

  -- Optional, and stated by the donor rather than verified by us. Brief §6:
  -- no medical eligibility checks. This is used to avoid alerting somebody
  -- about a group they have said is not theirs — targeting, not screening.
  blood_group public.blood_group,

  -- Brief §4: a notification toggle, and §4 again: disable location.
  -- Separate switches because they mean different things — one stops the
  -- alerts, the other stops us knowing where to send them from.
  notify boolean not null default true,
  share_location boolean not null default true,

  -- Brief §5: clear consent at signup, withdrawable at any time. Recorded with
  -- the version of the document that was agreed to, because a policy that
  -- changes silently is not consent.
  consented_at timestamptz,
  consent_version integer,
  consent_withdrawn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger donor_health_profiles_touch
  before update on public.donor_health_profiles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- The need an institution posts.
--
-- lat/lng and the address are copied from the institution at posting time
-- rather than joined. An institution that later moves must not silently move
-- every request it has ever made, and a donor who travelled to an address is
-- entitled to a record of the address they were given.
-- ---------------------------------------------------------------------------

create table public.health_requests (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.ngos (id) on delete cascade,

  category public.health_category not null,
  -- Only meaningful for blood. Checked below rather than left to the API.
  blood_group public.blood_group,
  urgency public.request_urgency not null default 'routine',

  donors_needed integer not null default 1,
  responses_count integer not null default 0,

  -- Brief §4: the institution chooses the radius. ~10km is the default the
  -- brief names; the bounds stop somebody quietly broadcasting to a state.
  radius_km integer not null default 10,

  -- Copied at posting time, like the coordinates below. A donor must be able
  -- to read who asked without being able to read the organisations table —
  -- `ngos` is closed to donors, and an inner join through it silently drops
  -- every row rather than failing, which is how a wall ends up empty.
  institution_name text not null,

  lat double precision not null,
  lng double precision not null,
  address text not null,
  pincode text,

  note text,
  status public.health_request_status not null default 'open',
  expires_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint health_requests_blood_group_only_for_blood
    check (blood_group is null or category = 'blood'),
  constraint health_requests_donors_needed_sane
    check (donors_needed between 1 and 500),
  constraint health_requests_radius_sane
    check (radius_km between 1 and 50)
);

create index health_requests_open_idx on public.health_requests (created_at desc)
  where status = 'open';
create index health_requests_ngo_idx on public.health_requests (ngo_id, created_at desc);
create index health_requests_category_idx on public.health_requests (category, status);

create trigger health_requests_touch
  before update on public.health_requests
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- "I'm willing to help."
--
-- Withdrawable, because a donor who changes their mind must be able to say so
-- rather than simply not turning up. The partial unique index is what stops
-- one donor counting twice toward donors_needed.
-- ---------------------------------------------------------------------------

create table public.health_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.health_requests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index health_responses_one_open_per_donor
  on public.health_responses (request_id, profile_id) where withdrawn_at is null;

create index health_responses_donor_idx on public.health_responses (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Brief §4: deactivate or delete an account.
--
-- Deactivation is immediate and reversible by an admin. Deletion is a request,
-- because donations already made are referenced by audit rows that exist to
-- settle disputes — the honest answer is a queue and a human, not a button
-- that pretends rows vanish.
-- ---------------------------------------------------------------------------

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  handled_at timestamptz,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create unique index account_deletion_one_open
  on public.account_deletion_requests (profile_id) where handled_at is null;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Brief §5's four rules are non-negotiable, so they are enforced here rather
-- than in a route handler that somebody can forget to write:
--
--   1. A donor's exact location is never shown publicly.
--   2. Collect only what is needed.
--   3. Only verified institutions can post or broadcast.
--   4. Consent is explicit and withdrawable.
--
-- Rule 1 is the one that shapes everything below. There is deliberately no
-- policy anywhere that lets an institution read `profiles`, so the matching
-- and the responder list both go through SECURITY DEFINER functions that
-- return named columns and cannot return a coordinate even by accident.
-- ---------------------------------------------------------------------------

alter table public.donor_health_profiles enable row level security;
alter table public.health_requests enable row level security;
alter table public.health_responses enable row level security;
alter table public.account_deletion_requests enable row level security;

-- A donor's health profile is theirs. Not an institution's, not another
-- donor's. Admins can read for support, and cannot write.
create policy donor_health_self on public.donor_health_profiles
  for all
  using (profile_id in (select id from public.profiles where user_id = app.current_user_id()))
  with check (profile_id in (select id from public.profiles where user_id = app.current_user_id()));

create policy donor_health_admin_read on public.donor_health_profiles
  for select using (app.is_admin());

-- What a donor sees on their wall: open requests, in a category they offer,
-- inside the radius the institution chose.
--
-- The `notify` toggle deliberately does not appear here. Turning off alerts
-- means "stop messaging me", not "hide the product from me" — somebody who
-- opted out of notifications can still come and look.
create policy health_requests_nearby_read on public.health_requests
  for select using (
    status = 'open'
    and expires_at > now()
    and exists (
      select 1
      from public.donor_health_profiles d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = app.current_user_id()
        and d.consented_at is not null
        and d.consent_withdrawn_at is null
        and d.share_location
        and p.lat is not null
        and p.lng is not null
        and health_requests.category = any (d.categories)
        and app.distance_km(p.lat, p.lng, health_requests.lat, health_requests.lng)
              <= health_requests.radius_km
    )
  );

/**
 * Has the caller opted into this request?
 *
 * SECURITY DEFINER with row_security off, and that is not a shortcut. A policy
 * on `health_requests` that reads `health_responses` meets the policy on
 * `health_responses` that reads `health_requests`, and Postgres reports the
 * result as "infinite recursion detected in policy" at query time rather than
 * at definition time — so it only appears when somebody opens the wall.
 *
 * It answers only about the caller. There is no parameter for whose response
 * to check, so it cannot be used to ask who else said yes.
 */
create or replace function app.has_responded_to(p_request_id uuid)
returns boolean
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select exists (
    select 1
    from public.health_responses r
    join public.profiles p on p.id = r.profile_id
    where r.request_id = p_request_id and p.user_id = app.current_user_id()
  );
$$;

revoke all on function app.has_responded_to(uuid) from public;
grant execute on function app.has_responded_to(uuid) to eegai_app;

-- A donor also keeps sight of anything they have opted into, even after it
-- closes or drifts out of range. Losing the address of a place you agreed to
-- visit because the request expired would be a bug with a real cost.
create policy health_requests_responded_read on public.health_requests
  for select using (app.has_responded_to(id));

create policy health_requests_owner on public.health_requests
  for select using (
    ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy health_requests_admin on public.health_requests
  for all using (app.is_admin()) with check (app.is_admin());

-- A donor sees their own responses. An institution sees that responses to its
-- own requests exist — but reading this row yields only a profile id, and
-- nothing in the schema lets an institution turn one of those into a person.
-- app.request_responders below is the only route to a name, and it returns a
-- name and a phone number and nothing else.
create policy health_responses_self on public.health_responses
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy health_responses_institution_read on public.health_responses
  for select using (
    request_id in (
      select hr.id from public.health_requests hr
      join public.ngos n on n.id = hr.ngo_id
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy health_responses_admin on public.health_responses
  for all using (app.is_admin()) with check (app.is_admin());

create policy deletion_requests_self on public.account_deletion_requests
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy deletion_requests_admin on public.account_deletion_requests
  for all using (app.is_admin()) with check (app.is_admin());

grant select on public.donor_health_profiles to eegai_app;
grant insert, update on public.donor_health_profiles to eegai_app;
grant select on public.health_requests to eegai_app;
grant select on public.health_responses to eegai_app;
grant select on public.account_deletion_requests to eegai_app;

-- ---------------------------------------------------------------------------
-- The trail. Same trigger every other table uses, so a health request is as
-- auditable as a donation.
-- ---------------------------------------------------------------------------

create trigger health_requests_audit
  after insert or update or delete on public.health_requests
  for each row execute function app.write_audit();

create trigger health_responses_audit
  after insert or update or delete on public.health_responses
  for each row execute function app.write_audit();

-- ---------------------------------------------------------------------------
-- The donor's own settings and consent
-- ---------------------------------------------------------------------------

/**
 * Save preferences. Creates the row on first use so a donor never has to be
 * told to "set up a profile" before they can express one.
 */
create or replace function app.save_donor_health_profile(
  p_categories public.health_category[],
  p_blood_group public.blood_group,
  p_notify boolean,
  p_share_location boolean
)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  insert into public.donor_health_profiles
    (profile_id, categories, blood_group, notify, share_location)
  values
    (v_profile_id, coalesce(p_categories, '{}'), p_blood_group,
     coalesce(p_notify, true), coalesce(p_share_location, true))
  on conflict (profile_id) do update
    set categories = excluded.categories,
        blood_group = excluded.blood_group,
        notify = excluded.notify,
        share_location = excluded.share_location;
end;
$$;

/**
 * Brief §5: clear consent at signup, easy withdrawal at any time.
 *
 * The version is stored with the grant. A policy that changes after the fact
 * is not something anybody agreed to, so a new version means asking again.
 */
create or replace function app.grant_health_consent(p_version integer)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  insert into public.donor_health_profiles (profile_id, consented_at, consent_version)
  values (v_profile_id, now(), p_version)
  on conflict (profile_id) do update
    set consented_at = now(),
        consent_version = p_version,
        consent_withdrawn_at = null;
end;
$$;

/**
 * Withdrawal stops everything at once: no alerts, and the wall policy stops
 * matching, so nearby requests disappear from view on the next request rather
 * than at the next sign-in.
 *
 * Existing responses are left alone. Somebody who agreed to visit an
 * institution has made a commitment to a person, and quietly cancelling it
 * because they changed a setting would be the app speaking on their behalf.
 */
create or replace function app.withdraw_health_consent()
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  update public.donor_health_profiles
  set consent_withdrawn_at = now(), notify = false
  where profile_id = v_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting a need, and the proximity alert
-- ---------------------------------------------------------------------------

/**
 * Brief §4: the proximity notification engine.
 *
 * Alerts donors within the request's radius who offer that category and have
 * notifications on. Three things it deliberately does not do:
 *
 *   - It does not return the donors. It inserts notification rows and returns
 *     a count. Brief §5: the institution never learns who is nearby, only how
 *     many were told.
 *   - It does not compute blood compatibility. That is medical logic and brief
 *     §6 forbids it. Where both the request and the donor name a group, it
 *     matches them exactly — that is targeting, so an O- request does not page
 *     every A+ donor in the district, and it is not a judgement about anyone's
 *     eligibility to give.
 *   - It does not touch a donor who has withdrawn consent, turned off alerts,
 *     turned off location, or been deactivated.
 */
create or replace function app.notify_nearby_donors(p_request_id uuid)
returns integer
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_req public.health_requests;
  v_count integer;
begin
  select * into v_req from public.health_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'no such request';
  end if;

  with matched as (
    select p.id as profile_id
    from public.donor_health_profiles d
    join public.profiles p on p.id = d.profile_id
    join public.users u on u.id = p.user_id
    where p.role = 'donor'
      and p.is_active
      and u.is_active
      and d.notify
      and d.share_location
      and d.consented_at is not null
      and d.consent_withdrawn_at is null
      and v_req.category = any (d.categories)
      and p.lat is not null
      and p.lng is not null
      and app.distance_km(p.lat, p.lng, v_req.lat, v_req.lng) <= v_req.radius_km
      and (
        v_req.blood_group is null
        or d.blood_group is null
        or d.blood_group = v_req.blood_group
      )
  )
  insert into public.notifications (profile_id, channel, template_key, payload)
  select m.profile_id, 'push', 'health_request_nearby',
         jsonb_build_object(
           'request_id', v_req.id,
           'category', v_req.category,
           'urgency', v_req.urgency,
           'blood_group', v_req.blood_group
         )
  from matched m;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * Post a need.
 *
 * Brief §5: only verified institutions can post or broadcast. Both halves of
 * that are checked here — verified, and permitted for this category — because
 * a route handler is a place somebody can forget.
 *
 * Location and address are copied from the institution now rather than joined
 * later, so a request is a record of where a donor was actually asked to go.
 */
create or replace function app.post_health_request(
  p_category public.health_category,
  p_blood_group public.blood_group,
  p_urgency public.request_urgency,
  p_donors_needed integer,
  p_radius_km integer,
  p_note text,
  p_expires_in_hours integer default 72
)
returns table (request_id uuid, notified integer)
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_ngo public.ngos;
  v_id uuid;
  v_notified integer;
begin
  select n.* into v_ngo
  from public.ngos n
  join public.profiles p on p.id = n.profile_id
  where p.user_id = app.current_user_id();

  if v_ngo.id is null then
    raise exception 'only an institution can post a request'
      using errcode = 'insufficient_privilege';
  end if;

  if v_ngo.verification_status <> 'verified' then
    raise exception 'your institution is not verified yet';
  end if;

  if not (p_category = any (v_ngo.health_categories)) then
    raise exception 'your institution is not approved for % donation', p_category;
  end if;

  if v_ngo.lat is null or v_ngo.lng is null then
    raise exception 'your institution has no location set';
  end if;

  if p_category <> 'blood' and p_blood_group is not null then
    raise exception 'a blood group only applies to a blood request';
  end if;

  insert into public.health_requests
    (ngo_id, institution_name, category, blood_group, urgency, donors_needed, radius_km,
     lat, lng, address, pincode, note, expires_at)
  values
    (v_ngo.id, v_ngo.name, p_category, p_blood_group, coalesce(p_urgency, 'routine'),
     coalesce(p_donors_needed, 1), coalesce(p_radius_km, 10),
     v_ngo.lat, v_ngo.lng, v_ngo.address, v_ngo.pincode, nullif(btrim(coalesce(p_note,'')), ''),
     now() + make_interval(hours => greatest(1, coalesce(p_expires_in_hours, 72))))
  returning id into v_id;

  v_notified := app.notify_nearby_donors(v_id);

  return query select v_id, v_notified;
end;
$$;

/** Close a request early — filled, or no longer needed. */
create or replace function app.close_health_request(
  p_request_id uuid,
  p_status public.health_request_status
)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_owner boolean;
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();

  select exists (
    select 1 from public.health_requests hr
    join public.ngos n on n.id = hr.ngo_id
    where hr.id = p_request_id and n.profile_id = v_profile_id
  ) into v_owner;

  if not (v_owner or app.is_admin()) then
    raise exception 'that request is not yours' using errcode = 'insufficient_privilege';
  end if;

  if p_status not in ('fulfilled', 'closed', 'cancelled') then
    raise exception 'a request can only be closed as fulfilled, closed or cancelled';
  end if;

  update public.health_requests
  set status = p_status, closed_at = now(), closed_by = v_profile_id
  where id = p_request_id and status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- Opting in
-- ---------------------------------------------------------------------------

/**
 * "I'm willing to help."
 *
 * Returns what brief §4 says a donor gets at this moment and not before: the
 * institution's name, contact and visit details. Until somebody opts in, an
 * open request shows the institution and the area but not a phone number to
 * ring, because a public list of direct lines to a blood bank is a different
 * product from the one described.
 *
 * Consent is re-checked here rather than assumed from the wall being visible.
 * The two are separated by however long the page has been open.
 */
create or replace function app.respond_to_health_request(p_request_id uuid)
returns table (
  institution text,
  contact_person text,
  contact_phone text,
  address text,
  visit_instructions text
)
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_req public.health_requests;
  v_consented boolean;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  select exists (
    select 1 from public.donor_health_profiles d
    where d.profile_id = v_profile_id
      and d.consented_at is not null
      and d.consent_withdrawn_at is null
  ) into v_consented;

  if not v_consented then
    raise exception 'agree to the donor consent terms before responding';
  end if;

  select * into v_req from public.health_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'no such request';
  end if;
  if v_req.status <> 'open' or v_req.expires_at <= now() then
    raise exception 'that request is closed';
  end if;

  insert into public.health_responses (request_id, profile_id)
  values (p_request_id, v_profile_id)
  on conflict do nothing;

  update public.health_requests hr
  set responses_count = (
    select count(*) from public.health_responses r
    where r.request_id = hr.id and r.withdrawn_at is null
  )
  where hr.id = p_request_id;

  return query
    select n.name, n.contact_person, n.contact_phone, v_req.address, n.visit_instructions
    from public.ngos n where n.id = v_req.ngo_id;
end;
$$;

/** Change your mind. Better than simply not arriving. */
create or replace function app.withdraw_health_response(p_request_id uuid)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();

  update public.health_responses
  set withdrawn_at = now()
  where request_id = p_request_id and profile_id = v_profile_id and withdrawn_at is null
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  update public.health_requests hr
  set responses_count = (
    select count(*) from public.health_responses r
    where r.request_id = hr.id and r.withdrawn_at is null
  )
  where hr.id = p_request_id;

  return true;
end;
$$;

/**
 * Who said yes, for the institution that asked.
 *
 * This function exists so that brief §5's first rule can be true by
 * construction. There is no policy granting an institution read on `profiles`,
 * so the only path from a response to a person is this one — and it returns a
 * name, a phone number and a time. It cannot return a coordinate, because it
 * does not select one.
 */
create or replace function app.request_responders(p_request_id uuid)
returns table (profile_id uuid, full_name text, phone text, responded_at timestamptz)
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_allowed boolean;
begin
  select exists (
    select 1 from public.health_requests hr
    join public.ngos n on n.id = hr.ngo_id
    join public.profiles p on p.id = n.profile_id
    where hr.id = p_request_id and p.user_id = app.current_user_id()
  ) or app.is_admin() into v_allowed;

  if not v_allowed then
    raise exception 'that request is not yours' using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id, p.full_name, p.phone, r.created_at
    from public.health_responses r
    join public.profiles p on p.id = r.profile_id
    where r.request_id = p_request_id and r.withdrawn_at is null
    order by r.created_at;
end;
$$;

/**
 * Everything this donor has said yes to, with the details they were promised.
 *
 * A function rather than a join, because `ngos` is closed to donors: an inner
 * join through it returns nothing at all instead of failing, and the screen
 * would simply look empty. Contact details are read live rather than copied,
 * so a hospital that changes its number does not strand somebody holding an
 * old one.
 *
 * Scoped to the caller's own responses, so it discloses nothing that opting in
 * did not already earn.
 */
create or replace function app.my_health_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category public.health_category,
  blood_group public.blood_group,
  urgency public.request_urgency,
  status public.health_request_status,
  institution text,
  contact_person text,
  contact_phone text,
  address text,
  visit_instructions text,
  expires_at timestamptz,
  responded_at timestamptz,
  withdrawn_at timestamptz
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select r.id, hr.id, hr.category, hr.blood_group, hr.urgency, hr.status,
         hr.institution_name, n.contact_person, n.contact_phone,
         hr.address, n.visit_instructions,
         hr.expires_at, r.created_at, r.withdrawn_at
  from public.health_responses r
  join public.health_requests hr on hr.id = r.request_id
  join public.ngos n on n.id = hr.ngo_id
  join public.profiles p on p.id = r.profile_id
  where p.user_id = app.current_user_id()
  order by r.created_at desc;
$$;

revoke all on function app.my_health_responses() from public;
grant execute on function app.my_health_responses() to eegai_app;

-- ---------------------------------------------------------------------------
-- Account controls (brief §4)
-- ---------------------------------------------------------------------------

/** Stop being able to sign in, immediately, at your own request. */
create or replace function app.deactivate_own_account()
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_user_id uuid := app.current_user_id();
begin
  if v_user_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  update public.users set is_active = false where id = v_user_id;
  update public.profiles set is_active = false where user_id = v_user_id;
  update public.donor_health_profiles
  set notify = false
  where profile_id in (select id from public.profiles where user_id = v_user_id);
end;
$$;

/**
 * Ask to be deleted.
 *
 * A queue and a human, not a button that pretends rows vanish. Donations
 * already made are referenced by audit rows that exist to settle disputes, so
 * "delete everything now" is a promise this product cannot keep — and saying so
 * is better than appearing to.
 */
create or replace function app.request_account_deletion(p_reason text)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  insert into public.account_deletion_requests (profile_id, reason)
  values (v_profile_id, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Narrow, and never `all on all functions`.
-- ---------------------------------------------------------------------------

revoke all on function app.save_donor_health_profile(public.health_category[], public.blood_group, boolean, boolean) from public;
revoke all on function app.grant_health_consent(integer) from public;
revoke all on function app.withdraw_health_consent() from public;
revoke all on function app.notify_nearby_donors(uuid) from public;
revoke all on function app.post_health_request(public.health_category, public.blood_group, public.request_urgency, integer, integer, text, integer) from public;
revoke all on function app.close_health_request(uuid, public.health_request_status) from public;
revoke all on function app.respond_to_health_request(uuid) from public;
revoke all on function app.withdraw_health_response(uuid) from public;
revoke all on function app.request_responders(uuid) from public;
revoke all on function app.deactivate_own_account() from public;
revoke all on function app.request_account_deletion(text) from public;

grant execute on function app.save_donor_health_profile(public.health_category[], public.blood_group, boolean, boolean) to eegai_app;
grant execute on function app.grant_health_consent(integer) to eegai_app;
grant execute on function app.withdraw_health_consent() to eegai_app;
grant execute on function app.post_health_request(public.health_category, public.blood_group, public.request_urgency, integer, integer, text, integer) to eegai_app;
grant execute on function app.close_health_request(uuid, public.health_request_status) to eegai_app;
grant execute on function app.respond_to_health_request(uuid) to eegai_app;
grant execute on function app.withdraw_health_response(uuid) to eegai_app;
grant execute on function app.request_responders(uuid) to eegai_app;
grant execute on function app.deactivate_own_account() to eegai_app;
grant execute on function app.request_account_deletion(text) to eegai_app;

-- notify_nearby_donors is called by post_health_request, which is SECURITY
-- DEFINER and owns the check. The app role has no reason to broadcast on its
-- own, so it is not granted.
