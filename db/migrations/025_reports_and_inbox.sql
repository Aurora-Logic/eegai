-- 025 — complaints, and an inbox a donor can actually read.
--
-- Two gaps the developer brief names and the product did not have.
--
-- §4 lists "handle complaints" among the admin must-haves, and there was no
-- way to make one. §7 lists a Notifications screen for the donor app; rows were
-- being written to `notifications` and nobody could see them, which meant the
-- proximity engine in 024 was correct and silent — a donor learned about a
-- request only by opening the app and looking.
--
-- Real push and SMS still need a provider. This is the honest half that works
-- today: the alert is written, and there is somewhere to read it.

-- ---------------------------------------------------------------------------
-- The inbox
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column read_at timestamptz;

create index notifications_unread_idx on public.notifications (profile_id, created_at desc)
  where read_at is null;

/**
 * Mark everything currently in the inbox as read.
 *
 * Takes no id: opening the screen is the act, and a per-row tick is a control
 * nobody uses. The `<= now()` is deliberate — anything that arrives while the
 * screen is open stays unread rather than being silently swallowed.
 */
create or replace function app.mark_notifications_read()
returns integer
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_count integer;
begin
  update public.notifications n
  set read_at = now()
  where n.read_at is null
    and n.created_at <= now()
    and n.profile_id in (select id from public.profiles where user_id = app.current_user_id());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Complaints
--
-- One table for both lanes. A complaint about a hospital that never turned up
-- and a complaint about an item that arrived ruined are the same shape of
-- thing — somebody was let down and an admin has to look — and two tables
-- would mean two queues and one of them going unread.
-- ---------------------------------------------------------------------------

create type public.report_subject as enum ('health_request', 'ngo', 'donation', 'profile');

create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,

  subject_type public.report_subject not null,
  -- Not a foreign key: the subject can be any of four tables. The admin screen
  -- resolves it, and a complaint must survive the thing it is about being
  -- cancelled — that is often exactly what the complaint is.
  subject_id uuid,

  detail text not null,
  status public.report_status not null default 'open',
  resolution text,
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reports_detail_present check (btrim(detail) <> '')
);

create index reports_open_idx on public.reports (created_at desc) where status in ('open', 'reviewing');
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

create trigger reports_touch
  before update on public.reports
  for each row execute function app.set_updated_at();

create trigger reports_audit
  after insert or update or delete on public.reports
  for each row execute function app.write_audit();

alter table public.reports enable row level security;

-- Somebody sees their own complaints, so they can tell whether anything
-- happened. They cannot see anyone else's, and cannot edit their own after
-- filing — a complaint that can be rewritten is not evidence of anything.
create policy reports_self_read on public.reports
  for select using (
    reporter_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy reports_admin on public.reports
  for all using (app.is_admin()) with check (app.is_admin());

grant select on public.reports to eegai_app;
grant select, update on public.notifications to eegai_app;

/**
 * File a complaint.
 *
 * SECURITY DEFINER because there is deliberately no INSERT policy: the reporter
 * is taken from the session rather than from the request, so nobody can file
 * one in somebody else's name.
 */
create or replace function app.file_report(
  p_subject_type public.report_subject,
  p_subject_id uuid,
  p_detail text
)
returns uuid
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_id uuid;
begin
  select id into v_profile_id from public.profiles where user_id = app.current_user_id();
  if v_profile_id is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_detail, '')) = '' then
    raise exception 'say what went wrong';
  end if;

  insert into public.reports (reporter_id, subject_type, subject_id, detail)
  values (v_profile_id, p_subject_type, p_subject_id, btrim(p_detail))
  returning id into v_id;

  return v_id;
end;
$$;

/** Move a complaint along, with a note saying what was done about it. */
create or replace function app.resolve_report(
  p_report_id uuid,
  p_status public.report_status,
  p_resolution text
)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
begin
  if not app.is_admin() then
    raise exception 'only an admin may handle a complaint'
      using errcode = 'insufficient_privilege';
  end if;

  -- Closing one without saying why leaves the person who complained with
  -- nothing, which is the same as not having a complaints process.
  if p_status in ('resolved', 'dismissed') and btrim(coalesce(p_resolution, '')) = '' then
    raise exception 'say what was done about it';
  end if;

  update public.reports
  set status = p_status,
      resolution = nullif(btrim(coalesce(p_resolution, '')), ''),
      handled_by = (select id from public.profiles where user_id = app.current_user_id()),
      handled_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id;
end;
$$;

revoke all on function app.mark_notifications_read() from public;
revoke all on function app.file_report(public.report_subject, uuid, text) from public;
revoke all on function app.resolve_report(uuid, public.report_status, text) from public;

grant execute on function app.mark_notifications_read() to eegai_app;
grant execute on function app.file_report(public.report_subject, uuid, text) to eegai_app;
grant execute on function app.resolve_report(uuid, public.report_status, text) to eegai_app;
