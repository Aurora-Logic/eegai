-- ===========================================================================
-- 032 — progress a donor can follow, and both directions for all three
--
-- Three changes the brief asks for, which turn out to be one change:
--
--   * an organisation can post what it needs for hair and breast milk, not
--     only blood (026 had narrowed it to blood);
--   * a donor can offer blood to a hospital they choose, not only answer an
--     alert (026 had refused blood offers);
--   * every donation carries a status the organisation moves along, and a
--     blood alert shows how much of its requirement is actually done.
--
-- The common shape: a requirement and an offer are the two directions of the
-- same relationship, and both end with somebody at an organisation saying what
-- happened. The donor never sets their own status — "I donated" is a claim the
-- hospital has to confirm, and the whole lane rests on that being true.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Where a donation has got to
-- ---------------------------------------------------------------------------

alter table public.health_responses
  add column if not exists status public.offer_status not null default 'submitted';

alter table public.health_requests
  add column if not exists completed_count integer not null default 0;

comment on column public.health_responses.status is
  'Set by the hospital, never by the donor. Available is submitted; the hospital confirms the rest.';

/** Position in the chain. Declined and withdrawn are off it. */
create or replace function app.offer_rank(p_status public.offer_status)
returns integer
language sql
immutable
as $$
  select case p_status
           when 'submitted' then 1
           when 'in_review' then 2
           when 'accepted' then 3
           when 'collecting' then 4
           when 'received' then 5
           when 'completed' then 6
           else 0
         end;
$$;

-- ---------------------------------------------------------------------------
-- Requirements, for all three kinds again
-- ---------------------------------------------------------------------------

/**
 * Post what the organisation needs.
 *
 * 026 refused anything but blood, because the donor module described hair and
 * milk as donor-initiated. Both are true at once: an organisation may say it
 * needs hair, and a donor may offer hair without being asked. A blood alert
 * still has to name a group — "we need blood" pages every donor in the city
 * for a requirement only some of them can meet.
 */
drop function if exists app.post_health_request(public.health_category, public.blood_group, public.request_urgency, integer, integer, text, integer);

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

  if p_category = 'blood' and p_blood_group is null then
    raise exception 'a blood alert must say which blood group is needed';
  end if;

  insert into public.health_requests
    (ngo_id, institution_name, category, blood_group, urgency, donors_needed, radius_km,
     lat, lng, address, pincode, note, expires_at)
  values
    (v_ngo.id, v_ngo.name, p_category,
     case when p_category = 'blood' then p_blood_group else null end,
     coalesce(p_urgency, 'routine'),
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

-- ---------------------------------------------------------------------------
-- Offers, for all three kinds
-- ---------------------------------------------------------------------------

-- 026 forbade a blood offer at the table as well as in the function, on the
-- reasoning that blood is only ever given in answer to an alert. A donor
-- walking into a hospital that never posted one is the case that reasoning
-- missed.
alter table public.health_offers drop constraint if exists health_offers_not_blood;

/**
 * Offer a donation to an organisation the donor picks.
 *
 * Blood is allowed now: answering an alert is one way to give blood, walking
 * into a hospital that never posted one is another, and refusing the second
 * made the donor wait for a page that might never come. The hair floor is six
 * inches — below that nothing can be made, which is why it is refused here
 * rather than left to the partner like the other hair criteria.
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
  v_group public.blood_group;
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

  if p_category = 'blood' then
    select blood_group into v_group
    from public.donor_health_profiles where profile_id = v_profile_id;
    if v_group is null then
      raise exception 'register as a blood donor first — your blood group is needed';
    end if;
    -- Carried on the offer so the hospital sees it without reading the donor's
    -- health profile, which it has no access to.
    p_details := coalesce(p_details, '{}'::jsonb) || jsonb_build_object('bloodGroup', v_group);
  end if;

  if p_category = 'hair' then
    if coalesce((p_details ->> 'cleanAndDry')::boolean, false) is not true then
      raise exception 'hair must be clean and completely dry before it can be offered';
    end if;
    if coalesce((p_details ->> 'lengthInches')::numeric, 0) < 6 then
      raise exception 'hair must be at least 6 inches to be accepted';
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

/**
 * Move an offer along. The organisation it was sent to, or an admin.
 *
 * Forward only, and never by the donor: the chain is a record of what the
 * organisation has actually done, so a donor marking their own donation
 * "completed" would make the whole thing worthless. Declining needs a reason
 * at any point before the donation itself.
 */
drop function if exists app.decide_health_offer(uuid, public.offer_status, text);

create or replace function app.decide_health_offer(
  p_offer_id uuid,
  p_status public.offer_status,
  p_note text
)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_offer public.health_offers;
  v_mine boolean;
begin
  select * into v_offer from public.health_offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'no such offer';
  end if;

  select exists (
    select 1 from public.ngos n
    join public.profiles p on p.id = n.profile_id
    where n.id = v_offer.ngo_id and p.user_id = app.current_user_id()
  ) into v_mine;

  if not v_mine and not app.is_admin() then
    raise exception 'that offer was not sent to you' using errcode = 'insufficient_privilege';
  end if;

  if v_offer.status in ('declined', 'withdrawn', 'completed') then
    raise exception 'an offer that is % cannot become %', v_offer.status, p_status;
  end if;

  if p_status = 'declined' then
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'say why, so the donor is not left guessing';
    end if;
  elsif app.offer_rank(p_status) <= app.offer_rank(v_offer.status) then
    -- Forward only. Going back would rewrite what the donor has already been
    -- told, and there is no undo in a record meant to settle a dispute.
    raise exception 'an offer that is % cannot become %', v_offer.status, p_status;
  end if;

  update public.health_offers
  set status = p_status,
      org_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), org_note),
      decided_at = now()
  where id = p_offer_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Blood: what the hospital confirms, and how much is left
-- ---------------------------------------------------------------------------

/**
 * Move one donor's answer along: screening, accepted, donated, confirmed.
 *
 * The hospital's own record of what happened, and the only thing that counts
 * towards a requirement being met.
 */
create or replace function app.set_response_status(
  p_request_id uuid,
  p_profile_id uuid,
  p_status public.offer_status
)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_mine boolean;
  v_current public.offer_status;
begin
  select exists (
    select 1 from public.health_requests hr
    join public.ngos n on n.id = hr.ngo_id
    join public.profiles p on p.id = n.profile_id
    where hr.id = p_request_id and p.user_id = app.current_user_id()
  ) into v_mine;

  if not v_mine and not app.is_admin() then
    raise exception 'that request is not yours' using errcode = 'insufficient_privilege';
  end if;

  select status into v_current
  from public.health_responses
  where request_id = p_request_id and profile_id = p_profile_id and withdrawn_at is null;

  if v_current is null then
    raise exception 'that donor has not said they are available';
  end if;

  if p_status <> 'declined' and app.offer_rank(p_status) <= app.offer_rank(v_current) then
    raise exception 'a donor who is % cannot become %', v_current, p_status;
  end if;

  update public.health_responses
  set status = p_status
  where request_id = p_request_id and profile_id = p_profile_id and withdrawn_at is null;

  update public.health_requests hr
  set completed_count = (
    select count(*) from public.health_responses r
    where r.request_id = hr.id and r.withdrawn_at is null and r.status = 'completed'
  )
  where hr.id = p_request_id;

  return true;
end;
$$;

/**
 * How much of a requirement is actually done.
 *
 * Counts, never names: the brief is explicit that the progress figure does not
 * need to identify anybody, and the responders list is where a hospital goes
 * for the people it has already been given.
 */
create or replace function app.request_progress(p_request_id uuid)
returns table (
  units_required integer,
  completed integer,
  pending integer,
  remaining integer
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select hr.donors_needed,
         hr.completed_count,
         (select count(*)::integer from public.health_responses r
           where r.request_id = hr.id and r.withdrawn_at is null
             and r.available and r.status <> 'completed' and r.status <> 'declined'),
         greatest(0, hr.donors_needed - hr.completed_count)
  from public.health_requests hr
  where hr.id = p_request_id
    and (
      app.is_admin()
      or exists (
        select 1 from public.ngos n
        join public.profiles p on p.id = n.profile_id
        where n.id = hr.ngo_id and p.user_id = app.current_user_id()
      )
    );
$$;

/**
 * Closing a requirement tells the people who answered it.
 *
 * Somebody who said they were available and heard nothing goes on believing
 * they are needed. This is the message that stops that, and it is why closing
 * is a function rather than an update.
 */
drop function if exists app.close_health_request(uuid, public.health_request_status);

create or replace function app.close_health_request(
  p_request_id uuid,
  p_status public.health_request_status
)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_request public.health_requests;
  v_mine boolean;
begin
  select * into v_request from public.health_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'no such request';
  end if;

  select exists (
    select 1 from public.ngos n
    join public.profiles p on p.id = n.profile_id
    where n.id = v_request.ngo_id and p.user_id = app.current_user_id()
  ) into v_mine;

  if not v_mine and not app.is_admin() then
    raise exception 'that request is not yours' using errcode = 'insufficient_privilege';
  end if;

  update public.health_requests
  set status = p_status, closed_at = now(), closed_by = (
    select id from public.profiles where user_id = app.current_user_id()
  )
  where id = p_request_id and status = 'open';

  if not found then
    return false;
  end if;

  insert into public.notifications (profile_id, channel, template_key, payload)
  select r.profile_id, 'push', 'health_request_closed',
         jsonb_build_object(
           'request_id', p_request_id,
           'category', v_request.category,
           'blood_group', v_request.blood_group,
           'institution', v_request.institution_name,
           'status', p_status)
  from public.health_responses r
  where r.request_id = p_request_id
    and r.withdrawn_at is null
    and r.available
    and r.status <> 'completed';

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- What each side reads back
-- ---------------------------------------------------------------------------

drop function if exists app.request_responders(uuid);

create or replace function app.request_responders(p_request_id uuid)
returns table (
  profile_id uuid,
  full_name text,
  phone text,
  age integer,
  gender public.gender,
  blood_group public.blood_group,
  last_blood_donation date,
  status public.offer_status,
  responded_at timestamptz
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select p.id, p.full_name, p.phone, d.age, d.gender, d.blood_group, d.last_blood_donation,
         r.status, r.created_at
  from public.health_responses r
  join public.profiles p on p.id = r.profile_id
  left join public.donor_health_profiles d on d.profile_id = p.id
  join public.health_requests hr on hr.id = r.request_id
  where r.request_id = p_request_id
    and r.withdrawn_at is null
    and r.available
    and (
      app.is_admin()
      or exists (
        select 1 from public.ngos n
        join public.profiles me on me.id = n.profile_id
        where n.id = hr.ngo_id and me.user_id = app.current_user_id()
      )
    )
  order by r.created_at;
$$;

revoke all on function app.request_responders(uuid) from public;
grant execute on function app.request_responders(uuid) to eegai_app;

drop function if exists app.my_health_responses();

create or replace function app.my_health_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category public.health_category,
  blood_group public.blood_group,
  urgency public.request_urgency,
  status text,
  donation_status public.offer_status,
  institution text,
  contact_person text,
  contact_phone text,
  address text,
  visit_instructions text,
  expires_at timestamptz,
  responded_at timestamptz,
  withdrawn_at timestamptz,
  available boolean
)
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select r.id, hr.id, hr.category, hr.blood_group, hr.urgency, hr.status::text,
         r.status,
         hr.institution_name,
         case when r.available then n.contact_person end,
         case when r.available then n.contact_phone end,
         case when r.available then hr.address else '' end,
         case when r.available then n.visit_instructions end,
         hr.expires_at, r.created_at, r.withdrawn_at, r.available
  from public.health_responses r
  join public.health_requests hr on hr.id = r.request_id
  join public.ngos n on n.id = hr.ngo_id
  join public.profiles p on p.id = r.profile_id
  where p.user_id = app.current_user_id()
  order by r.created_at desc;
$$;

revoke all on function app.my_health_responses() from public;
grant execute on function app.my_health_responses() to eegai_app;

revoke all on function app.offer_rank(public.offer_status) from public;
grant execute on function app.offer_rank(public.offer_status) to eegai_app;
revoke all on function app.set_response_status(uuid, uuid, public.offer_status) from public;
grant execute on function app.set_response_status(uuid, uuid, public.offer_status) to eegai_app;
revoke all on function app.request_progress(uuid) from public;
grant execute on function app.request_progress(uuid) to eegai_app;
