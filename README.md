# Wall of Kindness

A donation platform for physical goods, launching in Nashik, Maharashtra. A
donor photographs an item they no longer need, posts it, and a verified NGO
claims it. The item reaches the NGO by courier or by a vetted volunteer.

[PLAN.md](PLAN.md) is the build plan — read it before changing anything. It
still describes Supabase as the backend; that was replaced with local Postgres
plus a Node API partway through M1, and the divergence is recorded in
[DECISIONS.md](DECISIONS.md). Dead ends and deferred work are in [NOTES.md](NOTES.md).

**Status:** M0 complete, M1 complete, M2–M3 partly built. Sign-in, posting an
item, the wall and claiming all work end to end. Volunteer and admin screens are
shells.

## Getting started

Needs Node 20.19+ and PostgreSQL 16. No Docker.

```bash
brew install postgresql@16
brew services start postgresql@16

npm install
npm run db:setup      # creates the wok_app role and both databases
npm run db:reset      # migrations + seed + placeholder photos
npm run dev           # API on :8787, web on :5173
```

Every seeded account signs in with the password **`password123`**:

| Role                     | Phone        |
| ------------------------ | ------------ |
| Admin                    | `9000000001` |
| NGO (accepts everything) | `9100000001` |
| NGO (books only)         | `9100000004` |
| Volunteer                | `9200000001` |
| Donor                    | `9300000001` |

Sign in as the NGO to see the wall and claim something; as the donor to post an
item. `/style-guide` renders the design tokens and is deleted once the wall is
finished.

## Architecture

```
src/          React 18 + Vite PWA
  app/        routes, one folder per role
  components/ ui (shadcn) · wall (the masonry brick) · shared
  lib/        api client · state machine · i18n · Zod schemas (shared with the API)
server/src/   Hono API — auth, donations, uploads
db/migrations numbered SQL, applied by scripts/db.mjs
```

**Authorization lives in Postgres, not in route handlers.** The API connects as
`wok_app`, a role with no `BYPASSRLS`, and announces the caller by setting two
transaction-local GUCs from a verified JWT. Every RLS policy in `db/migrations`
therefore applies to every query the API runs. The NGO wall has no `WHERE`
clause filtering by category or radius — the policy does that, so it cannot
drift.

## Scripts

| Command                   | Does                                                 |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | API + web together                                   |
| `npm run build`           | Production build                                     |
| `npm run typecheck`       | `tsc --build`, strict                                |
| `npm run lint` / `format` | ESLint / Prettier                                    |
| `npm run test`            | Vitest — unit, RLS, and DB state machine             |
| `npm run test:e2e`        | Playwright (needs `npx playwright install chromium`) |
| `npm run db:reset`        | Rebuild schema + seed + seed photos                  |
| `npm run db:reset:test`   | Same, against the test database                      |
| `npm run icons`           | Regenerate the PWA icon set                          |

## Conventions worth knowing before your first PR

- **Every table has RLS on from the migration that creates it.** No exceptions.
- **No direct writes to `donations.status`.** Everything goes through
  `transition()` in [src/lib/state-machine.ts](src/lib/state-machine.ts), and
  through `guard_donation_transition` in the database. An ESLint rule enforces
  the first; the trigger enforces the second even against a direct `psql`
  session.
- **The state machine is mirrored in two places on purpose** — TypeScript for
  the UI, `app.donation_transitions` for the guarantee. Change both or neither.
- **Zod schemas in `src/lib/validation/` are imported by both** the React forms
  and the API routes, so a rule cannot be enforced on one side and forgotten on
  the other.
- **Every user-facing string goes through `t()`**, even though English is the
  only locale in v1.
- **Migration first, then the API, then the UI.**
