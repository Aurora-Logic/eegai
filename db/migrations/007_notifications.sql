-- 007 — the notification outbox.
--
-- Rows are written inside the state-change transaction; delivery happens
-- afterwards, out of band. That is what makes notifications fire-and-forget
-- relative to the transaction (PLAN.md §M8) — a dead SMS provider can never
-- roll back a state change.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel public.notification_channel not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The dispatcher's queue query: unsent, oldest first.
create index notifications_pending_idx on public.notifications (created_at)
  where sent_at is null;
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);

create trigger set_updated_at
  before update on public.notifications
  for each row execute function app.set_updated_at();

alter table public.notifications enable row level security;

create policy notifications_self_read on public.notifications
  for select using (
    profile_id in (select id from public.profiles where user_id = app.current_user_id())
  );

create policy notifications_admin_all on public.notifications
  for all using (app.is_admin()) with check (app.is_admin());

grant select, insert, update on public.notifications to wok_app;
