# EEGAI (ஈகை) — Build Plan

> Tagline: "Where giving finds its way."
> Formerly called Wall of Kindness; renamed to EEGAI, Tamil for giving.

> Work milestone by milestone, top to bottom. Do not start a milestone until the
> previous one's acceptance criteria all pass. Stop and ask before deviating from
> any decision marked **LOCKED**.

---

## 1. Brief

A donation platform for physical goods. A donor photographs an item they no
longer need, posts it, and a verified NGO claims it. The item then reaches the
NGO one of two ways: the donor books a courier, or a vetted volunteer collects
it in person.

Launch city: **Coimbatore, Tamil Nadu**. Single city only in v1.

The product is named after the real thing — the painted public walls in Indian
and Iranian cities where people hang clothes for anyone who needs them. That
wall is the governing metaphor for the interface, not a decoration.

**Primary success metric:** completed donations (item physically received and
acknowledged by an NGO), not signups.

---

## 2. Non-goals — do not build these

Explicitly out of scope for v1. If a task seems to need one of these, stop and ask.

- Cash or monetary donations of any kind. No payment gateway except courier fees.
- In-app chat between donors and NGOs.
- Ratings, reviews, badges, points, leaderboards, or any gamification.
- Native iOS/Android apps. This is a PWA.
- Multi-city or multi-language switching (design for it, don't build it).
- Recommendation algorithms or ML matching. Routing is deterministic.
- Social feed, comments, likes, follower graph.

---

## 3. Stack — **LOCKED**

| Layer        | Choice                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Build        | Vite + React 18 + TypeScript (strict)                                   |
| Routing      | React Router v6                                                         |
| UI           | Tailwind CSS + shadcn/ui                                                |
| Server state | TanStack Query v5                                                       |
| Forms        | React Hook Form + Zod                                                   |
| Backend      | Supabase — Postgres, Auth, Storage, Row Level Security, Realtime        |
| Auth         | Phone OTP (Supabase Auth, SMS provider configurable — MSG91 for India)  |
| Images       | Client-side compress with `browser-image-compression` before upload     |
| Maps/geo     | Postgres `earthdistance` / lat-lng math. No Google Maps in v1.          |
| PWA          | `vite-plugin-pwa`, offline shell + installable                          |
| Dates        | `date-fns`                                                              |
| Testing      | Vitest + React Testing Library; Playwright for the three critical flows |

**Rules:**

- No global state library. TanStack Query for server state, React Context only
  for the auth session.
- Every Supabase table gets RLS enabled from the moment it is created. No table
  ships with RLS off, not even temporarily.
- No secrets in the client bundle. Anything privileged goes in an Edge Function.
- TypeScript types for the DB are generated from the schema
  (`supabase gen types typescript`) and committed. Never hand-write row types.

---

## 4. Repo structure

```
/src
  /app              route components, one folder per role
    /donor
    /ngo
    /volunteer
    /admin
    /auth
  /components
    /ui             shadcn primitives — do not edit by hand beyond tokens
    /wall           the masonry wall + brick tile (signature component)
    /shared
  /lib
    supabase.ts     client singleton
    types.ts        generated DB types (do not edit)
    state-machine.ts
    geo.ts
    validation/     Zod schemas, one file per entity
  /hooks
/supabase
  /migrations       numbered SQL migrations
  /functions        edge functions
  seed.sql
```

---

## 5. Roles

| Role        | Can do                                                                |
| ----------- | --------------------------------------------------------------------- |
| `donor`     | Post items, track them, view acknowledgement photos, download receipt |
| `ngo`       | Browse the feed, claim, set capacity/categories, confirm receipt      |
| `volunteer` | See nearby pickups, accept, run OTP handoff at both ends              |
| `admin`     | Verify NGOs and volunteers, moderate posts, resolve disputes          |

One `profiles` row per user. Role is a column, not a separate table. A user has
exactly one role in v1.

---

## 6. Data model

Write these as numbered migrations in `/supabase/migrations`. Every table:
`id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`,
`updated_at timestamptz` maintained by a trigger.

**`profiles`** — `user_id` (fk auth.users, unique), `full_name`, `phone`,
`role` (enum), `pincode`, `lat`, `lng`, `is_active`

**`ngos`** — `profile_id`, `name`, `registration_number`, `darpan_id`,
`has_80g` (bool), `address`, `pincode`, `lat`, `lng`, `verification_status`
(enum: `pending` | `verified` | `rejected` | `suspended`), `verified_at`,
`verified_by`, `monthly_capacity`, `accepts_categories` (enum array),
`contact_person`, `contact_phone`, `is_accepting` (bool — their own pause switch)

**`ngo_documents`** — `ngo_id`, `doc_type`, `storage_path`, `reviewed`
(private storage bucket, admin-only RLS)

**`volunteers`** — `profile_id`, `id_doc_path`, `selfie_path`,
`verification_status` (same enum), `service_radius_km` (default 8),
`available_slots` (jsonb — days × morning/evening)

**`donations`** — `donor_id`, `title`, `description`, `category` (enum:
`clothes` | `books` | `toys` | `education` | `furniture` | `household`), `quantity`, `condition` (enum: `like_new` |
`good` | `usable`), `condition_checklist` (jsonb — the answers, stored for
disputes), `pickup_address`, `pincode`, `lat`, `lng`, `status` (enum, see §7),
`claimed_by_ngo_id`, `claimed_at`, `claim_expires_at`, `delivery_method` (enum:
`courier` | `volunteer` | null), `rejected_reason`

**`donation_photos`** — `donation_id`, `storage_path`, `sort_order`.
Minimum 1, maximum 5, enforced in a DB check and in the Zod schema.

**`pickups`** — `donation_id` (unique), `volunteer_id`, `slot_date`, `slot`
(`morning` | `evening`), `collect_otp`, `deliver_otp`, `collected_at`,
`delivered_at`. OTPs are 4-digit, hashed at rest, generated server-side only.

**`shipments`** — `donation_id` (unique), `provider`, `awb_number`,
`label_url`, `fee_paise`, `paid_by`, `status`

**`acknowledgements`** — `donation_id` (unique), `ngo_id`, `photo_path`, `note`

**`notifications`** — `profile_id`, `channel` (`sms` | `whatsapp` | `push`),
`template_key`, `payload` jsonb, `sent_at`, `error`

**`audit_log`** — `actor_id`, `entity`, `entity_id`, `action`, `before` jsonb,
`after` jsonb. Written by triggers on `donations`, `ngos`, `volunteers`.

### RLS policy summary

- Donors read/write only their own `donations` and `donation_photos`.
- NGOs read `donations` where `status = 'posted'` **and** category is in their
  `accepts_categories` **and** within radius — plus any donation they claimed.
- Volunteers read only donations with an open `pickups` row assigned to them,
  or unassigned pickups inside their radius.
- Admin bypasses via a `is_admin()` security-definer function. Never via
  service-role key in the client.
- `ngo_documents` and `volunteers.id_doc_path` are admin-only, full stop.

---

## 7. Donation state machine — **LOCKED**

```
posted ──claim──▶ claimed ──schedule──▶ scheduled ──dispatch──▶ in_transit
                    │                       │                        │
                    │                       │                        ▼
                    │                       │                    received
                    │                       │                        │
                    │                       │                        ▼
                    │                       │                  acknowledged
                    ▼                       ▼
                 posted                  claimed              (terminal)
              (24h expiry)            (cancel pickup)

Any state ──cancel──▶ cancelled   (donor only, before in_transit)
received ──reject──▶ rejected     (NGO only, requires reason + photo)
```

Implement in `/src/lib/state-machine.ts` as an explicit transition map:
`Record<Status, { to: Status; allowedRoles: Role[] }[]>`. Every status change
goes through one `transition()` function — no direct status writes anywhere in
the codebase. Mirror the same map as a Postgres trigger so the DB rejects
invalid transitions too. Unit-test every legal and illegal edge.

**Claim expiry:** a `posted` donation unclaimed after 24h widens its radius by
5km. After 72h total it goes back to the donor with a "no NGO nearby" message.
Run as a Supabase scheduled Edge Function every 15 minutes.

**Routing is first-claim-wins.** Not broadcast-to-all. Use
`SELECT ... FOR UPDATE SKIP LOCKED` in the claim RPC so two NGOs clicking at
the same instant cannot both win.

---

## 8. Design direction

Do not produce a generic dashboard. The interface is a wall.

### Tokens

```css
--plaster: #ebe7dc; /* limewash wall — page ground */
--indigo: #21324f; /* block-print ink — all primary text */
--marigold: #e8a317; /* the giving colour — primary action, used sparingly */
--kraft: #c9a87c; /* cardboard/courier surfaces — cards, labels */
--moss: #4a6b4f; /* received / success */
--vermilion: #c0442e; /* rejected / destructive only */
```

Dark mode: invert to `--indigo` ground with `--plaster` ink. Marigold stays.

### Type

- **Display:** Bricolage Grotesque — headings, the wall header, numerals.
  Used at large sizes with tight tracking. Never below 20px.
- **Body:** Instrument Sans — everything else.
- **Utility:** JetBrains Mono — AWB numbers, OTPs, donation IDs, timestamps.

Both body and utility faces must be paired with **Noto Sans Tamil** in the
font stack from day one. Tamil strings will land later and the layout must not
reflow when they do. All user-facing strings go through a
`t()` helper backed by a flat `en.json` — even in v1 where English is the only
locale.

### Signature element

The donor and NGO feeds render as a **masonry wall of bricks** — each donation
is a photo tile pinned to the plaster ground, sized by aspect ratio, with a
1px indigo hairline and a small kraft-coloured tag showing category and
condition. When an NGO claims a brick, it lifts off the wall with a short
transform and the gap behind it fills with plaster. That transition is the one
piece of motion in the product. Everything else is instant.

Respect `prefers-reduced-motion`: the brick fades instead of lifting.

### Copy rules

- Active voice, sentence case. The button says "Claim this," the toast says
  "Claimed."
- Never name the system. A donor "posts an item," they don't "create a
  donation record."
- Empty states are invitations: "Nothing on the wall yet. Post the first thing."
- Errors say what happened and what to do. They do not apologise.

### Quality floor (not optional)

Mobile-first — most donors are on a 360px Android screen on patchy data.
Visible keyboard focus rings. Every image has alt text. Lighthouse
performance ≥ 85 on a simulated 4G Moto G. Total JS under 250KB gzipped.

---

## 9. Milestones

Each milestone is a PR. Do not merge until its acceptance criteria pass.

### M0 — Foundation

Scaffold Vite + React + TS + Tailwind + shadcn. Configure the design tokens in
`tailwind.config.ts` and `globals.css`. Set up Supabase local dev, migrations,
type generation, and CI (typecheck + lint + test on every push).

**Accept:** `npm run build` clean, `npm run typecheck` clean, tokens visible on
a throwaway style-guide route, `supabase db reset` rebuilds the schema from
migrations with zero manual steps.

### M1 — Auth and profiles

Phone OTP login. Role selection on first login. Profile completion form.
Protected route wrapper per role. Session persisted, refresh handled.

**Accept:** all four roles can sign up, land on their own shell, and are
blocked from the other three roles' routes. RLS denies a direct API read of
another user's profile — prove it with a test.

### M2 — Post an item (donor)

Multi-step form: photos → category → condition checklist → address → review.
Client-side compression to max 1600px / 400KB. Drag-to-reorder photos. Draft
saved to localStorage so a dropped connection doesn't lose the post.

**The condition checklist is not optional and not a formality.** Per category,
3–5 hard yes/no gates ("clean and washed," "no tears or missing buttons,"
"all pieces present"). Any "no" blocks submission and explains why. This is the
single control that stops the platform being used as a dump — treat it as a
core feature, not a form field.

**Accept:** a post with 3 photos completes on a throttled 4G connection in
under 30 seconds. Failing any checklist gate blocks submit with a clear reason.
Photos land in the right storage bucket with correct RLS.

### M3 — The wall and claiming (NGO)

The masonry wall feed, filtered by the NGO's categories and radius. Claim
action via a Postgres RPC using `FOR UPDATE SKIP LOCKED`. Claimed items move to
"Our claims." Capacity toggle. Realtime subscription so a claimed brick
disappears from other NGOs' walls without a refresh.

**Accept:** two concurrent claim requests on the same donation — exactly one
succeeds, the other gets a clean "Already claimed" state, verified by a test
that fires both simultaneously. The lift-off transition runs at 60fps on
mid-range Android.

### M4 — Volunteer pickup and OTP handoff

Volunteer sees unassigned pickups inside their radius, accepts one, picks a
slot. Two OTP gates: donor reads a code to the volunteer at collection, NGO
reads a code at delivery. OTPs are generated and verified **server-side only**,
hashed at rest, 6 attempts then regenerate.

**Accept:** the full chain runs end to end in Playwright. A wrong OTP does not
advance state. The OTP never appears in any client-side network response.

### M5 — Courier route

Provider adapter interface with one real implementation (Shiprocket or
Delhivery — whichever has sandbox access first) plus a mock for tests. Generate
AWB, return a label, poll status into `shipments.status`, map provider statuses
onto our state machine.

**Accept:** the whole flow works against the mock provider with no network. The
adapter is swappable without touching any component.

### M6 — Receipt, acknowledgement, and the loop back

NGO confirms receipt and uploads an acknowledgement photo plus a short note.
Donor sees it on their donation timeline. Reject path with mandatory reason and
photo. Generate a simple PDF receipt for the donor.

**Accept:** the donor's timeline shows all six states with timestamps. The
acknowledgement photo is visible to that donor only. Rejection writes an
audit_log row.

### M7 — Admin

NGO verification queue with document viewer, approve/reject with reason.
Volunteer verification. Post moderation. A dispute view showing the full
audit trail for any donation.

**Accept:** no admin route is reachable by a non-admin, verified at both the
route level and the RLS level.

### M8 — Notifications, PWA, and pilot hardening

SMS and WhatsApp templates for the seven state changes that matter. Retry with
backoff, failures logged to `notifications.error`. PWA manifest, offline shell,
install prompt. Error boundary and Sentry.

**Accept:** installable on Android Chrome. Lighthouse PWA passes. A downed SMS
provider does not break any state transition — notifications are always
fire-and-forget relative to the transaction.

---

## 10. Working agreements for Claude Code

- **Small commits, conventional format.** `feat(ngo): claim RPC with row lock`.
- **Write the migration before the UI.** Schema first, generate types, then build.
- **Test the state machine and the RLS policies.** Everything else is
  best-effort, but these two are where a bug means an item is lost or a
  document leaks.
- **Do not add a dependency** that isn't in §3 without asking. Especially not a
  component library, an icon set beyond `lucide-react`, or a date library.
- **Seed data:** `seed.sql` creates 2 admins, 5 verified NGOs across Coimbatore
  pincodes, 4 volunteers, and 30 donations spread across every state. Every
  feature must be demoable from a fresh `supabase db reset`.
- **When something is ambiguous**, pick the option that is simpler to delete
  later, note the decision in `DECISIONS.md` with one line of reasoning, and
  keep moving. Don't stall on it.
- **Keep a `NOTES.md`** of what was tried and rejected, so a later pass doesn't
  relitigate settled questions.

---

## 12. The health-donation lane

Added from the EEGAI Developer Brief. Blood, hair and breast milk — a
coordination layer only, and a different shape from the goods wall:

|               | goods lane                      | health lane                      |
| ------------- | ------------------------------- | -------------------------------- |
| who posts     | a donor posts a thing           | an institution posts a need      |
| what moves    | a volunteer or courier moves it | nothing; the donor goes there    |
| the app's job | tracks the handover             | makes the introduction and stops |

Brief §6 forbids collection, storage, testing and transport here, so nothing in
this lane touches `pickups`, `shipments`, OTPs or acknowledgements. A health
request has no delivery concept at all.

**The institution is the organisation we already verify.** `ngos` gained
`health_categories`; empty — the default, and every organisation already on the
platform — means "not a health institution". A separate table would have meant
a second verification queue and a second admin screen.

**Brief §5's four privacy rules are enforced in the database**, migration 024:

1. _A donor's exact location is never shown._ There is no policy anywhere
   granting an institution read on `profiles`. Matching happens inside
   `app.notify_nearby_donors`, which returns a count; the only route from a
   response to a person is `app.request_responders`, which returns a name, a
   phone and a time and cannot return a coordinate because it does not select
   one.
2. _Collect only what is needed._ `donor_health_profiles` has no location
   column of its own.
3. _Only verified institutions can post._ Checked twice inside
   `app.post_health_request` — verified, and approved for that category.
4. _Consent is explicit and withdrawable._ Recorded with the version agreed to,
   and re-checked when somebody responds rather than assumed from the wall
   being visible.

`server/tests/health-lane.test.ts` asserts all four as the non-BYPASSRLS app
role. The location test was confirmed to go red by temporarily adding a policy
that leaks — a test never seen to fail is not yet a test.

**Known cross-lane exposure, not introduced here.** `profiles_donation_counterparty`
(migration 011) lets an organisation read the profile — including `lat`/`lng` —
of a donor whose _goods_ donation it has claimed. That is deliberate in the
goods lane, where somebody has to collect a sofa from an address. It means an
organisation that is both a goods NGO and a health institution could learn the
location of a donor it has a goods relationship with. The health lane adds no
path of its own, and the test suite asserts that: an institution with no goods
relationship sees zero profile rows for a donor who responded. Closing it
properly means narrowing the goods policy to the donation's pickup address
rather than the donor's profile row, which is a change to a working lane and
wants doing deliberately.

**Blood groups are targeting, not screening.** Where a request and a donor both
name a group, they must match — so an O- request does not page every A+ donor
in the district. No compatibility matrix is computed anywhere; brief §6 forbids
medical logic, and this is a filter, not a judgement about anyone's eligibility.

**The health lane leads.** A donor signing in arrives at nearby requests, and
an organisation an admin has approved for a health category arrives at its own
requests; a plain clothes-and-books organisation still lands on the wall. The
goods wall is one tap from both and unchanged — it is simply no longer the
front door, and the landing page now explains the health flow in full and the
goods flow in three lines.

`homeFor(user)` is the real answer for that, because an organisation's landing
screen depends on an admin decision rather than on its role alone.
`HOME_FOR_ROLE` survives as the fallback for the two places that know a role
but not yet a user: the sign-up form and the dev role switcher.

**Still the goods wall's:** the landing hero illustration. Replacing it needs a
drawing rather than a rearrangement, and a bad one is worse than a dated one.

**Not built yet:** no real push or SMS delivery (rows land in `notifications`
and the dispatcher is still the goods lane's), no admin screen for the account
deletion queue, and no institution-side onboarding for health categories — an
admin grants them from the Organisations tab.

## 11. Open questions to resolve before M5

These need answers from the product owner, not a guess:

1. Who pays the courier fee — donor, NGO, or platform?
2. Which legal entity issues the donation receipt (Section 8 company of your
   own, or an existing partner NGO's registration)?
3. Which courier has sandbox API access granted?
4. Minimum viable NGO count for the pilot — the plan assumes 5 verified before
   any donor is invited.
