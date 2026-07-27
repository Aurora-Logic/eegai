# Notes

What was tried, rejected, or deferred — so a later pass doesn't relitigate it.
Per PLAN.md §10.

## Open — needs doing before the next milestone closes

- **`src/lib/types.ts` has never been generated.** It is a hand-written
  placeholder with an unconstrained `Database` type, which means no Supabase
  query in the codebase is currently checked against the real schema. The first
  person with Docker available must run:

  ```
  npx supabase start
  npm run db:types
  ```

  and commit the result. The CI `migrations` job fails on drift, so this will
  surface on the first push to a branch — but locally the app compiles against
  a lie until then.

- **The M0 migrations have never been executed.** They were written but not run:
  no Docker, no `psql`, no Supabase CLI binary on the scaffolding machine. The
  SQL is unverified. Expect to fix at least one typo on first `supabase db reset`.

## Deferred deliberately

- **PWA service worker is scaffolded but not registered** (`injectRegister: null`
  in `vite.config.ts`). Turning it on before there is an offline shell to serve
  means shipping a cache with nothing useful in it, and a stale-content bug
  class for free. M8 turns it on.
- **No PWA icons yet.** `manifest.icons` is an empty array, so the install
  prompt will not fire. M8.
- **Fonts are a third-party round trip.** Four families from Google Fonts, with
  `preconnect`. On the target device (Moto G, 4G) this is measurable. Self-host
  the four `.woff2` subsets in M8 and re-measure Lighthouse before and after.
- **`prefers-reduced-motion` is enforced globally** by zeroing transition and
  animation durations in `globals.css`, plus a `motion-reduce:animate-brick-fade`
  variant on the brick itself. The global rule is a blunt instrument — if any
  later animation genuinely needs to run under reduced motion, it will need an
  explicit escape hatch.

## Rejected

- **A `useSupabase()` hook wrapping the client in context.** Considered for
  testability; rejected because the client is a process-level singleton and
  React Context buys nothing over a module import. `resetSupabase()` covers the
  test seam.
- **Storing the theme in a Context provider.** Nothing but the toggle reads it —
  the class on `<html>` is the actual state, and CSS reads that directly.
- **Generating the type scale from a modular ratio.** Four hand-picked display
  sizes read better than a computed scale, and the 20px floor from PLAN.md §8 is
  a hard constraint that a ratio keeps wanting to violate.

## Backend swap — what changed and what it cost

The Supabase removal invalidated part of M0. `supabase/` is left in the tree
unstaged rather than deleted, in case any of the RLS phrasing is worth
re-reading; `db/migrations/` supersedes it entirely and is the only schema that
runs.

**Now verified rather than assumed** — the M0 blocker is gone:

- `npm run db:reset` rebuilds the whole schema from `db/migrations/` and seeds
  it. Ran clean; all 8 migrations applied first time.
- 16 RLS tests and 11 database state-machine tests pass against a real Postgres,
  all executed as the non-BYPASSRLS `wok_app` role.
- The concurrent-claim race is staged with two genuinely competing NGOs and two
  in-flight transactions.

**A false pass worth remembering.** The first version of the concurrency test
picked `ngos[0]` and `ngos[1]` alphabetically. `ngos[0]` was an NGO that does
not accept `clothes`, so RLS correctly hid the item from it — exactly one claim
succeeded and the test went green without ever staging a race. Fixtures for RLS
tests must be selected by the attribute under test, never by array position.
`loadFixtures().ngosAccepting(category)` exists for this.

**A real bug the seed caught.** `normalisePhone` stripped a leading `91` as a
country code, which corrupts every genuine 10-digit number starting 91 —
including four of the five seeded NGOs. Country codes are now stripped only when
the total length says it is one. Regression tests in
`src/lib/validation/auth.test.ts`.

## Still open

- **`storage/` is a local directory, not object storage.** Fine for the pilot,
  wrong for anything with more than one API process.
- **File authorization is coarse.** Any signed-in user who knows a storage path
  can read it; paths are unguessable UUIDs. M6 needs this tightened, because
  acknowledgement photos are meant to be donor-only.
- **No realtime yet.** M3 asks for a subscription so a claimed brick disappears
  from other NGOs' walls without a refresh. The plan is SSE over Postgres
  `LISTEN/NOTIFY`; right now the wall only refreshes on the claiming client.
- **`profiles` has no cross-party read policy.** An NGO cannot yet read the
  donor's name or contact for an item it has claimed, which M4 needs for the
  pickup handoff.

## EEGAI rebrand and the Coimbatore move

The project was Wall of Kindness, launching in Nashik. It is now EEGAI (ஈகை,
Tamil for giving), launching in Coimbatore. Both changes were more than string
swaps:

- The font stack carried **Noto Sans Devanagari** for Marathi and Hindi, which
  is the wrong script for Tamil Nadu. Now Noto Sans Tamil, in all three stacks.
- The category enum grew from three to six (`education`, `furniture`,
  `household`). `toys` was **kept**, not dropped: live rows use it, Postgres
  cannot remove an enum value without rewriting every dependent column, and a
  toy is a real thing people give. If the brief means to exclude toys, say so
  and it becomes a data migration rather than a schema one.
- The database role and database name moved from `wok_app`/`wall_of_kindness`
  to `eegai_app`/`eegai`, and the repo folder was renamed. Cheap now, painful
  later.

## Two real bugs found by building the admin

**Enum arrays came back as strings.** `accepts_categories` is
`donation_category[]`, a custom enum array. node-postgres has no parser
registered for that OID, so it returned the raw `'{clothes,books}'` string.
`ngo.accepts_categories.map(...)` then threw and blanked the whole panel. Every
query now casts `::text[]`.

Worth noting _why this hid for so long_: the RLS test did
`categories.includes('clothes')`, and `String.prototype.includes` on
`'{clothes,books}'` returns true. The test was passing for the wrong reason,
exactly like the earlier concurrency false-pass. **Any assertion that works on
both a string and an array is not testing what it looks like it is testing.**

**Posting an item did not refresh the donor's list.** The mutation never
invalidated `['donations']`, so a donor landed back on a 30-second-stale cache
with their item absent — which reads as "it didn't work" and invites a
duplicate post.

The error boundary added in the same session caught the first one and showed a
reference id, which is precisely what it was built for.
