-- 015 — an admin can create an account, including another admin.
--
-- app.register_user refuses the admin role outright, and correctly: it is the
-- self-service signup path, and self-service admin creation is a privilege
-- escalation hole. But that left no way to make an admin at all except editing
-- the seed, and no way for an operator to register an organisation or a
-- volunteer who walked in with paperwork rather than a phone.
--
-- A separate function, with the check the other one cannot make: the *caller*
-- must already be an admin. That is the whole difference between the two, and
-- it is why this is not a flag on register_user — a boolean parameter meaning
-- "skip the security check" is the kind of thing that eventually gets passed
-- true by a route handler that should not have.
--
-- Accounts created this way are verified immediately. An admin sitting with the
-- documents in front of them has already done the verification step; making
-- them approve their own creation in a second screen would be theatre.

create or replace function app.admin_create_account(
  p_phone text,
  p_password_hash text,
  p_full_name text,
  p_role public.user_role,
  p_email text default null,
  p_pincode text default null
)
returns table (user_id uuid, profile_id uuid)
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_user_id uuid;
  v_profile_id uuid;
begin
  if not app.is_admin() then
    raise exception 'only an admin may create an account'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.users (phone, email, password_hash)
  values (p_phone, nullif(btrim(p_email), ''), p_password_hash)
  returning id into v_user_id;

  insert into public.profiles (user_id, full_name, phone, role, pincode)
  values (v_user_id, btrim(p_full_name), p_phone, p_role, nullif(btrim(p_pincode), ''))
  returning id into v_profile_id;

  -- The role-specific row, without which an organisation cannot claim and a
  -- volunteer cannot be offered a pickup. register_user does the same; leaving
  -- it out produces an account that signs in and can do nothing.
  if p_role = 'ngo' then
    insert into public.ngos (profile_id, name, verification_status, verified_at, pincode)
    values (v_profile_id, btrim(p_full_name), 'verified', now(), nullif(btrim(p_pincode), ''));
  elsif p_role = 'volunteer' then
    insert into public.volunteers (profile_id, verification_status, verified_at)
    values (v_profile_id, 'verified', now());
  end if;

  return query select v_user_id, v_profile_id;
end;
$$;

revoke all on function app.admin_create_account(
  text, text, text, public.user_role, text, text
) from public;
grant execute on function app.admin_create_account(
  text, text, text, public.user_role, text, text
) to eegai_app;

comment on function app.admin_create_account(text, text, text, public.user_role, text, text) is
  'Admin-only account creation, including admins. Separate from register_user '
  'because the difference is a caller check, not a parameter.';
