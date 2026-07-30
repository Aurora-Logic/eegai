-- 022 — a capacity of zero means zero.
--
-- 021 guarded with `if v_capacity is not null and v_capacity > 0`, so an
-- organisation whose capacity was set to 0 skipped the check entirely and could
-- claim without limit. Exactly backwards: 0 is the strongest possible limit, and
-- it is what an operator would set to stop an organisation taking anything more
-- this month without suspending them outright.
--
-- NULL remains "no limit", which is the only value that should mean that.
--
-- Found by a test whose fixture happened to have claimed nothing yet, which set
-- capacity to 0 and then watched the claim succeed.

create or replace function app.claim_donation(p_donation_id uuid, p_ngo_id uuid)
returns setof public.donations
language plpgsql
as $$
declare
  v_id uuid;
  v_capacity integer;
  v_used integer;
begin
  select monthly_capacity into v_capacity from public.ngos where id = p_ngo_id;

  -- Only NULL means unlimited.
  if v_capacity is not null then
    v_used := app.ngo_claims_this_month(p_ngo_id);
    if v_used >= v_capacity then
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
      claim_expires_at = now() + interval '48 hours'
  where id = v_id
  returning *;
end;
$$;

grant execute on function app.claim_donation(uuid, uuid) to eegai_app;
