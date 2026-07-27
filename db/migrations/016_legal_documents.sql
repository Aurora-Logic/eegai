-- 016 — legal pages become editable from the admin screen.
--
-- They were JSX. Changing a retention period or filling in the operating entity
-- meant a developer, a build and a deploy, which is the wrong shape for a
-- document whose facts are decided by whoever runs the organisation.
--
-- Two things this deliberately does that a plain "content" table would not:
--
-- `version` increments on every published edit, and `agreements` records which
-- version a user accepted. Silently rewriting a document somebody already agreed
-- to is the whole reason terms-of-service disputes exist, and an audit trail
-- that cannot say *which* text was agreed is not much of one.
--
-- The write path is a guarded function rather than an admin UPDATE policy, for
-- the same reason as 013 and 014: a policy hands the API role rights over every
-- column, where a function can enforce exactly one shape of change.

create table public.legal_documents (
  -- A uuid id even though slug is the natural key: app.write_audit() reads
  -- NEW.id to record what changed, so a table without one cannot be audited —
  -- and a legal document is exactly the kind of thing you want a trail for.
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  -- Plain text with a tiny convention: '## ' starts a section, '- ' a list item,
  -- blank lines separate paragraphs. Not Markdown — PLAN.md §10 forbids adding a
  -- parser, and three rules render in about forty lines on the client.
  body text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint legal_documents_slug_known check (slug in ('privacy', 'terms')),
  constraint legal_documents_body_present check (btrim(body) <> '')
);

create trigger set_updated_at
  before update on public.legal_documents
  for each row execute function app.set_updated_at();

create trigger write_audit
  after insert or update or delete on public.legal_documents
  for each row execute function app.write_audit();

alter table public.legal_documents enable row level security;

-- Readable by everyone, including signed-out visitors. Someone deciding whether
-- to hand over a phone number must be able to read the terms first.
create policy legal_documents_public_read on public.legal_documents
  for select using (true);

grant select on public.legal_documents to eegai_app;

/**
 * Publish an edit. Admin-only, and bumps the version so an agreement recorded
 * against version 3 keeps meaning what it meant.
 */
create or replace function app.publish_legal_document(
  p_slug text,
  p_title text,
  p_body text
)
returns integer
language plpgsql
security definer
set row_security = off
set search_path = public, app, pg_catalog
as $$
declare
  v_version integer;
begin
  if not app.is_admin() then
    raise exception 'only an admin may publish a legal document';
  end if;

  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'a legal document cannot be published empty';
  end if;

  update public.legal_documents
  set title = btrim(p_title),
      body = p_body,
      -- Only counts as a new version if the words actually changed. Fixing a
      -- typo in the title should not invalidate everyone's recorded agreement.
      version = case when body is distinct from p_body then version + 1 else version end,
      updated_by = (
        select id from public.profiles where user_id = app.current_user_id() limit 1
      )
  where slug = p_slug
  returning version into v_version;

  if v_version is null then
    raise exception 'no such document %', p_slug;
  end if;

  return v_version;
end;
$$;

revoke all on function app.publish_legal_document(text, text, text) from public;
grant execute on function app.publish_legal_document(text, text, text) to eegai_app;

comment on table public.legal_documents is
  'Privacy and terms, editable by an admin. Versioned so an agreement can name '
  'the text it was given.';

-- ---------------------------------------------------------------------------
-- The starting text, carried over from the JSX these replace.
--
-- Every fact belonging to the operator rather than the code stays wrapped in
-- [square brackets]. PLAN.md §11 Q2 has no answer yet for which legal entity
-- runs this, and a privacy policy naming a company that does not exist is worse
-- than no policy. The admin editor is where they get filled in.
-- ---------------------------------------------------------------------------

insert into public.legal_documents (slug, title, body) values
('privacy', 'Privacy', $doc$
## Who this is about

EEGAI connects people in Coimbatore who have household goods to give with organisations that can use them. This page describes what the service stores about you, who can see it, and how long it is kept.

The service is operated by [legal entity name], registered at [registered address]. For the purposes of the Digital Personal Data Protection Act, 2023, that entity is the Data Fiduciary.

## What is collected

- Your phone number and a password. The number is how you sign in. The password is stored only as a scrypt hash, never in a form anyone can read.
- Your name, and your area or pincode. The area is used to show your item to organisations near you and nothing else.
- Photographs of the items you post, and the answers you give about their condition.
- A record of what happened to each item: when it was posted, claimed, collected and confirmed, and by whom.
- If you register as a volunteer, an identity document and a photograph, used only to verify you and visible only to administrators.

No payment details are collected. There is no payment gateway, and money never changes hands through this service.

## Who can see it

Access is enforced by the database itself, not only by the application.

- An organisation sees items posted near it, in the categories it accepts.
- Once an organisation claims your item, it can see the pickup address and a contact number, because someone has to come and collect it.
- A volunteer sees only the collections assigned to them, or unassigned ones inside the area they cover.
- The photograph an organisation sends when your item arrives is visible to you alone.
- Handover codes are stored hashed. Nobody, including the volunteer collecting your item, can read a code belonging to someone else.

## How long it is kept

The record of an item's journey is kept as long as the service operates, because it is what settles a dispute about whether something arrived. Photographs and personal details are kept for [retention period] after an item completes.

Deleting your account disables sign-in and hides your details from other users. The record that an item moved is not erased, because it also belongs to the organisation that received it.

## What you can ask for

Under the DPDP Act you may ask for a copy of your data, ask for it to be corrected, ask for it to be erased where it is no longer needed, and nominate someone to act for you.

Write to [grievance officer name] at [grievance email]. We aim to respond within [response time commitment].

## Where it is stored

Data is stored on servers in [hosting region]. Photographs are held on [storage provider].

When a courier is used, the collection and delivery addresses and a contact number are sent to that courier so the parcel can be moved. Nothing else is shared. No data is sold, and there is no advertising on this service.

## Children

The service is not intended for anyone under 18. If you believe a child has registered, write to the address above and the account will be removed.
$doc$),

('terms', 'Terms', $doc$
## What this service is

EEGAI is a way to give household goods you no longer need to organisations in Coimbatore that can use them. It is operated by [legal entity name].

It is a place where a donor and an organisation find each other. The goods are given directly by you to that organisation. The service does not take ownership of anything, buy anything, or sell anything, and no money passes through it.

## What you agree to when you post something

- Answer the condition questions honestly. They are the only thing standing between an organisation and a pile of things it has to pay to throw away.
- Post only things you own and are entitled to give away.
- Have the item ready and accessible on the day it is collected. A volunteer cannot empty a cupboard for you.
- Do not post food, medicine, weapons, hazardous material, live animals, or anything whose sale or transfer is restricted by law.

An organisation may refuse an item when it arrives. If it does, it must say why and send a photograph, and you will see both. A refusal is a record, not a penalty.

## If you are an organisation

You must be a registered charitable organisation and must provide documents for verification before you can claim anything. Claim only what you can genuinely collect and use. An item claimed and abandoned is invisible to every other organisation while it sits there.

Confirm receipt promptly, with a photograph. That photograph is shown to the donor and nobody else.

## If you are a volunteer

You must be verified before you can collect anything. Collect only what has been assigned to you, take the item directly to the receiving organisation, and never ask anyone to type a handover code into your phone. Codes are spoken aloud, which is the whole point of them.

## What we do not promise

We do not guarantee that any item will be claimed, collected on a particular day, or collected at all. We do not inspect goods, and we are not responsible for their condition, safety or fitness for any purpose. That is between you and the organisation receiving them.

Verification means documents were checked. It is not a guarantee of an organisation's conduct.

## Receipts and tax

The record you can download after an item is confirmed is a record that goods were collected and received. It is not a tax receipt and does not by itself support a deduction under Section 80G. If the receiving organisation holds 80G registration, ask them directly for a receipt.

## Accounts

You are responsible for what happens under your account. An account may be disabled if these terms are broken. Disabling an account stops sign-in; it does not erase the record of items that already moved, because that record also belongs to the other party.

## Changes, and the law that applies

These terms may change. Material changes will be shown in the app before they take effect.

These terms are governed by the laws of India, and the courts at [jurisdiction] have exclusive jurisdiction. Questions and complaints go to [grievance email].
$doc$);
