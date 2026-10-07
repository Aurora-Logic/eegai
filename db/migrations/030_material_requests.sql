-- ===========================================================================
-- 030 — the old categories onto the new ones, and what an organisation needs
--
-- Second half of 029: the values exist now, so rows can move onto them.
--
-- Then the other direction of the wall. Until now an organisation could only
-- wait for whatever a donor happened to post. An NGO that needs 40 school bags
-- in June has no way to say so, and a donor willing to buy them has no way to
-- find out. A material request is that sentence, on the wall, with the same
-- verification and the same contact rules as everything else here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The old six onto the new thirteen.
--
--   clothes   → clothing            toys      → toys_games
--   books     → books (unchanged)   education → stationery
--   furniture → household_bedding   household → kitchen
--
-- Furniture has no home in the new list and household_bedding is the closest
-- thing to it; "household essentials" in the old list meant plates and pans,
-- which is kitchen. Both are judgement calls, recorded here rather than left
-- for somebody to reverse-engineer from the data.
-- ---------------------------------------------------------------------------

update public.donations
set category = case category
                 when 'clothes' then 'clothing'
                 when 'toys' then 'toys_games'
                 when 'education' then 'stationery'
                 when 'furniture' then 'household_bedding'
                 when 'household' then 'kitchen'
                 else category
               end::public.donation_category
where category in ('clothes', 'toys', 'education', 'furniture', 'household');

update public.ngos
set accepts_categories = (
  select coalesce(array_agg(distinct mapped order by mapped), '{}')
  from unnest(accepts_categories) as c,
  lateral (
    select case c::text
             when 'clothes' then 'clothing'
             when 'toys' then 'toys_games'
             when 'education' then 'stationery'
             when 'furniture' then 'household_bedding'
             when 'household' then 'kitchen'
             else c::text
           end::public.donation_category
  ) as m(mapped)
);

-- A hospital accepts no material at all, and an NGO that only takes hair
-- should not have to claim it takes furniture. The default stays for ordinary
-- signups; what changes is that empty is now a legitimate state (the form-level
-- "at least one" rule is gone in the same change).
alter table public.ngos
  alter column accepts_categories set default '{}'::public.donation_category[];

update public.ngos set accepts_categories = '{}'::public.donation_category[]
where org_type = 'hospital';

-- ---------------------------------------------------------------------------
-- What an organisation says it handles, before an admin has granted it.
--
-- The spec asks a hospital to pick blood, hair or breast milk at registration,
-- while everything in this product is still verified by an admin. Both hold:
-- this is the asking, health_categories remains the granting, and the
-- verification queue shows the one beside the other.
-- ---------------------------------------------------------------------------
alter table public.ngos
  add column if not exists requested_health_categories public.health_category[]
    not null default '{}';

comment on column public.ngos.requested_health_categories is
  'What the organisation asked for at registration. health_categories is what an admin granted.';

-- ---------------------------------------------------------------------------
-- What an organisation needs
--
-- Name and area are copied from the organisation at posting time, exactly as
-- health_requests does and for the same reason: a donor must be able to read
-- who is asking without being able to read the `ngos` table, and an inner join
-- through a table RLS closes silently drops the row instead of erroring. That
-- shape has already cost this codebase two bugs.
-- ---------------------------------------------------------------------------

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.ngos (id) on delete cascade,
  organisation_name text not null,

  category public.donation_category not null,
  title text not null,
  quantity integer not null default 1 check (quantity between 1 and 10000),
  note text,

  pincode text,
  lat double precision,
  lng double precision,

  status public.health_request_status not null default 'open',
  expires_at timestamptz not null,
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index material_requests_open on public.material_requests (status, created_at desc);
create index material_requests_ngo on public.material_requests (ngo_id, created_at desc);

alter table public.material_requests enable row level security;

grant select on public.material_requests to eegai_app;

create trigger set_updated_at
  before update on public.material_requests
  for each row execute function app.set_updated_at();

create trigger material_requests_audit
  after insert or update or delete on public.material_requests
  for each row execute function app.write_audit();

-- Everyone signed in can read an open request: a donor has to see what is
-- needed, and there is nothing private in it — the organisation's own name,
-- area and the thing it is asking for.
create policy material_requests_open_read on public.material_requests
  for select using (status = 'open' or app.is_admin());

create policy material_requests_own on public.material_requests
  for select using (
    ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy material_requests_admin_all on public.material_requests
  for all using (app.is_admin()) with check (app.is_admin());

/**
 * Post what the organisation needs.
 *
 * Verified organisations only, and not hospitals: material is the NGO half of
 * the product, and a hospital asking for school bags is a sign something has
 * been mis-registered rather than a case to support.
 */
create or replace function app.post_material_request(
  p_category public.donation_category,
  p_title text,
  p_quantity integer,
  p_note text,
  p_expires_in_days integer default 30
)
returns uuid
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_ngo public.ngos;
  v_id uuid;
begin
  select n.* into v_ngo
  from public.ngos n
  join public.profiles p on p.id = n.profile_id
  where p.user_id = app.current_user_id();

  if v_ngo.id is null then
    raise exception 'only an organisation can ask for material'
      using errcode = 'insufficient_privilege';
  end if;

  if v_ngo.verification_status <> 'verified' then
    raise exception 'your organisation is not verified yet';
  end if;

  if v_ngo.org_type = 'hospital' then
    raise exception 'a hospital asks for blood here, not material';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'say what you need';
  end if;

  insert into public.material_requests
    (ngo_id, organisation_name, category, title, quantity, note,
     pincode, lat, lng, expires_at)
  values
    (v_ngo.id, v_ngo.name, p_category, btrim(p_title),
     greatest(1, coalesce(p_quantity, 1)), nullif(btrim(coalesce(p_note, '')), ''),
     v_ngo.pincode, v_ngo.lat, v_ngo.lng,
     now() + make_interval(days => greatest(1, least(coalesce(p_expires_in_days, 30), 180))))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.post_material_request(
  public.donation_category, text, integer, text, integer) from public;
grant execute on function app.post_material_request(
  public.donation_category, text, integer, text, integer) to eegai_app;

/** Close one. The owner or an admin, same as a blood alert. */
create or replace function app.close_material_request(
  p_request_id uuid,
  p_status public.health_request_status
)
returns boolean
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_owner boolean;
begin
  select exists (
    select 1 from public.material_requests mr
    join public.ngos n on n.id = mr.ngo_id
    join public.profiles p on p.id = n.profile_id
    where mr.id = p_request_id and p.user_id = app.current_user_id()
  ) into v_owner;

  if not v_owner and not app.is_admin() then
    raise exception 'that request is not yours' using errcode = 'insufficient_privilege';
  end if;

  update public.material_requests
  set status = p_status, closed_at = now()
  where id = p_request_id and status = 'open';

  return found;
end;
$$;

revoke all on function app.close_material_request(uuid, public.health_request_status) from public;
grant execute on function app.close_material_request(uuid, public.health_request_status) to eegai_app;
