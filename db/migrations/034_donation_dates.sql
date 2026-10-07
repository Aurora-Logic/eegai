-- ===========================================================================
-- 034 — when the hospital confirmed it
--
-- The brief asks a donor's history to show "donation completed" with a date.
-- An offer already carries decided_at; an answer to a blood alert carried only
-- when it was given, which is the wrong end of the story — the donor wants the
-- day they donated, not the day they volunteered.
-- ===========================================================================

alter table public.health_responses
  add column if not exists status_at timestamptz;

comment on column public.health_responses.status_at is
  'When the hospital last moved this donation along. Null until it does.';

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
  set status = p_status, status_at = now()
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
  donation_status_at timestamptz,
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
         r.status, r.status_at,
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
