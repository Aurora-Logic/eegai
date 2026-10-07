-- ===========================================================================
-- 033 — what an organisation says it does, and clearing out test accounts
--
-- Two unrelated asks that both land on registration and the admin list.
--
-- An organisation now says at registration which health donations it handles
-- and, if it is an NGO that wants material at all, which categories. Saying is
-- not granting: `requested_health_categories` is the asking, `health_categories`
-- stays the admin's answer, and the verification queue shows them side by side.
-- A hospital is asked for neither material category — it has no wall.
-- ===========================================================================

drop function if exists app.register_user(
  text, text, text, public.user_role, text, text, text,
  double precision, double precision, public.org_type);

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
  p_org_type public.org_type default 'ngo',
  p_health_categories public.health_category[] default '{}',
  p_accepts_categories public.donation_category[] default '{}'
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
      org_type, terms_accepted_at, requested_health_categories, accepts_categories
    )
    values (
      v_profile_id, btrim(p_full_name), btrim(p_full_name), p_phone,
      nullif(btrim(coalesce(p_address, '')), ''),
      nullif(btrim(coalesce(p_pincode, '')), ''),
      p_lat, p_lng,
      coalesce(p_org_type, 'ngo'),
      case when p_org_type = 'hospital' then now() end,
      coalesce(p_health_categories, '{}'),
      -- A hospital has no wall, so it accepts no material whatever it ticked.
      case when p_org_type = 'hospital' then '{}'::public.donation_category[]
           else coalesce(p_accepts_categories, '{}') end
    );
  elsif p_role = 'volunteer' then
    insert into public.volunteers (profile_id) values (v_profile_id);
  end if;

  return query select v_user_id, v_profile_id;
end;
$$;

revoke all on function app.register_user(
  text, text, text, public.user_role, text, text, text,
  double precision, double precision, public.org_type,
  public.health_category[], public.donation_category[]
) from public;
grant execute on function app.register_user(
  text, text, text, public.user_role, text, text, text,
  double precision, double precision, public.org_type,
  public.health_category[], public.donation_category[]
) to eegai_app;

-- ---------------------------------------------------------------------------
-- Removing an account for good
--
-- Everything else in this product is a soft delete, on purpose: the audit log
-- and the donation trail are the dispute record, and rewriting history is the
-- one thing the design refuses. That reasoning does not cover a test account
-- that never did anything, and leaving a pile of them in the admin list is its
-- own kind of harm — an operator looking for a real organisation should not
-- have to read past "Test NGO 4".
--
-- So: a permanent delete that refuses the moment there is any history to lose,
-- and names what it found. Anything with a trail is suspended instead.
-- ---------------------------------------------------------------------------

create or replace function app.purge_account(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile public.profiles;
  v_blockers text[] := '{}';
  v_count integer;
begin
  if not app.is_admin() then
    raise exception 'only an admin may delete an account'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null then
    raise exception 'no such account';
  end if;

  if v_profile.role = 'admin' then
    raise exception 'an admin account cannot be deleted here';
  end if;

  select count(*) into v_count from public.donations where donor_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s posted items', v_count); end if;

  select count(*) into v_count from public.donations d
  join public.ngos n on n.id = d.claimed_by_ngo_id
  where n.profile_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s claimed items', v_count); end if;

  select count(*) into v_count from public.pickups pk
  join public.volunteers v on v.id = pk.volunteer_id
  where v.profile_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s collections', v_count); end if;

  select count(*) into v_count from public.health_responses where profile_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s answered alerts', v_count); end if;

  select count(*) into v_count from public.health_offers where profile_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s donation offers', v_count); end if;

  select count(*) into v_count from public.health_requests hr
  join public.ngos n on n.id = hr.ngo_id
  where n.profile_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s posted requirements', v_count); end if;

  select count(*) into v_count from public.reports where reporter_id = p_profile_id;
  if v_count > 0 then v_blockers := v_blockers || format('%s complaints', v_count); end if;

  if array_length(v_blockers, 1) > 0 then
    raise exception 'this account has % — disable it instead of deleting it',
      array_to_string(v_blockers, ', ');
  end if;

  -- profiles, ngos, volunteers and notifications all cascade from the user.
  delete from public.users where id = v_profile.user_id;

  return true;
end;
$$;

revoke all on function app.purge_account(uuid) from public;
grant execute on function app.purge_account(uuid) to eegai_app;
