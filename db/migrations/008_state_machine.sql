-- 008 — the donation state machine, mirrored in the database.
--
-- src/lib/state-machine.ts holds the same map for the UI. This one is the
-- backstop: even a direct psql UPDATE cannot move an item along an edge that
-- does not exist. PLAN.md §7 marks the machine LOCKED, so both copies change
-- together or not at all.

create table app.donation_transitions (
  from_status public.donation_status not null,
  to_status public.donation_status not null,
  allowed_roles public.user_role[] not null,
  primary key (from_status, to_status)
);

insert into app.donation_transitions (from_status, to_status, allowed_roles) values
  -- The happy path.
  ('posted',     'claimed',      '{ngo,admin}'),
  ('claimed',    'scheduled',    '{donor,ngo,volunteer,admin}'),
  ('scheduled',  'in_transit',   '{donor,volunteer,admin}'),
  ('in_transit', 'received',     '{ngo,admin}'),
  ('received',   'acknowledged', '{ngo,admin}'),

  -- Returns. A claim that expires goes back on the wall; a cancelled pickup
  -- drops back to claimed rather than losing the NGO.
  ('claimed',    'posted',       '{admin}'),
  ('scheduled',  'claimed',      '{donor,ngo,volunteer,admin}'),

  -- Donor cancellation, allowed only before the item is moving.
  ('posted',     'cancelled',    '{donor,admin}'),
  ('claimed',    'cancelled',    '{donor,admin}'),
  ('scheduled',  'cancelled',    '{donor,admin}'),

  -- NGO rejection on arrival, reason mandatory (enforced by a table CHECK).
  ('received',   'rejected',     '{ngo,admin}');

comment on table app.donation_transitions is
  'The LOCKED state machine from PLAN.md §7. Mirrored in src/lib/state-machine.ts.';

grant select on app.donation_transitions to wok_app;

create or replace function app.guard_donation_transition()
returns trigger
language plpgsql
as $$
declare
  v_role public.user_role := app.current_user_role();
  v_allowed public.user_role[];
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select allowed_roles into v_allowed
  from app.donation_transitions
  where from_status = old.status and to_status = new.status;

  if v_allowed is null then
    raise exception 'illegal transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- A null role means no session was established. Background jobs set
  -- app.user_role explicitly; anything else is a bug and must fail closed.
  if v_role is null or not (v_role = any (v_allowed)) then
    raise exception 'role % may not move a donation from % to %',
      coalesce(v_role::text, 'anonymous'), old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger guard_donation_transition
  before update on public.donations
  for each row execute function app.guard_donation_transition();

-- ---------------------------------------------------------------------------
-- Claiming — first-claim-wins (PLAN.md §7)
-- ---------------------------------------------------------------------------

-- The initial claim needs an UPDATE path that the "already ours" policy in 005
-- cannot provide: at that moment claimed_by_ngo_id is still null. USING sees
-- the pre-update row, WITH CHECK the post-update one.
create policy donations_ngo_claim on public.donations
  for update using (
    status = 'posted'
    and exists (
      select 1
      from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
        and n.verification_status = 'verified'
        and n.is_accepting
        and donations.category = any (n.accepts_categories)
    )
  )
  with check (
    claimed_by_ngo_id in (
      select n.id from public.ngos n
      join public.profiles p on p.id = n.profile_id
      where p.user_id = app.current_user_id()
    )
  );

/*
 * Returns the claimed row, or no row if someone else got there first.
 *
 * SKIP LOCKED is the whole point: two NGOs pressing "Claim this" in the same
 * instant both reach the SELECT, one takes the row lock, and the other skips
 * the row rather than blocking on it and then claiming a donation that is no
 * longer posted. The loser gets a clean "already claimed" instead of a wait
 * followed by a confusing success.
 */
create or replace function app.claim_donation(p_donation_id uuid, p_ngo_id uuid)
returns setof public.donations
language plpgsql
as $$
declare
  v_id uuid;
begin
  select d.id into v_id
  from public.donations d
  where d.id = p_donation_id
    and d.status = 'posted'
  for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update public.donations
  set status = 'claimed',
      claimed_by_ngo_id = p_ngo_id,
      claimed_at = now(),
      -- The NGO has 48h to arrange collection before an admin can recycle it.
      claim_expires_at = now() + interval '48 hours'
  where id = v_id
  returning *;
end;
$$;

grant execute on function app.claim_donation(uuid, uuid) to wok_app;

-- ---------------------------------------------------------------------------
-- Claim expiry (PLAN.md §7): widen at 24h, return to donor at 72h.
-- Driven by a scheduled call from the API, every 15 minutes.
-- ---------------------------------------------------------------------------

create or replace function app.expire_stale_posts()
returns table (widened integer, returned integer)
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_widened integer := 0;
  v_returned integer := 0;
begin
  -- Unclaimed for 24h: widen the radius by 5km, once.
  update public.donations
  set visible_radius_km = least(visible_radius_km + 5, 100)
  where status = 'posted'
    and posted_at < now() - interval '24 hours'
    and posted_at >= now() - interval '72 hours'
    and visible_radius_km < 15;
  get diagnostics v_widened = row_count;

  -- Unclaimed for 72h: hand it back with a "no NGO nearby" notification.
  insert into public.notifications (profile_id, channel, template_key, payload)
  select d.donor_id, 'sms', 'no_ngo_nearby', jsonb_build_object('donation_id', d.id, 'title', d.title)
  from public.donations d
  where d.status = 'posted'
    and d.posted_at < now() - interval '72 hours';
  get diagnostics v_returned = row_count;

  return query select v_widened, v_returned;
end;
$$;

grant execute on function app.expire_stale_posts() to wok_app;
