# Roadmap

Three sections: what remains of the original plan, how the system gets
error-resistant and traceable, and what is worth building after v1.

[PLAN.md](PLAN.md) is still the contract. Nothing here overrides it — items
below are proposals until you say otherwise.

---

## 1. What remains of the plan

| Milestone                    | State           | What is already done                                                          | What is missing                                      |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| M0 Foundation                | **done**        | tokens, PWA, CI, migrations, seed                                             | —                                                    |
| M1 Auth & profiles           | **done**        | password auth, RLS-proven isolation, role routing                             | profile edit screen                                  |
| M2 Post an item              | **done**        | wizard, compression, gates, draft, reorder                                    | server-side image re-encode                          |
| M3 Wall & claiming           | **partly**      | masonry wall, claim RPC, lift-off, first-claim-wins                           | **realtime**, capacity toggle, NGO settings          |
| M4 Volunteer & OTP           | **schema only** | tables, RLS, `issue_pickup_otps`, `verify_pickup_otp`, column-level OTP grant | every screen, the accept/slot flow, SMS delivery     |
| M5 Courier                   | **not started** | —                                                                             | adapter interface, mock, one real provider           |
| M6 Acknowledgement           | **schema only** | `acknowledgements` table + RLS                                                | receipt confirm, reject path, donor timeline, PDF    |
| M7 Admin                     | **schema only** | admin RLS proven in tests, `audit_log` populated                              | every screen                                         |
| M8 Notifications & hardening | **partly**      | PWA, offline shell, install prompt                                            | SMS/WhatsApp dispatch, retry, Sentry, error boundary |

**Suggested order, and why:** M7 → M4 → M6 → M5.

Admin first because nothing else is operable without it — today an NGO can only
become verified by a hand-written SQL update, so the pilot cannot even start.
Then M4, because volunteer pickup is the delivery path that needs no third
party. M6 closes the loop and is what makes a donor post a second time — it is
the metric in §1. M5 last, because it is blocked on §11's open questions
anyway.

---

## 2. Error-resistant and traceable

You asked for "error proof and 100% traceable". Being straight about the first
half: **no system is error-proof, and anyone who tells you otherwise is
selling something.** What is achievable is that every failure is _contained_,
_visible_, and _attributable_ — and that the failures which lose someone's
belongings are made structurally impossible rather than merely unlikely.

### What already makes errors structurally impossible

These are not conventions anyone can forget; the database refuses:

- An illegal state change. `guard_donation_transition` rejects any edge not in
  `app.donation_transitions`, even from a direct `psql` session.
- Two NGOs claiming one item. `FOR UPDATE SKIP LOCKED` in `app.claim_donation`.
- Reading another user's data. RLS runs as a role with no `BYPASSRLS`, so a
  forgotten `WHERE` clause returns nothing rather than everything.
- An OTP leaking into a response. A column-level `GRANT` means the API role
  cannot `SELECT` it at all.
- A donation with zero or six photos. Deferred constraint trigger.
- A rejection with no reason. Table `CHECK`.
- Self-promotion to admin. `guard_role_change` trigger.

### What is still missing, in priority order

**a. Request correlation.** Every request gets an `X-Request-Id` (accepted from
the client, else generated). It goes into the log line, into `audit_log` as
`request_id`, and back in the response header. A donor screenshot showing an
error then maps to exactly one API call and one set of database mutations.
_Cost: small. Value: this is the single highest-leverage traceability change._

**b. An error boundary and a real error surface.** Today a render error is a
white screen. Needed: a React error boundary per route, an error page that
shows the request id, and Sentry (already in §M8) wired to both client and API.

**c. Structured logging.** The API currently uses Hono's dev logger. Replace
with JSON lines carrying `request_id`, `user_id`, `role`, route, status,
duration. Without this, production debugging is grep-and-hope.

**d. Audit coverage is currently partial.** `write_audit` is attached to
`donations`, `ngos`, `volunteers` and `profiles`. It is **not** attached to
`pickups`, `shipments`, `acknowledgements`, or `users`. For "100% traceable"
those four need it, with `users` filtered so no password hash is ever written
(the filter already exists in `write_audit`).

**e. Outbox for notifications.** `notifications` is written inside the state
transaction and delivered after. The dispatcher does not exist yet. It needs
retry with backoff and a dead-letter state, so a downed SMS provider is visible
rather than silent.

**f. Idempotency keys on mutations.** A donor on patchy 4G double-taps "Post".
Today that creates two items. An `Idempotency-Key` header stored with a short
TTL fixes it. Same for claims.

**g. A `donation_events` view.** `audit_log` holds the raw before/after. A
view that renders it as a human timeline ("claimed by Kovai Anbu Illam,
14:32") is what an admin resolving a dispute actually needs, and what the
donor timeline in M6 should read from.

**h. Backups.** Nothing exists. `pg_dump` on a schedule plus a documented
restore _that has actually been run once_ — an untested backup is not a backup.

### Honest limits

- Photos are on a local filesystem with no replication. One disk failure loses
  every acknowledgement photo. Object storage is the fix and it is not done.
- There is no rate limiting on login. Password auth without it is a
  credential-stuffing target.
- No CSRF token. The session cookie is `SameSite=Lax`, which covers the common
  case, but a state-changing `GET` would still be exposed. There are none today
  — that is a convention, not an enforcement.

---

## 3. Features worth building after v1

Grouped by what they are for. Each carries a rough size and the reason it
matters, so you can cut the list rather than debate it.

### Trust and safety — the things that decide whether the pilot survives

| Feature                      | Size | Why                                                                                                                                                                                 |
| ---------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NGO capacity enforcement** | S    | `monthly_capacity` is stored and ignored. An NGO that claims 200 items it cannot collect blocks 200 items from other NGOs. Enforce it in the claim RPC.                             |
| **Claim-to-collection SLA**  | M    | A claim that never moves is worse than no claim — the item is invisible to everyone else. Auto-release after 48h exists in the schema (`claim_expires_at`) but nothing enforces it. |
| **Donor no-show tracking**   | M    | The mirror problem: volunteers wasting trips. Count, don't punish — three no-shows should flag for a human, not auto-ban.                                                           |
| **Photo moderation queue**   | M    | Someone will eventually upload something that must not be on a public wall. Today an admin cannot see a posted item's photos before an NGO does.                                    |
| **Report / flag button**     | S    | On every brick. Cheapest possible safety valve.                                                                                                                                     |

### Closing the loop — what makes a donor come back

| Feature                           | Size | Why                                                                                                                                           |
| --------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Donation timeline with photos** | M    | Part of M6. The single most motivating screen in the product: "your jackets went to 4 children in Ganapathy".                                 |
| **Annual 80G statement**          | M    | Section 80G matters materially to Indian donors. `has_80g` is already on `ngos`. One PDF per financial year.                                  |
| **"Your wall" summary**           | S    | Items given, NGOs reached, over time. Not gamification (§2 forbids that) — a record, not a score.                                             |
| **NGO wishlists**                 | M    | Inverts the flow: an NGO says "we need school bags in June". Donors see needs, not just a void. Probably the highest-value idea on this list. |

### Reach

| Feature                                  | Size | Why                                                                                                                                                                                 |
| ---------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tamil translation**                    | M    | The single biggest reach change for Coimbatore. Every string already goes through `t()` and the font stack already carries Noto Sans Tamil, so this is a data task, not a refactor. |
| **WhatsApp as the primary channel**      | M    | More reliable than SMS in India and free at low volume. Status updates, OTP delivery, even posting an item by sending photos to a number.                                           |
| **Low-bandwidth mode**                   | S    | Skip photos on 2G, show text bricks. The target device is a Moto G on patchy 4G.                                                                                                    |
| **Bulk posting for offices and schools** | M    | One clean-out drive is worth fifty individual posts. A different form, not a bigger one.                                                                                            |

### Operations

| Feature                         | Size | Why                                                                                                                                                                |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Admin metrics**               | S    | Completed donations (the §1 metric), claim rate, time-to-collection, expiry rate. Currently nobody can answer "is this working?"                                   |
| **CSV export**                  | S    | Every NGO partner will ask for it in month one.                                                                                                                    |
| **Multi-user NGO accounts**     | M    | One login per organisation breaks the moment two people work there. `profiles.role` assumes one user, one role — this is the first real schema change on the list. |
| **Scheduled collection rounds** | L    | A volunteer collecting six items on one route rather than six trips. Real logistics value, real complexity.                                                        |

### Deliberately not proposed

Ratings, badges, points, leaderboards, social feed, in-app chat, cash donations
— all forbidden by §2, and I agree with the reasoning. Also **not** proposing ML
matching: §2 rules it out, and deterministic routing is easier to explain to an
NGO that asks why it did not see an item.

---

## 4. What I would do next, if it were my call

1. **Admin (M7).** Nothing is operable without it.
2. **Request ids + error boundary + audit on the remaining four tables.** Half a
   day, and every subsequent bug becomes cheap to diagnose.
3. **Volunteer + OTP (M4).**
4. **Acknowledgement + timeline (M6).** The loop closes; donors come back.
5. **NGO capacity enforcement and claim expiry.** The two rules that stop the
   wall silently filling with dead claims.
6. Then Tamil, then courier.
