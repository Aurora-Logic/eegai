-- 013 — let an admin actually disable an account.
--
-- `public.users` has users_self_read, users_admin_read and users_self_update.
-- There is no admin UPDATE policy, so an admin disabling someone updated zero
-- rows, returned no error, and the account carried on signing in. The API
-- reported success because it never looked at the row count.
--
-- Two ways to fix this. Add an admin UPDATE policy on users, which hands the API
-- role blanket update rights over every column including password_hash; or route
-- the one legitimate write through a function that can touch nothing else. The
-- second is what the rest of this schema does (app.claim_donation,
-- app.issue_pickup_otps) and it is the one that cannot be misused by a bug in a
-- route handler.
--
-- Soft only, and deliberately. audit_log and donation_events are the dispute
-- record for every item, and donations carry foreign keys to the organisation
-- and volunteer that handled them. Deleting a row would break those references
-- or silently rewrite history, and §2 is explicit that history is not
-- rewritable. "Delete this user" operationally means "they can no longer sign
-- in", which is exactly this.

create or replace function app.set_account_active(p_profile_id uuid, p_active boolean)
returns boolean
language plpgsql
security definer
-- Policies are expanded inside a SECURITY DEFINER body too, so without this the
-- function inherits the very policy gap it exists to work around.
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_user uuid;
begin
  -- The authorisation, stated once and here rather than trusted from the route.
  -- app.is_admin() reads the session GUC, which is set from a verified JWT.
  if not app.is_admin() then
    raise exception 'only an admin may change account status';
  end if;

  select user_id into v_user from public.profiles where id = p_profile_id;
  if v_user is null then
    return false;
  end if;

  -- Both, always. users.is_active is what app.find_login checks, so it is what
  -- actually stops a sign-in; profiles.is_active is what every admin list
  -- displays. Writing one without the other produces an account that looks
  -- disabled and still logs in, or the reverse.
  update public.profiles set is_active = p_active where id = p_profile_id;
  update public.users set is_active = p_active where id = v_user;

  return true;
end;
$$;

revoke all on function app.set_account_active(uuid, boolean) from public;
grant execute on function app.set_account_active(uuid, boolean) to eegai_app;

comment on function app.set_account_active(uuid, boolean) is
  'Admin soft-delete. Writes users.is_active and profiles.is_active together; '
  'raises unless the caller is an admin.';
