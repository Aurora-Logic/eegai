-- 018 — an organisation registers with an address and a location.
--
-- register_user created the ngos row with a name and the login phone, and left
-- address, pincode, lat and lng null. Two consequences, neither obvious:
--
-- The wall policy in 005 reads `... or n.lat is null or n.lng is null or
-- distance <= radius`. A null location makes that clause true, so an
-- organisation that registered itself saw *every* item in the city. The radius
-- rule was not enforced for exactly the organisations nobody had vetted.
--
-- And /pickups/mine hands the volunteer `n.address` as the delivery address. For
-- a self-registered organisation that is null, so a volunteer is told to take
-- someone's belongings to nowhere.
--
-- The seeded NGOs all had locations, which is why neither showed up in testing.
-- Fixtures that are more complete than real data hide this class of bug.

create or replace function app.register_user(
  p_phone text,
  p_password_hash text,
  p_full_name text,
  p_role public.user_role,
  p_email text default null,
  p_address text default null,
  p_pincode text default null,
  p_lat double precision default null,
  p_lng double precision default null
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
  -- Self-service admin signup would be a privilege-escalation hole. Admins are
  -- created by the seed, or by another admin through app.admin_create_account.
  if p_role = 'admin' then
    raise exception 'admin accounts cannot be self-registered'
      using errcode = 'insufficient_privilege';
  end if;

  -- An organisation without a location is not a partially filled record, it is
  -- one that silently opts out of the radius rule. Refuse it here rather than
  -- letting the policy fail open.
  if p_role = 'ngo' and (p_pincode is null or btrim(p_pincode) = '') then
    raise exception 'an organisation must register an area'
      using errcode = 'not_null_violation';
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
      profile_id, name, contact_person, contact_phone, address, pincode, lat, lng
    )
    values (
      v_profile_id, btrim(p_full_name), btrim(p_full_name), p_phone,
      nullif(btrim(coalesce(p_address, '')), ''),
      nullif(btrim(coalesce(p_pincode, '')), ''),
      p_lat, p_lng
    );
  elsif p_role = 'volunteer' then
    insert into public.volunteers (profile_id) values (v_profile_id);
  end if;

  return query select v_user_id, v_profile_id;
end;
$$;

revoke all on function app.register_user(
  text, text, text, public.user_role, text, text, text, double precision, double precision
) from public;
grant execute on function app.register_user(
  text, text, text, public.user_role, text, text, text, double precision, double precision
) to eegai_app;

-- The five-argument version is gone; leaving it would let a caller reach the old
-- behaviour and create a location-less organisation again.
drop function if exists app.register_user(text, text, text, public.user_role, text);
