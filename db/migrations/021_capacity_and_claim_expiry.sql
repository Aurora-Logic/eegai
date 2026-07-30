-- 021 — the two rules that stop the wall filling with dead claims.
--
-- Both were designed and neither was enforced. `ngos.monthly_capacity` has been
-- stored, shown and edited since M0 without a single line reading it, and
-- `donations.claim_expires_at` has been written on every claim for just as long
-- with nothing ever looking at it. A column that is written and never read is a
-- promise the product does not keep.
--
-- They matter for the same reason: a claim makes an item invisible to every
-- other organisation. An organisation that claims two hundred items it cannot
-- collect does not merely fail to collect them — it blocks two hundred items
-- from organisations that could.

/**
 * How many items this organisation has claimed this calendar month.
 *
 * SECURITY DEFINER with row_security off because the count must be honest even
 * when a policy would hide a row from the caller. Deliberately a *separate*
 * function rather than making claim_donation itself definer: claim_donation
 * relies on RLS to stop an organisation claiming an item outside its radius,
 * and turning that off would quietly remove the check.
 *
 * Counted from the start of the calendar month, not a rolling 30 days. "Fifty a
 * month" means a month, and a rolling window would let capacity creep.
 */
create or replace function app.ngo_claims_this_month(p_ngo_id uuid)
returns integer
language sql
stable
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
  select count(*)::integer
  from public.donations d
  where d.claimed_by_ngo_id = p_ngo_id
    and d.claimed_at >= date_trunc('month', now())
    -- A claim the organisation cancelled or that expired back to the wall did
    -- not consume their capacity; they never received it.
    and d.status <> 'cancelled';
$$;

revoke all on function app.ngo_claims_this_month(uuid) from public;
grant execute on function app.ngo_claims_this_month(uuid) to eegai_app;

create or replace function app.claim_donation(p_donation_id uuid, p_ngo_id uuid)
returns setof public.donations
language plpgsql
as $$
declare
  v_id uuid;
  v_capacity integer;
  v_used integer;
begin
  -- Capacity first, before the row lock. Refusing after taking the lock would
  -- hold it for nothing and make a losing claim slower than a winning one.
  select monthly_capacity into v_capacity from public.ngos where id = p_ngo_id;

  if v_capacity is not null and v_capacity > 0 then
    v_used := app.ngo_claims_this_month(p_ngo_id);
    if v_used >= v_capacity then
      -- Raised rather than returned empty, because "you are full" and "somebody
      -- else got there first" are different facts and an organisation that
      -- cannot tell them apart will keep trying.
      raise exception 'monthly capacity reached: % of %', v_used, v_capacity
        using errcode = 'check_violation';
    end if;
  end if;

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
      -- The NGO has 48h to arrange collection before it goes back on the wall.
      claim_expires_at = now() + interval '48 hours'
  where id = v_id
  returning *;
end;
$$;

grant execute on function app.claim_donation(uuid, uuid) to eegai_app;

/**
 * Put expired claims back on the wall.
 *
 * Only `claimed`. Once an item is `scheduled` a volunteer has arranged a slot or
 * a courier has an AWB, and someone is expecting to collect it — releasing that
 * underneath them would strand the item and waste a journey. The 48h window is
 * for arranging collection, and arranging it is exactly what leaving `claimed`
 * means.
 *
 * Runs as the system actor, which is why the state machine permits
 * claimed -> posted for `admin` only.
 */
create or replace function app.release_expired_claims()
returns integer
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_released integer;
begin
  with expired as (
    update public.donations
    set status = 'posted',
        claimed_by_ngo_id = null,
        claimed_at = null,
        claim_expires_at = null
    where status = 'claimed'
      and claim_expires_at is not null
      and claim_expires_at < now()
    returning id
  )
  select count(*)::integer into v_released from expired;

  return v_released;
end;
$$;

revoke all on function app.release_expired_claims() from public;
grant execute on function app.release_expired_claims() to eegai_app;
