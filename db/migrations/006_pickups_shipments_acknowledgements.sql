-- 006 — how the item actually moves: volunteer pickup, courier shipment, and
-- the NGO's acknowledgement at the far end.

create table public.pickups (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references public.donations (id) on delete cascade,
  volunteer_id uuid references public.volunteers (id),
  slot_date date,
  slot public.pickup_slot,
  -- bcrypt digests, never the codes themselves. Column-level grants below stop
  -- the API role from reading these at all.
  collect_otp text,
  deliver_otp text,
  collect_attempts integer not null default 0,
  deliver_attempts integer not null default 0,
  collected_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pickups_volunteer_idx on public.pickups (volunteer_id);
create index pickups_unassigned_idx on public.pickups (created_at) where volunteer_id is null;

create trigger set_updated_at
  before update on public.pickups
  for each row execute function app.set_updated_at();

alter table public.pickups enable row level security;

create policy pickups_volunteer_own on public.pickups
  for all using (
    volunteer_id in (
      select v.id from public.volunteers v
      join public.profiles p on p.id = v.profile_id
      where p.user_id = app.current_user_id()
    )
  )
  with check (
    volunteer_id in (
      select v.id from public.volunteers v
      join public.profiles p on p.id = v.profile_id
      where p.user_id = app.current_user_id()
    )
  );

-- Unassigned pickups inside a verified volunteer's service radius.
create policy pickups_volunteer_open on public.pickups
  for select using (
    volunteer_id is null
    and exists (
      select 1
      from public.volunteers v
      join public.profiles p on p.id = v.profile_id
      join public.donations d on d.id = pickups.donation_id
      where p.user_id = app.current_user_id()
        and v.verification_status = 'verified'
        and (
          d.lat is null or d.lng is null or p.lat is null or p.lng is null
          or app.distance_km(d.lat, d.lng, p.lat, p.lng) <= v.service_radius_km
        )
    )
  );

-- The donor and the claiming NGO can both see the pickup for their own item.
create policy pickups_party_read on public.pickups
  for select using (
    exists (select 1 from public.donations d where d.id = pickups.donation_id)
  );

create policy pickups_admin_all on public.pickups
  for all using (app.is_admin()) with check (app.is_admin());

-- Column-level grant: the API role is structurally unable to SELECT either OTP
-- column, so no bug in a route handler can leak one into a response.
grant select (
  id, donation_id, volunteer_id, slot_date, slot,
  collect_attempts, deliver_attempts, collected_at, delivered_at,
  created_at, updated_at
) on public.pickups to wok_app;
grant insert, update, delete on public.pickups to wok_app;

-- ---------------------------------------------------------------------------
-- OTP issue and verify — both server-side only (PLAN.md §M4)
-- ---------------------------------------------------------------------------

create or replace function app.issue_pickup_otps(p_donation_id uuid)
returns table (collect_code text, deliver_code text)
language plpgsql
security definer
set search_path = public, app, pg_catalog, extensions
as $$
declare
  v_collect text := lpad((floor(random() * 10000))::int::text, 4, '0');
  v_deliver text := lpad((floor(random() * 10000))::int::text, 4, '0');
begin
  update public.pickups
  set collect_otp = crypt(v_collect, gen_salt('bf', 8)),
      deliver_otp = crypt(v_deliver, gen_salt('bf', 8)),
      collect_attempts = 0,
      deliver_attempts = 0
  where donation_id = p_donation_id;

  if not found then
    raise exception 'no pickup for donation %', p_donation_id;
  end if;

  -- Returned once, to the caller that will hand them to the SMS pipeline.
  -- They are not readable again from anywhere.
  return query select v_collect, v_deliver;
end;
$$;

-- `p_gate` is 'collect' or 'deliver'. Returns true only on a match; six wrong
-- attempts invalidate the code and it must be reissued.
create or replace function app.verify_pickup_otp(
  p_donation_id uuid,
  p_gate text,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog, extensions
as $$
declare
  v_hash text;
  v_attempts integer;
  v_ok boolean;
begin
  if p_gate not in ('collect', 'deliver') then
    raise exception 'unknown OTP gate %', p_gate;
  end if;

  select case when p_gate = 'collect' then collect_otp else deliver_otp end,
         case when p_gate = 'collect' then collect_attempts else deliver_attempts end
    into v_hash, v_attempts
  from public.pickups
  where donation_id = p_donation_id
  for update;

  if v_hash is null then
    return false;
  end if;

  if v_attempts >= 6 then
    -- Burn the code rather than allowing an unbounded guessing window.
    if p_gate = 'collect' then
      update public.pickups set collect_otp = null where donation_id = p_donation_id;
    else
      update public.pickups set deliver_otp = null where donation_id = p_donation_id;
    end if;
    return false;
  end if;

  v_ok := (v_hash = crypt(p_code, v_hash));

  if v_ok then
    if p_gate = 'collect' then
      update public.pickups
      set collected_at = now(), collect_otp = null, collect_attempts = 0
      where donation_id = p_donation_id;
    else
      update public.pickups
      set delivered_at = now(), deliver_otp = null, deliver_attempts = 0
      where donation_id = p_donation_id;
    end if;
  else
    if p_gate = 'collect' then
      update public.pickups set collect_attempts = collect_attempts + 1
      where donation_id = p_donation_id;
    else
      update public.pickups set deliver_attempts = deliver_attempts + 1
      where donation_id = p_donation_id;
    end if;
  end if;

  return v_ok;
end;
$$;

revoke all on function app.issue_pickup_otps(uuid) from public;
revoke all on function app.verify_pickup_otp(uuid, text, text) from public;
grant execute on function app.issue_pickup_otps(uuid) to wok_app;
grant execute on function app.verify_pickup_otp(uuid, text, text) to wok_app;

-- ---------------------------------------------------------------------------
-- shipments
-- ---------------------------------------------------------------------------

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references public.donations (id) on delete cascade,
  provider text not null,
  awb_number text,
  label_url text,
  fee_paise integer,
  paid_by text,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_fee_sane check (fee_paise is null or fee_paise >= 0)
);

create index shipments_awb_idx on public.shipments (awb_number);

create trigger set_updated_at
  before update on public.shipments
  for each row execute function app.set_updated_at();

alter table public.shipments enable row level security;

create policy shipments_party_read on public.shipments
  for select using (
    exists (select 1 from public.donations d where d.id = shipments.donation_id)
  );

create policy shipments_admin_all on public.shipments
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update on public.shipments to wok_app;

-- ---------------------------------------------------------------------------
-- acknowledgements — the loop back to the donor
-- ---------------------------------------------------------------------------

create table public.acknowledgements (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references public.donations (id) on delete cascade,
  ngo_id uuid not null references public.ngos (id),
  photo_path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.acknowledgements
  for each row execute function app.set_updated_at();

alter table public.acknowledgements enable row level security;

-- Visible to the donor of that item and the NGO that wrote it, nobody else.
-- Relies on the donations policies to decide who can see the parent row.
create policy acknowledgements_party_read on public.acknowledgements
  for select using (
    exists (select 1 from public.donations d where d.id = acknowledgements.donation_id)
  );

create policy acknowledgements_ngo_write on public.acknowledgements
  for all using (
    ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  )
  with check (
    ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy acknowledgements_admin_all on public.acknowledgements
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update on public.acknowledgements to wok_app;
