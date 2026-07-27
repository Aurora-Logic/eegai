-- 005 — donations and their photos.
--
-- This is where the wall's visibility rule lives. An NGO sees a posted item
-- only if it matches their categories AND falls inside the item's current
-- radius. That is enforced in RLS, not in a WHERE clause, so a hand-written
-- query cannot accidentally widen it.

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  category public.donation_category not null,
  quantity integer not null default 1,
  condition public.donation_condition not null,
  -- The answers to the §M2 gates, kept for dispute resolution.
  condition_checklist jsonb not null default '{}'::jsonb,
  pickup_address text,
  pincode text,
  lat double precision,
  lng double precision,
  status public.donation_status not null default 'posted',
  claimed_by_ngo_id uuid references public.ngos (id),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  delivery_method public.delivery_method,
  rejected_reason text,
  -- Starts at 10km and widens by 5km after 24h unclaimed (PLAN.md §7).
  visible_radius_km integer not null default 10,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donations_title_present check (length(btrim(title)) > 0),
  constraint donations_quantity_sane check (quantity between 1 and 500),
  constraint donations_radius_sane check (visible_radius_km between 1 and 100),
  constraint donations_pincode_valid check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  -- A claimed item must know who claimed it, and an unclaimed one must not.
  constraint donations_claim_coherent check (
    (status in ('posted', 'cancelled') and claimed_by_ngo_id is null)
    or (status not in ('posted', 'cancelled') and claimed_by_ngo_id is not null)
  ),
  constraint donations_rejection_has_reason check (
    status <> 'rejected' or length(btrim(coalesce(rejected_reason, ''))) > 0
  )
);

create index donations_status_idx on public.donations (status);
create index donations_donor_idx on public.donations (donor_id, created_at desc);
create index donations_claimed_idx on public.donations (claimed_by_ngo_id) where claimed_by_ngo_id is not null;
-- The wall query filters posted items by category; this is the index it uses.
create index donations_wall_idx on public.donations (status, category) where status = 'posted';

create trigger set_updated_at
  before update on public.donations
  for each row execute function app.set_updated_at();

create trigger write_audit
  after insert or update or delete on public.donations
  for each row execute function app.write_audit();

alter table public.donations enable row level security;

-- Donors: full control of their own items only.
create policy donations_donor_all on public.donations
  for all using (
    donor_id in (select id from public.profiles where user_id = app.current_user_id())
  )
  with check (
    donor_id in (select id from public.profiles where user_id = app.current_user_id())
  );

-- NGOs: the wall. Category match AND inside the item's current radius.
create policy donations_ngo_wall on public.donations
  for select using (
    status = 'posted'
    and exists (
      select 1
      from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
        and n.verification_status = 'verified'
        and n.is_accepting
        and donations.category = any (n.accepts_categories)
        and (
          -- An item with no coordinates is visible to every matching NGO
          -- rather than invisible to all of them.
          donations.lat is null or donations.lng is null or n.lat is null or n.lng is null
          or app.distance_km(donations.lat, donations.lng, n.lat, n.lng)
             <= donations.visible_radius_km
        )
    )
  );

-- NGOs keep visibility of anything they claimed, whatever its state.
create policy donations_ngo_claimed on public.donations
  for select using (
    claimed_by_ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy donations_ngo_update_claimed on public.donations
  for update using (
    claimed_by_ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  )
  with check (
    claimed_by_ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

create policy donations_admin_all on public.donations
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update, delete on public.donations to wok_app;

-- ---------------------------------------------------------------------------
-- donation_photos — 1 to 5 per donation (PLAN.md §6)
-- ---------------------------------------------------------------------------

create table public.donation_photos (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_photos_sort_sane check (sort_order between 0 and 4),
  unique (donation_id, sort_order)
);

create index donation_photos_donation_idx on public.donation_photos (donation_id, sort_order);

create trigger set_updated_at
  before update on public.donation_photos
  for each row execute function app.set_updated_at();

-- "At least one" cannot be a row-level CHECK, because at INSERT time of the
-- first photo the donation row already exists with zero. A deferred constraint
-- trigger evaluates at COMMIT, by which point the whole post is in place.
create or replace function app.check_photo_count()
returns trigger
language plpgsql
as $$
declare
  v_donation_id uuid := coalesce(new.donation_id, old.donation_id);
  v_count integer;
  v_status public.donation_status;
begin
  select status into v_status from public.donations where id = v_donation_id;

  -- The donation may have been deleted in the same transaction; nothing to check.
  if not found then
    return null;
  end if;

  select count(*) into v_count from public.donation_photos where donation_id = v_donation_id;

  if v_count > 5 then
    raise exception 'a donation may have at most 5 photos, found %', v_count
      using errcode = 'check_violation';
  end if;

  -- Cancelled items are allowed to end up with none.
  if v_count < 1 and v_status <> 'cancelled' then
    raise exception 'a donation must have at least 1 photo'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger check_photo_count
  after insert or delete on public.donation_photos
  deferrable initially deferred
  for each row execute function app.check_photo_count();

alter table public.donation_photos enable row level security;

-- Photos inherit their donation's visibility exactly — no separate rule to
-- drift out of sync with the wall policy above.
create policy donation_photos_follow_donation on public.donation_photos
  for select using (
    exists (select 1 from public.donations d where d.id = donation_photos.donation_id)
  );

create policy donation_photos_donor_write on public.donation_photos
  for all using (
    exists (
      select 1 from public.donations d
      join public.profiles p on p.id = d.donor_id
      where d.id = donation_photos.donation_id and p.user_id = app.current_user_id()
    )
  )
  with check (
    exists (
      select 1 from public.donations d
      join public.profiles p on p.id = d.donor_id
      where d.id = donation_photos.donation_id and p.user_id = app.current_user_id()
    )
  );

create policy donation_photos_admin on public.donation_photos
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update, delete on public.donation_photos to wok_app;
