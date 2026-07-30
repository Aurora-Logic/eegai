-- 023 — a signed-in person can ask to become something else.
--
-- Changing a role has always been possible, but only from the admin side: an
-- operator had to already know that a donor wanted to register their trust, or
-- that someone who signed up to collect actually meant to give. The only channel
-- for that was a phone call nobody makes.
--
-- The request is a queue entry, not a switch. Approval stays with an admin and
-- goes through app.admin_change_role, which is where the guards live — an
-- organisation mid-delivery cannot be demoted, an admin cannot demote itself,
-- and an organisation needs an address. Nothing here weakens any of that.
--
-- Modelled on password_reset_requests (020), with one deliberate difference:
-- this one stores a profile id rather than a phone number. That table takes a
-- number because the person asking cannot sign in, so resolving it server-side
-- would leak which numbers are registered. Here the asker is signed in and we
-- already know exactly who they are.

create table public.role_change_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  requested_role public.user_role not null,
  -- Why. An operator deciding whether to promote someone to an organisation
  -- benefits far more from "we are a registered trust in Ganapathy" than from
  -- the bare fact that a button was pressed.
  reason text,
  handled_at timestamptz,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- One open request per person. The partial unique index is what enforces it;
-- the function's check is the friendly message, not the guarantee.
create unique index role_change_one_open_idx on public.role_change_requests (profile_id)
  where handled_at is null;

create index role_change_open_idx on public.role_change_requests (created_at)
  where handled_at is null;

alter table public.role_change_requests enable row level security;

-- Admins see and resolve everything.
create policy role_change_admin on public.role_change_requests
  for all using (app.is_admin()) with check (app.is_admin());

-- Someone reads their own, so the app can say "you already asked, we are looking
-- at it" instead of offering the button again. Read only: asking goes through
-- the function below, which is what refuses the requests that make no sense.
create policy role_change_self_read on public.role_change_requests
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

grant select, update on public.role_change_requests to eegai_app;

/**
 * Record an ask. The caller is whoever is signed in; there is no parameter for
 * that on purpose, so this cannot be used to file a request against anyone else.
 *
 * Returns the request id.
 */
create or replace function app.request_role_change(
  p_role public.user_role,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_current public.user_role;
  v_id uuid;
begin
  select id, role into v_profile_id, v_current
  from public.profiles
  where user_id = app.current_user_id();

  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  -- Admin is never self-service. An account that could ask its way to admin
  -- would make every other guard in admin_change_role decorative.
  if p_role = 'admin' then
    raise exception 'an administrator account is only ever created by another administrator';
  end if;

  -- An admin asking to be demoted has the same problem in reverse: it would let
  -- the last admin queue up its own removal and lock everyone out.
  if v_current = 'admin' then
    raise exception 'an administrator cannot request a different role';
  end if;

  if p_role = v_current then
    raise exception 'you are already %', p_role;
  end if;

  -- Asking twice replaces the ask rather than stacking up two rows. Someone who
  -- changes their mind from volunteer to organisation should leave one item in
  -- the queue, and it should say the thing they meant last.
  update public.role_change_requests
  set requested_role = p_role,
      reason = nullif(btrim(coalesce(p_reason, '')), ''),
      created_at = now()
  where profile_id = v_profile_id and handled_at is null
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.role_change_requests (profile_id, requested_role, reason)
  values (v_profile_id, p_role, nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.request_role_change(public.user_role, text) from public;
grant execute on function app.request_role_change(public.user_role, text) to eegai_app;

/**
 * Withdraw your own open request.
 *
 * Cheap to add and it closes an otherwise dead end: without it, a mis-tap sits
 * in the admin queue until somebody rings to say never mind.
 */
create or replace function app.withdraw_role_change()
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
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  -- Deleted rather than marked handled. A withdrawn request is not a decision
  -- anyone made, and leaving it in the table would make the admin queue's
  -- history read as though it had been dealt with.
  delete from public.role_change_requests
  where profile_id = v_profile_id and handled_at is null
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function app.withdraw_role_change() from public;
grant execute on function app.withdraw_role_change() to eegai_app;

/**
 * Close an open request for a profile, as an admin.
 *
 * Called on its own when an operator dismisses an ask, and called by
 * admin_change_role below when the change actually happens — a request that has
 * been granted should not still be sitting in the queue afterwards.
 */
create or replace function app.close_role_change_request(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_id uuid;
begin
  if not app.is_admin() then
    raise exception 'only an admin may resolve a role request'
      using errcode = 'insufficient_privilege';
  end if;

  update public.role_change_requests
  set handled_at = now(),
      handled_by = (select id from public.profiles where user_id = app.current_user_id())
  where profile_id = p_profile_id and handled_at is null
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function app.close_role_change_request(uuid) from public;
grant execute on function app.close_role_change_request(uuid) to eegai_app;
