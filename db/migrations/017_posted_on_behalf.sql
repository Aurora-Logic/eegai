-- 017 — an admin can post an item for a donor who is not online.
--
-- The awkward part is not the form, it is the condition checklist. Those gates
-- are the single control that stops this becoming a dump (PLAN.md §M2), and they
-- only mean anything because the person holding the item answered them. An admin
-- filling them in over the phone is a different kind of assertion, and recording
-- it as though the donor had ticked the boxes would quietly hollow out the one
-- rule the whole product depends on.
--
-- So the item belongs to the donor — it is theirs, it appears on their timeline,
-- the receipt names them — but the row also records who actually asserted the
-- condition. An NGO deciding whether to claim, and an admin settling a dispute
-- about a torn shirt, can both see the difference.
--
-- The alternative was to attribute the answers to the admin outright. That is
-- more honest about the assertion and wrong about the ownership: the donor did
-- give the thing, and hiding their item from their own timeline to make a point
-- about provenance helps nobody.

alter table public.donations
  add column posted_on_behalf_by uuid references public.profiles (id);

comment on column public.donations.posted_on_behalf_by is
  'Set when an administrator posted this item for the donor. Null means the '
  'donor answered the condition gates themselves.';

/**
 * Create a donation on a donor's behalf.
 *
 * Admin-only, and it cannot be used to post as someone with a different role —
 * an item whose "donor" is an NGO would break every timeline that assumes a
 * donation has a donor.
 */
create or replace function app.admin_create_donation(
  p_donor_profile_id uuid,
  p_title text,
  p_description text,
  p_category public.donation_category,
  p_quantity integer,
  p_condition public.donation_condition,
  p_checklist jsonb,
  p_pickup_address text,
  p_pincode text
)
returns uuid
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_admin uuid;
  v_donation uuid;
begin
  if not app.is_admin() then
    raise exception 'only an admin may post on behalf of a donor';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_donor_profile_id and role = 'donor' and is_active
  ) then
    raise exception 'that is not an active donor';
  end if;

  select id into v_admin from public.profiles where user_id = app.current_user_id() limit 1;

  insert into public.donations (
    donor_id, title, description, category, quantity, condition,
    condition_checklist, pickup_address, pincode, posted_on_behalf_by
  )
  values (
    p_donor_profile_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    p_category, p_quantity, p_condition, p_checklist,
    btrim(p_pickup_address), btrim(p_pincode), v_admin
  )
  returning id into v_donation;

  return v_donation;
end;
$$;

revoke all on function app.admin_create_donation(
  uuid, text, text, public.donation_category, integer, public.donation_condition,
  jsonb, text, text
) from public;
grant execute on function app.admin_create_donation(
  uuid, text, text, public.donation_category, integer, public.donation_condition,
  jsonb, text, text
) to eegai_app;
