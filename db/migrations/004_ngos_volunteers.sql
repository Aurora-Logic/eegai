-- 004 — the two verified parties: NGOs and volunteers.

create table public.ngos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null,
  registration_number text,
  darpan_id text,
  has_80g boolean not null default false,
  address text,
  pincode text,
  lat double precision,
  lng double precision,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  monthly_capacity integer not null default 50,
  accepts_categories public.donation_category[] not null default
    '{clothes,books,toys}'::public.donation_category[],
  contact_person text,
  contact_phone text,
  -- The NGO's own pause switch, separate from admin suspension.
  is_accepting boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ngos_capacity_sane check (monthly_capacity between 0 and 10000),
  constraint ngos_categories_present check (cardinality(accepts_categories) > 0),
  constraint ngos_pincode_valid check (pincode is null or pincode ~ '^[1-9][0-9]{5}$')
);

create index ngos_status_idx on public.ngos (verification_status);
create index ngos_accepting_idx on public.ngos (is_accepting) where is_accepting;

create trigger set_updated_at
  before update on public.ngos
  for each row execute function app.set_updated_at();

create trigger write_audit
  after insert or update or delete on public.ngos
  for each row execute function app.write_audit();

alter table public.ngos enable row level security;

create policy ngos_self_read on public.ngos
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy ngos_self_update on public.ngos
  for update using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  )
  with check (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy ngos_admin_all on public.ngos
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update on public.ngos to wok_app;

-- An NGO must not verify itself. Same shape as the profiles role guard.
create or replace function app.guard_ngo_verification()
returns trigger
language plpgsql
as $$
begin
  if new.verification_status is distinct from old.verification_status and not app.is_admin() then
    raise exception 'verification status may only be changed by an admin'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger guard_ngo_verification
  before update on public.ngos
  for each row execute function app.guard_ngo_verification();

-- ---------------------------------------------------------------------------
-- ngo_documents — admin-only, full stop (PLAN.md §6)
-- ---------------------------------------------------------------------------

create table public.ngo_documents (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.ngos (id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ngo_documents_ngo_idx on public.ngo_documents (ngo_id);

create trigger set_updated_at
  before update on public.ngo_documents
  for each row execute function app.set_updated_at();

alter table public.ngo_documents enable row level security;

-- The uploading NGO may add and see its own documents; nobody else but an
-- admin may read them. There is deliberately no cross-NGO read path at all.
create policy ngo_documents_owner on public.ngo_documents
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

create policy ngo_documents_admin on public.ngo_documents
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update on public.ngo_documents to wok_app;

-- ---------------------------------------------------------------------------
-- volunteers
-- ---------------------------------------------------------------------------

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  id_doc_path text,
  selfie_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  service_radius_km integer not null default 8,
  available_slots jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteers_radius_sane check (service_radius_km between 1 and 50)
);

create index volunteers_status_idx on public.volunteers (verification_status);

create trigger set_updated_at
  before update on public.volunteers
  for each row execute function app.set_updated_at();

create trigger write_audit
  after insert or update or delete on public.volunteers
  for each row execute function app.write_audit();

alter table public.volunteers enable row level security;

create policy volunteers_self_read on public.volunteers
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy volunteers_self_update on public.volunteers
  for update using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  )
  with check (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy volunteers_admin_all on public.volunteers
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update on public.volunteers to wok_app;

create trigger guard_volunteer_verification
  before update on public.volunteers
  for each row execute function app.guard_ngo_verification();
