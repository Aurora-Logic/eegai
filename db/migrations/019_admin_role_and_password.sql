-- 019 — an admin can change someone's role, and reset their password.
--
-- guard_role_change already permits an admin to write profiles.role. What it
-- cannot know is everything that has to move with it, which is why this is a
-- function rather than an UPDATE from a route.
--
-- Changing a role mid-journey is the dangerous case. An organisation with items
-- it has claimed, or a volunteer with a pickup in hand, is holding somebody's
-- belongings. Demote them and the item is stranded: no NGO route can reach it,
-- no volunteer screen lists it, and the donor sees a status that will never
-- change again. So in-flight work blocks the change and says what to finish
-- first.
--
-- Old role rows are left in place rather than deleted. `ngos` is referenced by
-- donations.claimed_by_ngo_id and by the audit trail; removing it would break
-- the record of items that organisation genuinely received. The row is inert
-- once the profile is no longer an NGO, because every NGO route is behind
-- requireRole and every NGO policy joins through profiles.

create or replace function app.admin_change_role(
  p_profile_id uuid,
  p_role public.user_role,
  p_address text default null,
  p_pincode text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns text
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_old public.user_role;
  v_name text;
  v_blocked integer;
begin
  if not app.is_admin() then
    raise exception 'only an admin may change a role'
      using errcode = 'insufficient_privilege';
  end if;

  select role, full_name into v_old, v_name from public.profiles where id = p_profile_id;
  if v_old is null then
    raise exception 'no such person';
  end if;

  if v_old = p_role then
    return format('%s is already a %s', v_name, p_role);
  end if;

  -- Demoting yourself out of admin locks the door with the keys inside.
  if p_profile_id in (select id from public.profiles where user_id = app.current_user_id())
     and p_role <> 'admin' then
    raise exception 'you cannot change your own role';
  end if;

  -- Items this organisation has claimed but not finished.
  if v_old = 'ngo' then
    select count(*) into v_blocked
    from public.donations d
    join public.ngos n on n.id = d.claimed_by_ngo_id
    where n.profile_id = p_profile_id
      and d.status in ('claimed', 'scheduled', 'in_transit', 'received');
    if v_blocked > 0 then
      raise exception 'that organisation still has % item(s) in progress', v_blocked;
    end if;
  end if;

  -- Collections this volunteer has accepted but not delivered.
  if v_old = 'volunteer' then
    select count(*) into v_blocked
    from public.pickups pk
    join public.volunteers v on v.id = pk.volunteer_id
    where v.profile_id = p_profile_id and pk.delivered_at is null;
    if v_blocked > 0 then
      raise exception 'that volunteer still has % collection(s) in hand', v_blocked;
    end if;
  end if;

  -- Items this donor has on the wall or in transit.
  if v_old = 'donor' then
    select count(*) into v_blocked
    from public.donations d
    where d.donor_id = p_profile_id
      and d.status in ('posted', 'claimed', 'scheduled', 'in_transit', 'received');
    if v_blocked > 0 then
      raise exception 'that donor still has % item(s) in progress', v_blocked;
    end if;
  end if;

  -- An organisation with no location silently opts out of the radius rule, the
  -- same trap 018 closed at registration. Refuse the promotion without one.
  if p_role = 'ngo' and not exists (
    select 1 from public.ngos where profile_id = p_profile_id and lat is not null
  ) and (p_pincode is null or p_lat is null) then
    raise exception 'an organisation needs an address and an area';
  end if;

  update public.profiles set role = p_role where id = p_profile_id;

  if p_role = 'ngo' then
    insert into public.ngos (
      profile_id, name, contact_person, contact_phone, address, pincode, lat, lng,
      verification_status, verified_at
    )
    select p_profile_id, p.full_name, p.full_name, p.phone,
           nullif(btrim(coalesce(p_address, '')), ''),
           coalesce(nullif(btrim(coalesce(p_pincode, '')), ''), p.pincode),
           p_lat, p_lng, 'verified', now()
    from public.profiles p where p.id = p_profile_id
    on conflict (profile_id) do update
      set verification_status = 'verified',
          verified_at = now(),
          address = coalesce(excluded.address, public.ngos.address),
          pincode = coalesce(excluded.pincode, public.ngos.pincode),
          lat = coalesce(excluded.lat, public.ngos.lat),
          lng = coalesce(excluded.lng, public.ngos.lng);

  elsif p_role = 'volunteer' then
    insert into public.volunteers (profile_id, verification_status, verified_at)
    values (p_profile_id, 'verified', now())
    on conflict (profile_id) do update
      set verification_status = 'verified', verified_at = now();
  end if;

  return format('%s is now a %s', v_name, p_role);
end;
$$;

revoke all on function app.admin_change_role(
  uuid, public.user_role, text, text, double precision, double precision
) from public;
grant execute on function app.admin_change_role(
  uuid, public.user_role, text, text, double precision, double precision
) to eegai_app;

/**
 * Reset somebody's password.
 *
 * There is no SMS gateway, so a self-service "forgot password" link has nowhere
 * to send anything — the same reasoning that made handover codes in-app. An
 * admin resets it and reads the new one out, which is the channel that already
 * exists. The caller generates and hashes the password; this function never
 * sees plaintext.
 */
create or replace function app.admin_reset_password(p_profile_id uuid, p_password_hash text)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_user uuid;
begin
  if not app.is_admin() then
    raise exception 'only an admin may reset a password'
      using errcode = 'insufficient_privilege';
  end if;

  select user_id into v_user from public.profiles where id = p_profile_id;
  if v_user is null then
    return false;
  end if;

  update public.users set password_hash = p_password_hash where id = v_user;
  return true;
end;
$$;

revoke all on function app.admin_reset_password(uuid, text) from public;
grant execute on function app.admin_reset_password(uuid, text) to eegai_app;
