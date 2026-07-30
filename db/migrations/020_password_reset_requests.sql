-- 020 — a user can ask for their password to be reset.
--
-- There is no SMS gateway, so the usual "we've emailed you a link" is not
-- available: there is nowhere to send it. The honest alternative is the channel
-- that already exists — the person asks, an admin sees the request, resets it
-- from the People tab and reads the new password out. That is the same reasoning
-- that put handover codes in the app rather than in a text message.
--
-- The request stores only the phone number that was typed. Deliberately not a
-- profile id: resolving the number to an account here would mean the endpoint
-- behaves differently for a number that exists, and anyone could then use it to
-- discover which numbers are registered. The admin does the matching, looking at
-- a real person's record.

create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  -- What the person said, if anything. An admin ringing back benefits from
  -- "I've changed phones" more than from a bare number.
  note text,
  handled_at timestamptz,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint password_reset_phone_shape check (phone ~ '^[6-9][0-9]{9}$')
);

create index password_reset_open_idx on public.password_reset_requests (created_at)
  where handled_at is null;

alter table public.password_reset_requests enable row level security;

-- Only admins read these. There is no policy for anyone else, so a signed-in
-- user cannot enumerate who has been locked out.
create policy password_reset_admin on public.password_reset_requests
  for all using (app.is_admin()) with check (app.is_admin());

grant select, update on public.password_reset_requests to eegai_app;

/**
 * Record a request. Callable by anyone, including signed-out visitors, which is
 * the whole point — someone who cannot sign in cannot be asked to sign in first.
 *
 * Returns nothing. The endpoint answers identically whether or not the number is
 * registered, so this cannot be used to test which numbers have accounts.
 */
create or replace function app.request_password_reset(p_phone text, p_note text default null)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
begin
  -- One open request per number. Somebody tapping the button four times should
  -- produce one item in the admin queue, not four.
  if exists (
    select 1 from public.password_reset_requests
    where phone = p_phone and handled_at is null
  ) then
    update public.password_reset_requests
    set note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
        created_at = now()
    where phone = p_phone and handled_at is null;
    return;
  end if;

  insert into public.password_reset_requests (phone, note)
  values (p_phone, nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

revoke all on function app.request_password_reset(text, text) from public;
grant execute on function app.request_password_reset(text, text) to eegai_app;
