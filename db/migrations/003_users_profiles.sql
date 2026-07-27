-- 003 — identity. Replaces Supabase's auth.users.
--
-- Auth is phone + password (no OTP). Hashing happens in the API with scrypt;
-- Postgres only ever sees the derived hash, never a plaintext password.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  email text unique,
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Indian mobile numbers: 10 digits, first digit 6-9. Stored bare, without
  -- +91, so there is exactly one representation to match on at login.
  constraint users_phone_valid check (phone ~ '^[6-9][0-9]{9}$')
);

create trigger set_updated_at
  before update on public.users
  for each row execute function app.set_updated_at();

alter table public.users enable row level security;

-- A user can see their own row and nothing else. Note this policy can never
-- expose password_hash to another user, but the API still selects columns
-- explicitly rather than relying on that.
create policy users_self_read on public.users
  for select using (id = app.current_user_id());

create policy users_admin_read on public.users
  for select using (app.is_admin());

create policy users_self_update on public.users
  for update using (id = app.current_user_id())
  with check (id = app.current_user_id());

grant select, update on public.users to wok_app;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  full_name text not null,
  -- Distinct from users.phone, which is the login identity. An NGO's contact
  -- number is often a desk line that nobody signs in with.
  phone text,
  role public.user_role not null,
  pincode text,
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_pincode_valid check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  constraint profiles_lat_valid check (lat is null or lat between -90 and 90),
  constraint profiles_lng_valid check (lng is null or lng between -180 and 180),
  constraint profiles_name_present check (length(btrim(full_name)) > 0)
);

create index profiles_role_idx on public.profiles (role);
create index profiles_pincode_idx on public.profiles (pincode);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_self_read on public.profiles
  for select using (user_id = app.current_user_id());

create policy profiles_admin_all on public.profiles
  for all using (app.is_admin()) with check (app.is_admin());

create policy profiles_self_update on public.profiles
  for update using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

grant select, update on public.profiles to wok_app;

-- A user must not be able to promote themselves by PATCHing their own profile.
-- The self-update policy above allows the row, so the column is guarded here.
create or replace function app.guard_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not app.is_admin() then
    raise exception 'role may only be changed by an admin'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger guard_role_change
  before update on public.profiles
  for each row execute function app.guard_role_change();

create trigger write_audit
  after insert or update or delete on public.profiles
  for each row execute function app.write_audit();

-- ---------------------------------------------------------------------------
-- Auth entry points
--
-- Registration and login must touch rows that RLS deliberately hides, so both
-- run as the table owner. They are the only two places that is true, and
-- neither accepts a role from the caller beyond the four public ones.
-- ---------------------------------------------------------------------------

create or replace function app.register_user(
  p_phone text,
  p_password_hash text,
  p_full_name text,
  p_role public.user_role,
  p_email text default null
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
  -- created by the seed or promoted by another admin.
  if p_role = 'admin' then
    raise exception 'admin accounts cannot be self-registered'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.users (phone, email, password_hash)
  values (p_phone, nullif(btrim(p_email), ''), p_password_hash)
  returning id into v_user_id;

  insert into public.profiles (user_id, full_name, phone, role)
  values (v_user_id, btrim(p_full_name), p_phone, p_role)
  returning id into v_profile_id;

  -- The role-specific row is created here rather than by the API, because RLS
  -- deliberately grants no INSERT on either table: an NGO must not be able to
  -- conjure a second organisation for itself.
  if p_role = 'ngo' then
    insert into public.ngos (profile_id, name, contact_person, contact_phone)
    values (v_profile_id, btrim(p_full_name), btrim(p_full_name), p_phone);
  elsif p_role = 'volunteer' then
    insert into public.volunteers (profile_id) values (v_profile_id);
  end if;

  return query select v_user_id, v_profile_id;
end;
$$;

-- Returns the hash so the API can verify it in constant time with scrypt.
-- Deliberately returns a row even for an inactive user so the API can tell
-- "wrong password" from "account disabled" without a second query.
create or replace function app.find_login(p_phone text)
returns table (
  user_id uuid,
  password_hash text,
  is_active boolean,
  role public.user_role,
  full_name text
)
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  select u.id, u.password_hash, u.is_active, p.role, p.full_name
  from public.users u
  join public.profiles p on p.user_id = u.id
  where u.phone = p_phone;
$$;

create or replace function app.touch_last_login(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  update public.users set last_login_at = now() where id = p_user_id;
$$;

revoke all on function app.register_user(text, text, text, public.user_role, text) from public;
revoke all on function app.find_login(text) from public;
revoke all on function app.touch_last_login(uuid) from public;

grant execute on function app.register_user(text, text, text, public.user_role, text) to wok_app;
grant execute on function app.find_login(text) to wok_app;
grant execute on function app.touch_last_login(uuid) to wok_app;
