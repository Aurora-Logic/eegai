-- 014 — every rejection and suspension was failing with a 500.
--
-- `audit_log` is granted SELECT to eegai_app and nothing else. That is
-- deliberate and worth keeping: the trail is written by the write_audit trigger,
-- which is SECURITY DEFINER, so no route handler can forge or edit history.
--
-- The admin verify routes did not know that. They inserted the rejection reason
-- into audit_log directly, as the API role, and got "permission denied for table
-- audit_log" — a 500 the operator saw as "That did not go through. Try again."
--
-- It hid for two reasons. Approving skips the insert entirely because there is
-- no reason to record, so the happy path worked. And the e2e test for rejection
-- only asserts that the button is disabled without a reason — it never presses
-- it. A test that stops one step before the write is a test that cannot see this
-- class of bug.
--
-- The fix keeps the property rather than granting INSERT: one function, which
-- writes exactly one shape of row and refuses anyone who is not an admin.

create or replace function app.record_verification_reason(
  p_entity text,
  p_entity_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
begin
  if not app.is_admin() then
    raise exception 'only an admin may record a verification reason';
  end if;

  -- Narrow on purpose. This function exists to write one kind of row, so it
  -- cannot be repurposed into a general audit_log writer by a later caller.
  if p_entity not in ('ngos', 'volunteers') then
    raise exception 'verification reasons are only recorded for ngos and volunteers';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a verification reason cannot be empty';
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, after, request_id)
  values (
    app.current_user_id(),
    p_entity,
    p_entity_id,
    'verification_reason',
    jsonb_build_object('status', p_status, 'reason', btrim(p_reason)),
    app.current_request_id()
  );
end;
$$;

revoke all on function app.record_verification_reason(text, uuid, text, text) from public;
grant execute on function app.record_verification_reason(text, uuid, text, text) to eegai_app;

comment on function app.record_verification_reason(text, uuid, text, text) is
  'The only way the API may write to audit_log. Admin-only, one row shape. '
  'audit_log itself stays SELECT-only to eegai_app so history cannot be forged.';
