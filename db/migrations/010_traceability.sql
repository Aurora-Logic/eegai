-- 010 — make every mutation attributable.
--
-- Two gaps closed:
--
--   1. audit_log had no way to tie a row back to the HTTP request that caused
--      it. A request id now flows from the API through a GUC into every audit
--      row, so a donor's screenshot maps to one request, one log line, and
--      every database change it made.
--
--   2. write_audit was only attached to donations, ngos, volunteers and
--      profiles. pickups, shipments, acknowledgements and users were invisible
--      — which is exactly where a dispute about a lost item would need to look.

alter table public.audit_log add column request_id text;

create index audit_log_request_idx on public.audit_log (request_id)
  where request_id is not null;

create or replace function app.current_request_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.request_id', true), '');
$$;

-- Rewritten to stamp the request id. Everything else is unchanged, including
-- the password_hash stripping, which now matters more because users is audited.
create or replace function app.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_entity_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'DELETE' then
    v_entity_id := old.id;
    v_before := to_jsonb(old);
    v_after := null;
  elsif tg_op = 'INSERT' then
    v_entity_id := new.id;
    v_before := null;
    v_after := to_jsonb(new);
  else
    v_entity_id := new.id;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  end if;

  -- Never let a credential or a live OTP reach the trail. The audit log is the
  -- one table an admin can read wholesale, so it must not become a side channel.
  v_before := v_before - 'password_hash' - 'collect_otp' - 'deliver_otp';
  v_after := v_after - 'password_hash' - 'collect_otp' - 'deliver_otp';

  insert into public.audit_log (
    actor_id, entity, entity_id, action, before, after, request_id
  )
  values (
    app.current_user_id(), tg_table_name, v_entity_id, lower(tg_op),
    v_before, v_after, app.current_request_id()
  );

  return null;
end;
$$;

-- The four tables that were not being audited.
create trigger write_audit
  after insert or update or delete on public.pickups
  for each row execute function app.write_audit();

create trigger write_audit
  after insert or update or delete on public.shipments
  for each row execute function app.write_audit();

create trigger write_audit
  after insert or update or delete on public.acknowledgements
  for each row execute function app.write_audit();

create trigger write_audit
  after insert or update or delete on public.users
  for each row execute function app.write_audit();

-- ---------------------------------------------------------------------------
-- donation_events — the audit trail as a human timeline
--
-- audit_log holds raw before/after jsonb, which is right for forensics and
-- useless in a UI. This renders the subset that matters into one sentence per
-- row: what happened, to what, by whom, when. The admin dispute view and the
-- donor timeline both read from here rather than re-deriving it.
-- ---------------------------------------------------------------------------

create or replace view public.donation_events as
select
  a.id,
  a.entity_id as donation_id,
  a.created_at,
  a.actor_id,
  a.request_id,
  case
    when a.entity = 'donations' and a.action = 'insert' then 'posted'
    when a.entity = 'donations' and a.before ->> 'status' is distinct from a.after ->> 'status'
      then a.after ->> 'status'
    when a.entity = 'pickups' and a.action = 'insert' then 'pickup_created'
    when a.entity = 'pickups' and (a.before ->> 'collected_at') is null
      and (a.after ->> 'collected_at') is not null then 'collected'
    when a.entity = 'pickups' and (a.before ->> 'delivered_at') is null
      and (a.after ->> 'delivered_at') is not null then 'delivered'
    when a.entity = 'acknowledgements' and a.action = 'insert' then 'acknowledged'
    when a.entity = 'shipments' and a.action = 'insert' then 'shipment_created'
    else a.entity || '_' || a.action
  end as event,
  a.before ->> 'status' as from_status,
  a.after ->> 'status' as to_status
from public.audit_log a
where a.entity in ('donations', 'pickups', 'shipments', 'acknowledgements')
  and (
    a.action = 'insert'
    or a.before ->> 'status' is distinct from a.after ->> 'status'
    or (a.before ->> 'collected_at') is distinct from (a.after ->> 'collected_at')
    or (a.before ->> 'delivered_at') is distinct from (a.after ->> 'delivered_at')
  );

comment on view public.donation_events is
  'Human-readable timeline derived from audit_log. Read by the admin dispute view and the donor timeline.';

-- The view runs as its owner, so audit_log RLS does not apply through it.
-- Access is therefore granted deliberately and narrowly: the API only ever
-- queries it filtered by a donation the caller can already see.
grant select on public.donation_events to eegai_app;
