-- ===========================================================================
-- 028 — privacy and terms that describe the product as it now is
--
-- 016's text describes a goods wall and nothing else. Since then the service
-- collects a blood group, age, gender, last donation date, hair details and a
-- mother's milk-eligibility declarations, and the home page's Hospital card
-- says "Terms and conditions apply" and links here. A privacy policy that does
-- not mention health data, for a service that collects it, is not one.
--
-- Only a document still at version 1 is replaced. A version above 1 means an
-- admin has published edits, and a migration must not silently overwrite them;
-- that case is reported so somebody merges the new sections by hand.
--
-- Operator facts stay in [square brackets], as in 016: PLAN.md §11 Q2 still
-- has no answer for which legal entity runs this.
-- ===========================================================================

do $$
declare
  v_edited text[];
begin
  select array_agg(slug) into v_edited
  from public.legal_documents
  where slug in ('privacy', 'terms') and version > 1;

  if v_edited is not null then
    raise notice 'legal documents % were edited by an admin; merge the donor-module sections from 028 by hand', v_edited;
  end if;
end;
$$;

update public.legal_documents
set version = version + 1,
    body = $doc$
## Who this is about

EEGAI connects people in Coimbatore with verified hospitals and organisations. A donor can give blood, hair, breast milk, or household goods they no longer need. This page describes what the service stores about you, who can see it, and how long it is kept.

The service is operated by [legal entity name], registered at [registered address]. For the purposes of the Digital Personal Data Protection Act, 2023, that entity is the Data Fiduciary.

EEGAI is a connecting platform. It does not itself collect, store, test, process or distribute blood or breast milk, and it does not decide whether anybody is medically eligible to donate.

## What is collected

- Your phone number and a password. The number is how you sign in. The password is stored only as a scrypt hash, never in a form anyone can read.
- Your name, and your area or pincode. The area is used to match you with organisations and hospitals near you, and to show you how far away they are.
- If you register as a blood donor: your blood group (required), and, if you choose to give them, your age, gender, the date of your last blood donation, and whether you are currently available.
- If you offer hair: its length and condition, your answers to the partner's questions, and a photograph if you choose to add one.
- If you register to donate breast milk: your confirmation of each eligibility point. You are not asked for medical records, and none are stored.
- For household goods: photographs of the items you post, and the answers you give about their condition.
- A record of what happened: alerts you were sent and how you answered, offers you made and what the organisation decided, and each step an item took.
- If you register as a delivery partner, an identity document and a photograph, used only to verify you and visible only to administrators.
- Your consent to the donor terms, with the date and the version of the text you agreed to.

No payment details are collected. There is no payment gateway, and money never changes hands through this service.

## Health information, and your consent

Blood group, age, gender, donation dates, hair details and milk-eligibility answers are only collected after you have agreed to the donor terms in the app. You can withdraw that consent at any time from Preferences. Once you do, you stop receiving alerts and cannot make new offers. Anything you already agreed to, such as a visit you said you would make, is left as it was, so that a hospital is not left waiting without being told.

## Who can see it

Access is enforced by the database itself, not only by the application.

- Your exact location is never shown to anybody: not to a hospital, an organisation, a delivery partner or another donor. Coordinates can be read only by you and by the matching inside the database.
- When a verified hospital posts a blood alert, every registered blood donor who has alerts turned on and is available is told. The hospital is told how many people were alerted, never who.
- If you answer an alert with Available, that hospital can see your name, phone number, age, gender, blood group and last donation date. If you answer Not available, it sees nothing about you and only a count changes.
- If you send a hair or breast-milk offer, only the organisation you chose can see it, together with your name and phone number. A hair photograph is visible only to you, that organisation and administrators.
- For household goods: an organisation sees items posted near it, in the categories it accepts. Once it claims your item, it can see the pickup address and a contact number, because someone has to come and collect it. A delivery partner sees only the collections assigned to them, or unassigned ones inside the area they cover. The photograph an organisation sends when your item arrives is visible to you alone.
- Handover codes are stored hashed. Nobody, including the delivery partner collecting your item, can read a code belonging to someone else.
- Administrators can see records in order to verify organisations, handle complaints and act on requests you make.

## How long it is kept

The record of an item's journey, an alert and the answers to it, or an offer and its outcome, is kept as long as the service operates, because it is what settles a dispute. Photographs and personal details are kept for [retention period] after the donation completes.

You can turn your account off at any time from Preferences, which stops sign-in and every alert. You can also ask for it to be deleted. Someone will contact you to confirm before anything is removed. The record that a donation happened is not erased, because it also belongs to the organisation or hospital involved.

## What you can ask for

Under the DPDP Act you may ask for a copy of your data, ask for it to be corrected, ask for it to be erased where it is no longer needed, withdraw consent, and nominate someone to act for you.

Write to [grievance officer name] at [grievance email]. We aim to respond within [response time commitment].

## Where it is stored

Data is stored on servers in [hosting region]. Photographs are held on [storage provider].

When a courier is used, the collection and delivery addresses and a contact number are sent to that courier so the parcel can be moved. Nothing else is shared with anyone outside the service. No data is sold, and there is no advertising on this service.

## Children

The service is not intended for anyone under 18. If you believe a child has registered, write to the address above and the account will be removed.
$doc$
where slug = 'privacy' and version = 1;

update public.legal_documents
set version = version + 1,
    body = $doc$
## What this service is

EEGAI connects donors in Coimbatore with verified hospitals and organisations. It is operated by [legal entity name].

A donor can give blood when a hospital asks, offer hair or breast milk to a partner organisation, or give household goods they no longer need. EEGAI is where the two sides find each other. It does not take ownership of anything, buy or sell anything, or handle any money.

EEGAI is a connecting platform only. It does not collect, store, test, process, transport or distribute blood or breast milk, and it does not decide whether anybody is medically eligible to donate. Screening, testing and every donation procedure are carried out by the hospital or organisation concerned, under its own responsibility and the law that applies to it.

## If you are a donor

- Tell the truth about yourself: your blood group, and your answers on the hair and breast-milk forms. They are declarations you make, and a hospital or organisation relies on them before it screens you.
- Answer blood alerts honestly. Say Available only if you mean to go, and change your answer in the app if your plans change, so that a hospital is not waiting for someone who is not coming.
- The hospital or organisation decides whether you can donate. Being alerted or accepted in the app is not a finding that you are eligible.
- Breast milk is donated only through a Lactation Management Centre (LMC or CLMC), after its screening. The service is not for arranging direct exchange between mothers.
- For household goods: answer the condition questions honestly, post only things you own and are entitled to give away, and have the item ready on the day it is collected. Do not post food, medicine, weapons, hazardous material, live animals, or anything whose sale or transfer is restricted by law.

An organisation may decline a hair or breast-milk offer, or refuse a household item when it arrives. If it does, it must say why. A refusal is a record, not a penalty.

## If you are a hospital

These terms apply to every hospital or blood centre registered on the service, and a hospital must accept them when it registers.

- You must be a licensed hospital or blood centre, and must provide documents for verification. You cannot post an alert until an administrator has verified you and approved you for blood.
- Post a blood alert only for a genuine, current requirement, with the correct blood group, number of units and urgency. Close it as soon as the requirement is met.
- The names and phone numbers of donors who say Available are given to you only so that you can arrange their donation. Do not use them for anything else, do not share them, and do not keep them for longer than you need to.
- You are solely responsible for donor screening, eligibility, consent to the procedure, collection, testing, storage and use of blood, in accordance with the law that applies to you. EEGAI takes no part in any of it.
- You must not charge a donor, or pay one, for a donation arranged through the service.

## If you are an organisation

You must be a registered charitable organisation or a recognised partner, and must provide documents for verification before you can take part.

- Hair and breast-milk partners: decide each offer promptly. If you decline one, say why. Use donated hair and milk only for the purpose you were approved for, and carry out your own screening and testing.
- Household goods: claim only what you can genuinely collect and use. An item claimed and left sitting is invisible to every other organisation. Confirm receipt promptly, with a photograph. That photograph is shown to the donor and nobody else.
- Use a donor's contact details only to arrange the donation they offered.

## If you are a delivery partner

You must be verified before you can collect anything. Collect only what has been assigned to you, and take the item directly to the receiving organisation. Never ask anyone to type a handover code into your phone. Codes are spoken aloud, which is what makes them proof of the handover.

## What we do not promise

We do not guarantee that an alert will be answered, that an offer will be accepted, or that an item will be claimed or collected on a particular day or at all. We do not inspect goods, screen donors, or check the quality of any donation, and we are not responsible for the condition, safety or fitness of anything given.

Verification means documents were checked. It is not a guarantee of any hospital's, organisation's or person's conduct.

## Receipts and tax

The record you can download after a household item is confirmed is a record that goods were collected and received. It is not a tax receipt and does not by itself support a deduction under Section 80G. If the receiving organisation holds 80G registration, ask them directly for a receipt.

## Accounts

You are responsible for what happens under your account. An account may be disabled if these terms are broken. Disabling an account stops sign-in. It does not erase the record of donations that already happened, because that record also belongs to the other party.

## Changes, and the law that applies

These terms may change. Material changes will be shown in the app before they take effect.

These terms are governed by the laws of India, and the courts at [jurisdiction] have exclusive jurisdiction. Questions and complaints go to [grievance email].
$doc$
where slug = 'terms' and version = 1;
