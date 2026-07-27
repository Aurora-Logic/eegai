-- 002 — the updated_at convention and the audit log.

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create trigger set_updated_at
  before update on public.audit_log
  for each row execute function app.set_updated_at();

alter table public.audit_log enable row level security;

-- Only an admin can read the trail; nobody writes it directly. Rows arrive
-- solely through the security-definer trigger below, which runs as the table
-- owner and so is not subject to these policies.
create policy audit_log_admin_read on public.audit_log
  for select using (app.is_admin());

grant select on public.audit_log to wok_app;

comment on table public.audit_log is
  'Append-only. Written by app.write_audit(); never updated or deleted by application code.';

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

  -- Never let a password hash reach the audit trail.
  v_before := v_before - 'password_hash';
  v_after := v_after - 'password_hash';

  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (app.current_user_id(), tg_table_name, v_entity_id, lower(tg_op), v_before, v_after);

  return null;
end;
$$;
