-- 026 — the donor module, as the second spec ("EEGAI – Donor Module Changes")
-- describes it.
--
-- What changes, and why each is a change rather than an addition:
--
--   Blood      A hospital's alert now goes to every registered blood donor, not
--              to the ones inside a radius with a matching group. The donor
--              answers Available or Not available, and the hospital is given
--              the contact details of the available ones only.
--   Hair       No longer requested by an institution. The donor fills in a
--              form and sends it to a partner organisation of their choosing.
--   Breast     Same shape as hair: the donor confirms the eligibility points,
--   milk       consents, and chooses a Lactation Management Centre, which does
--              the screening. This app decides nothing about eligibility.
--   Material   The existing goods wall, unchanged.
--
-- Hospitals and NGOs are both rows in `ngos`, told apart by org_type, because
-- they share one verification queue and one admin screen — two tables would
-- mean two queues and one of them going unwatched.

create type public.org_type as enum ('ngo', 'hospital');

create type public.gender as enum ('female', 'male', 'other', 'prefer_not_to_say');

create type public.offer_status as enum (
  'submitted', 'in_review', 'accepted', 'declined', 'completed', 'withdrawn'
);

alter table public.ngos
  add column org_type public.org_type not null default 'ngo',
  -- The Hospital card on the home page says "Terms & Conditions apply". This is
  -- the record that they were agreed to, and when.
  add column terms_accepted_at timestamptz;

-- ---------------------------------------------------------------------------
-- The blood donor's registration
--
-- Age, gender and the date of the last donation are what a blood centre asks
-- before it takes anyone. They are stored because the spec asks for them and
-- handed to a hospital only once the donor has said Available — nothing in this
-- database derives a judgement from them. Eligibility is decided in person.
-- ---------------------------------------------------------------------------

alter table public.donor_health_profiles
  add column age integer,
  add column gender public.gender,
  add column last_blood_donation date,
  -- The donor's standing answer. Off means "do not page me" without having to
  -- withdraw consent or stop being a blood donor.
  add column available boolean not null default true,
  add constraint donor_age_sane check (age is null or age between 1 and 120);

-- The old four-argument version cannot express the new fields, and leaving it
-- in place would let a caller save a blood donor with no blood group.
drop function if exists app.save_donor_health_profile(
  public.health_category[], public.blood_group, boolean, boolean
);

create or replace function app.save_donor_health_profile(
  p_categories public.health_category[],
  p_blood_group public.blood_group,
  p_notify boolean,
  p_share_location boolean,
  p_age integer,
  p_gender public.gender,
  p_last_blood_donation date,
  p_available boolean
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

  -- The spec marks blood type compulsory. Enforced here rather than only in the
  -- form, because a blood donor with no group makes every alert guesswork.
  if 'blood' = any (coalesce(p_categories, '{}')) and p_blood_group is null then
    raise exception 'a blood donor must give their blood group';
  end if;

  if p_last_blood_donation is not null and p_last_blood_donation > current_date then
    raise exception 'the last donation date cannot be in the future';
  end if;

  insert into public.donor_health_profiles
    (profile_id, categories, blood_group, notify, share_location,
     age, gender, last_blood_donation, available)
  values
    (v_profile_id, coalesce(p_categories, '{}'), p_blood_group,
     coalesce(p_notify, true), coalesce(p_share_location, true),
     p_age, p_gender, p_last_blood_donation, coalesce(p_available, true))
  on conflict (profile_id) do update
    set categories = excluded.categories,
        blood_group = excluded.blood_group,
        notify = excluded.notify,
        share_location = excluded.share_location,
        age = excluded.age,
        gender = excluded.gender,
        last_blood_donation = excluded.last_blood_donation,
        available = excluded.available;
end;
$$;

revoke all on function app.save_donor_health_profile(
  public.health_category[], public.blood_group, boolean, boolean,
  integer, public.gender, date, boolean
) from public;
grant execute on function app.save_donor_health_profile(
  public.health_category[], public.blood_group, boolean, boolean,
  integer, public.gender, date, boolean
) to eegai_app;

-- ---------------------------------------------------------------------------
-- Blood alerts
-- ---------------------------------------------------------------------------

alter table public.health_responses
  add column available boolean not null default true;

alter table public.health_requests
  add column not_available_count integer not null default 0;

/**
 * "Blood Alert sent to ALL registered blood donors."
 *
 * No radius and no group filter, as the spec says. What is still respected is
 * each donor's own answer: someone who withdrew consent, switched alerts off,
 * marked themselves not available, or turned their account off is not paged.
 * Those are not filters on the hospital's reach; they are the donor saying no.
 *
 * Returns a count. The hospital is told how many were alerted, never who.
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

  insert into public.notifications (profile_id, channel, template_key, payload)
  select p.id, 'push', 'health_request_nearby',
         jsonb_build_object(
           'request_id', v_req.id,
           'category', v_req.category,
           'urgency', v_req.urgency,
           'blood_group', v_req.blood_group,
           'units', v_req.donors_needed,
           'institution', v_req.institution_name,
           'area', coalesce(v_req.pincode, v_req.address)
         )
  from public.donor_health_profiles d
  join public.profiles p on p.id = d.profile_id
  join public.users u on u.id = p.user_id
  where p.role = 'donor'
    and p.is_active
    and u.is_active
    and d.notify
    and d.available
    and d.consented_at is not null
    and d.consent_withdrawn_at is null
    and v_req.category = any (d.categories);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Every registered blood donor who has consented sees every open alert. The
-- radius clause is gone, and with it the need for a location on file: the spec
-- sends the alert to everyone, so hiding it from somebody who has not shared an
-- area would contradict the notification they were sent.
drop policy if exists health_requests_nearby_read on public.health_requests;

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
        and health_requests.category = any (d.categories)
    )
  );

/**
 * Post a blood alert.
 *
 * Only blood now. Hair and breast milk are offered by donors to an organisation
 * of their choosing, so an institution "requesting hair" is a flow the spec no
 * longer has — refused here so the old path cannot be used by accident.
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

  if p_category <> 'blood' then
    raise exception 'hair and breast milk are offered by donors, not requested — only blood alerts can be posted';
  end if;

  if not (p_category = any (v_ngo.health_categories)) then
    raise exception 'your institution is not approved for % donation', p_category;
  end if;

  if p_blood_group is null then
    raise exception 'a blood alert must say which blood group is needed';
  end if;

  insert into public.health_requests
    (ngo_id, institution_name, category, blood_group, urgency, donors_needed, radius_km,
     lat, lng, address, pincode, note, expires_at)
  values
    (v_ngo.id, v_ngo.name, p_category, p_blood_group, coalesce(p_urgency, 'routine'),
     coalesce(p_donors_needed, 1), coalesce(p_radius_km, 50),
     coalesce(v_ngo.lat, 0), coalesce(v_ngo.lng, 0),
     coalesce(v_ngo.address, v_ngo.name), v_ngo.pincode,
     nullif(btrim(coalesce(p_note, '')), ''),
     now() + make_interval(hours => greatest(1, coalesce(p_expires_in_hours, 72))))
  returning id into v_id;

  v_notified := app.notify_nearby_donors(v_id);

  return query select v_id, v_notified;
end;
$$;

-- The response now carries an answer, so the old one-argument version goes.
drop function if exists app.respond_to_health_request(uuid);

/**
 * "Available to Donate" / "Not Available".
 *
 * Answering again changes the answer rather than adding a second row. The
 * hospital's contact details come back only for Available: saying you cannot
 * come is not a reason to be handed a phone number, and it is not consent to
 * be handed to them either.
 */
create or replace function app.respond_to_health_request(
  p_request_id uuid,
  p_available boolean
)
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

  update public.health_responses
  set available = coalesce(p_available, true)
  where request_id = p_request_id and profile_id = v_profile_id and withdrawn_at is null;

  if not found then
    insert into public.health_responses (request_id, profile_id, available)
    values (p_request_id, v_profile_id, coalesce(p_available, true));
  end if;

  update public.health_requests hr
  set responses_count = (
        select count(*) from public.health_responses r
        where r.request_id = hr.id and r.withdrawn_at is null and r.available
      ),
      not_available_count = (
        select count(*) from public.health_responses r
        where r.request_id = hr.id and r.withdrawn_at is null and not r.available
      )
  where hr.id = p_request_id;

  if not coalesce(p_available, true) then
    return;
  end if;

  return query
    select n.name, n.contact_person, n.contact_phone, v_req.address, n.visit_instructions
    from public.ngos n where n.id = v_req.ngo_id;
end;
$$;

revoke all on function app.respond_to_health_request(uuid, boolean) from public;
grant execute on function app.respond_to_health_request(uuid, boolean) to eegai_app;

-- Withdrawal also has to recount both columns now.
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
        where r.request_id = hr.id and r.withdrawn_at is null and r.available
      ),
      not_available_count = (
        select count(*) from public.health_responses r
        where r.request_id = hr.id and r.withdrawn_at is null and not r.available
      )
  where hr.id = p_request_id;

  return true;
end;
$$;

-- The responder list gains the registration details a blood centre asks for.
drop function if exists app.request_responders(uuid);

/**
 * The donors who said Available, for the hospital that asked.
 *
 * Name, phone, and the registration details a blood centre needs before it
 * takes anyone — and still no location, because nothing here selects one.
 * Donors who said Not available are not listed at all: they did not agree to
 * be contacted, and the hospital gets their number as a count.
 */
create or replace function app.request_responders(p_request_id uuid)
returns table (
  profile_id uuid,
  full_name text,
  phone text,
  age integer,
  gender public.gender,
  blood_group public.blood_group,
  last_blood_donation date,
  responded_at timestamptz
)
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
    select p.id, p.full_name, p.phone, d.age, d.gender, d.blood_group,
           d.last_blood_donation, r.created_at
    from public.health_responses r
    join public.profiles p on p.id = r.profile_id
    left join public.donor_health_profiles d on d.profile_id = p.id
    where r.request_id = p_request_id and r.withdrawn_at is null and r.available
    order by r.created_at;
end;
$$;

revoke all on function app.request_responders(uuid) from public;
grant execute on function app.request_responders(uuid) to eegai_app;

-- The donor's own responses, now with the answer they gave.
drop function if exists app.my_health_responses();

create or replace function app.my_health_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category public.health_category,
  blood_group public.blood_group,
  urgency public.request_urgency,
  status public.health_request_status,
  available boolean,
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
  -- Contact details only where the donor said Available. Somebody who said
  -- they cannot come has no reason to be holding the hospital's desk number.
  select r.id, hr.id, hr.category, hr.blood_group, hr.urgency, hr.status, r.available,
         hr.institution_name,
         case when r.available then n.contact_person end,
         case when r.available then n.contact_phone end,
         hr.address,
         case when r.available then n.visit_instructions end,
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
-- Hair and breast milk: offered by the donor to an organisation
-- ---------------------------------------------------------------------------

create table public.health_offers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  ngo_id uuid not null references public.ngos (id) on delete cascade,
  category public.health_category not null,

  -- The form's answers. jsonb because hair and milk ask different questions;
  -- the API validates the shape per category and submit_health_offer enforces
  -- the rules the spec says "must".
  details jsonb not null default '{}'::jsonb,
  photo_path text,

  status public.offer_status not null default 'submitted',
  -- What the organisation said, shown to the donor. A decline with no reason
  -- leaves somebody who cut off their hair with nothing.
  org_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Blood is an alert the hospital sends, not an offer the donor makes.
  constraint health_offers_not_blood check (category <> 'blood')
);

create index health_offers_donor_idx on public.health_offers (profile_id, created_at desc);
create index health_offers_org_idx on public.health_offers (ngo_id, created_at desc);

-- Sending the same thing to the same place twice while the first is still
-- being looked at is a mis-tap, not two donations.
create unique index health_offers_one_open
  on public.health_offers (profile_id, ngo_id, category)
  where status in ('submitted', 'in_review');

create trigger health_offers_touch
  before update on public.health_offers
  for each row execute function app.set_updated_at();

create trigger health_offers_audit
  after insert or update or delete on public.health_offers
  for each row execute function app.write_audit();

alter table public.health_offers enable row level security;

create policy health_offers_self on public.health_offers
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy health_offers_partner on public.health_offers
  for select using (
    ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy health_offers_admin on public.health_offers
  for all using (app.is_admin()) with check (app.is_admin());

grant select on public.health_offers to eegai_app;

/**
 * The organisations a donor can send hair or breast milk to.
 *
 * A function because `ngos` is closed to donors. What it returns is what the
 * organisation publishes about itself anyway: its name, where it is, and how to
 * reach it.
 */
create or replace function app.partner_organisations(p_category public.health_category)
returns table (
  ngo_id uuid,
  name text,
  org_type public.org_type,
  address text,
  pincode text,
  visit_instructions text
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select n.id, n.name, n.org_type, n.address, n.pincode, n.visit_instructions
  from public.ngos n
  where n.verification_status = 'verified'
    and p_category = any (n.health_categories)
  order by n.name;
$$;

/**
 * Send hair or breast milk to a partner organisation.
 *
 * The rules the spec says "must" are enforced here; the ones it says "may not
 * be accepted, depending on the partner organisation" are left for that
 * organisation to decide, because they are its decision.
 *
 *   hair         must be clean and completely dry.
 *   breast milk  every eligibility point must be confirmed, including consent
 *                and willingness to be screened. This is the donor's own
 *                declaration — the centre does the screening.
 */
create or replace function app.submit_health_offer(
  p_ngo_id uuid,
  p_category public.health_category,
  p_details jsonb,
  p_photo_path text
)
returns uuid
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_role public.user_role;
  v_consented boolean;
  v_ok boolean;
  v_id uuid;
begin
  select id, role into v_profile_id, v_role
  from public.profiles where user_id = app.current_user_id();

  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if v_role <> 'donor' then
    raise exception 'only a donor can offer a donation' using errcode = 'insufficient_privilege';
  end if;

  if p_category = 'blood' then
    raise exception 'blood is given in answer to a hospital alert, not offered';
  end if;

  select exists (
    select 1 from public.donor_health_profiles d
    where d.profile_id = v_profile_id
      and d.consented_at is not null
      and d.consent_withdrawn_at is null
  ) into v_consented;
  if not v_consented then
    raise exception 'agree to the donor consent terms before offering a donation';
  end if;

  select exists (
    select 1 from public.ngos n
    where n.id = p_ngo_id
      and n.verification_status = 'verified'
      and p_category = any (n.health_categories)
  ) into v_ok;
  if not v_ok then
    raise exception 'that organisation does not accept this donation';
  end if;

  if p_category = 'hair' then
    if coalesce((p_details ->> 'cleanAndDry')::boolean, false) is not true then
      raise exception 'hair must be clean and completely dry before it can be offered';
    end if;
  end if;

  if p_category = 'breast_milk' then
    if not (
      coalesce((p_details ->> 'lactating')::boolean, false)
      and coalesce((p_details ->> 'goodHealth')::boolean, false)
      and coalesce((p_details ->> 'surplus')::boolean, false)
      and coalesce((p_details ->> 'voluntary')::boolean, false)
      and coalesce((p_details ->> 'informedConsent')::boolean, false)
      and coalesce((p_details ->> 'screening')::boolean, false)
      and coalesce((p_details ->> 'throughCentre')::boolean, false)
    ) then
      raise exception 'every eligibility point must be confirmed before registering';
    end if;
  end if;

  -- A photo must be one this donor uploaded, under their own prefix. Otherwise
  -- somebody could attach another person's photo to their offer by path.
  if p_photo_path is not null
     and p_photo_path not like 'hair/' || v_profile_id::text || '/%' then
    raise exception 'that photo is not yours';
  end if;

  insert into public.health_offers (profile_id, ngo_id, category, details, photo_path)
  values (v_profile_id, p_ngo_id, p_category, coalesce(p_details, '{}'::jsonb), p_photo_path)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'you already have one waiting with this organisation';
end;
$$;

/** The donor's own offers, with how to reach the organisation. */
create or replace function app.my_health_offers()
returns table (
  offer_id uuid,
  category public.health_category,
  status public.offer_status,
  details jsonb,
  photo_path text,
  org_note text,
  created_at timestamptz,
  decided_at timestamptz,
  organisation text,
  contact_phone text,
  address text,
  visit_instructions text
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select o.id, o.category, o.status, o.details, o.photo_path, o.org_note,
         o.created_at, o.decided_at,
         n.name, n.contact_phone, n.address, n.visit_instructions
  from public.health_offers o
  join public.ngos n on n.id = o.ngo_id
  join public.profiles p on p.id = o.profile_id
  where p.user_id = app.current_user_id()
  order by o.created_at desc;
$$;

/**
 * Offers sent to the caller's organisation.
 *
 * The donor chose this organisation, which is the consent to be contacted by
 * it, so name and phone come with the offer. Still no location.
 */
create or replace function app.incoming_health_offers()
returns table (
  offer_id uuid,
  category public.health_category,
  status public.offer_status,
  details jsonb,
  photo_path text,
  org_note text,
  created_at timestamptz,
  decided_at timestamptz,
  donor_name text,
  donor_phone text
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select o.id, o.category, o.status, o.details, o.photo_path, o.org_note,
         o.created_at, o.decided_at, dp.full_name, dp.phone
  from public.health_offers o
  join public.ngos n on n.id = o.ngo_id
  join public.profiles me on me.id = n.profile_id
  join public.profiles dp on dp.id = o.profile_id
  where me.user_id = app.current_user_id()
  order by (o.status in ('submitted', 'in_review')) desc, o.created_at desc;
$$;

/**
 * Move an offer along. Only the organisation it was sent to, or an admin.
 *
 *   submitted → in_review | accepted | declined
 *   in_review → accepted | declined
 *   accepted  → completed | declined
 *
 * Declining needs a note. Somebody who cut off their hair, or a mother who
 * expressed milk, is owed a reason.
 */
create or replace function app.decide_health_offer(
  p_offer_id uuid,
  p_status public.offer_status,
  p_note text
)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_offer public.health_offers;
  v_owner boolean;
begin
  select * into v_offer from public.health_offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'no such offer';
  end if;

  select exists (
    select 1 from public.ngos n
    join public.profiles p on p.id = n.profile_id
    where n.id = v_offer.ngo_id and p.user_id = app.current_user_id()
  ) into v_owner;

  if not (v_owner or app.is_admin()) then
    raise exception 'that offer was not sent to you' using errcode = 'insufficient_privilege';
  end if;

  if not (
    (v_offer.status = 'submitted' and p_status in ('in_review', 'accepted', 'declined'))
    or (v_offer.status = 'in_review' and p_status in ('accepted', 'declined'))
    or (v_offer.status = 'accepted' and p_status in ('completed', 'declined'))
  ) then
    raise exception 'an offer that is % cannot become %', v_offer.status, p_status;
  end if;

  if p_status = 'declined' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'say why, so the donor is not left guessing';
  end if;

  update public.health_offers
  set status = p_status,
      org_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), org_note),
      decided_at = case when p_status in ('accepted', 'declined', 'completed') then now() else decided_at end
  where id = p_offer_id;
end;
$$;

/** The donor changing their mind, while the organisation has not finished. */
create or replace function app.withdraw_health_offer(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_id uuid;
begin
  update public.health_offers o
  set status = 'withdrawn'
  from public.profiles p
  where o.id = p_offer_id
    and p.id = o.profile_id
    and p.user_id = app.current_user_id()
    and o.status in ('submitted', 'in_review', 'accepted')
  returning o.id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function app.partner_organisations(public.health_category) from public;
revoke all on function app.submit_health_offer(uuid, public.health_category, jsonb, text) from public;
revoke all on function app.my_health_offers() from public;
revoke all on function app.incoming_health_offers() from public;
revoke all on function app.decide_health_offer(uuid, public.offer_status, text) from public;
revoke all on function app.withdraw_health_offer(uuid) from public;

grant execute on function app.partner_organisations(public.health_category) to eegai_app;
grant execute on function app.submit_health_offer(uuid, public.health_category, jsonb, text) to eegai_app;
grant execute on function app.my_health_offers() to eegai_app;
grant execute on function app.incoming_health_offers() to eegai_app;
grant execute on function app.decide_health_offer(uuid, public.offer_status, text) to eegai_app;
grant execute on function app.withdraw_health_offer(uuid) to eegai_app;

-- ---------------------------------------------------------------------------
-- Registering as a hospital
-- ---------------------------------------------------------------------------

drop function if exists app.register_user(
  text, text, text, public.user_role, text, text, text, double precision, double precision
);

create or replace function app.register_user(
  p_phone text,
  p_password_hash text,
  p_full_name text,
  p_role public.user_role,
  p_email text default null,
  p_address text default null,
  p_pincode text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_org_type public.org_type default 'ngo'
)
returns table (user_id uuid, profile_id uuid)
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_user_id uuid;
  v_profile_id uuid;
begin
  if p_role = 'admin' then
    raise exception 'admin accounts cannot be self-registered'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role = 'ngo' and (p_pincode is null or btrim(p_pincode) = '') then
    raise exception 'an organisation must register an area'
      using errcode = 'not_null_violation';
  end if;

  -- A hospital is an organisation with a different type, not a different role:
  -- it goes through the same verification queue. Being one grants nothing on
  -- its own — an admin still approves it for blood or milk.
  if p_org_type = 'hospital' and p_role <> 'ngo' then
    raise exception 'only an organisation can register as a hospital';
  end if;

  insert into public.users (phone, email, password_hash)
  values (p_phone, nullif(btrim(p_email), ''), p_password_hash)
  returning id into v_user_id;

  insert into public.profiles (user_id, full_name, phone, role, pincode, lat, lng)
  values (
    v_user_id, btrim(p_full_name), p_phone, p_role,
    nullif(btrim(coalesce(p_pincode, '')), ''), p_lat, p_lng
  )
  returning id into v_profile_id;

  if p_role = 'ngo' then
    insert into public.ngos (
      profile_id, name, contact_person, contact_phone, address, pincode, lat, lng,
      org_type, terms_accepted_at
    )
    values (
      v_profile_id, btrim(p_full_name), btrim(p_full_name), p_phone,
      nullif(btrim(coalesce(p_address, '')), ''),
      nullif(btrim(coalesce(p_pincode, '')), ''),
      p_lat, p_lng,
      coalesce(p_org_type, 'ngo'),
      case when p_org_type = 'hospital' then now() end
    );
  elsif p_role = 'volunteer' then
    insert into public.volunteers (profile_id) values (v_profile_id);
  end if;

  return query select v_user_id, v_profile_id;
end;
$$;

revoke all on function app.register_user(
  text, text, text, public.user_role, text, text, text,
  double precision, double precision, public.org_type
) from public;
grant execute on function app.register_user(
  text, text, text, public.user_role, text, text, text,
  double precision, double precision, public.org_type
) to eegai_app;
