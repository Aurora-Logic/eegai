-- M0 — foundation: the two things every later table depends on.
--
--   1. set_updated_at()  — the updated_at convention from PLAN.md §6
--   2. audit_log + write_audit() — attached by triggers to donations, ngos and
--      volunteers as those tables land (M2, M3, M7)

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger function. Attach as: create trigger set_updated_at before update on <table> for each row execute function public.set_updated_at();';

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
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
  for each row execute function public.set_updated_at();

-- RLS on from the moment the table exists (PLAN.md §3), with no policies at
-- all. That is a deliberate deny-everything: rows arrive only through the
-- security-definer trigger below, and the admin read policy is added in M1
-- once is_admin() exists to back it.
alter table public.audit_log enable row level security;

-- Belt and braces alongside RLS — no client role writes here directly.
revoke all on public.audit_log from anon, authenticated;

comment on table public.audit_log is
  'Append-only. Written by the write_audit() trigger; never updated or deleted by application code.';

-- ---------------------------------------------------------------------------
-- write_audit
-- ---------------------------------------------------------------------------

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
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

  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (auth.uid(), tg_table_name, v_entity_id, lower(tg_op), v_before, v_after);

  -- AFTER trigger: the return value is discarded, but returning null from an
  -- AFTER trigger is still the correct convention.
  return null;
end;
$$;

comment on function public.write_audit is
  'Trigger function. Attach as: create trigger write_audit after insert or update or delete on <table> for each row execute function public.write_audit();';
