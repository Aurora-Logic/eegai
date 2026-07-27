# Wall of Kindness

A donation platform for physical goods, launching in Nashik, Maharashtra. A
donor photographs an item they no longer need, posts it, and a verified NGO
claims it. The item reaches the NGO by courier or by a vetted volunteer.

The build plan is [PLAN.md](PLAN.md) — read it before changing anything.
Decisions are logged in [DECISIONS.md](DECISIONS.md); dead ends and deferred
work in [NOTES.md](NOTES.md).

**Status: M0 (foundation) complete.** Auth lands in M1.

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in after starting Supabase, below
npm run dev
```

The app runs at http://127.0.0.1:5173. `/style-guide` renders the design tokens
and is deleted once the wall is built.

### The database

Requires Docker. Neither the Supabase CLI stack nor `psql` runs without it.

```bash
npx supabase start             # prints the anon key for .env.local
npm run db:types               # regenerates src/lib/types.ts — commit the result
```

`npm run db:reset` rebuilds the schema from `supabase/migrations` and reapplies
`supabase/seed.sql`.

## Scripts

| Command             | Does                                                 |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Vite dev server                                      |
| `npm run build`     | Production build                                     |
| `npm run typecheck` | `tsc --build`, strict                                |
| `npm run lint`      | ESLint                                               |
| `npm run format`    | Prettier, write                                      |
| `npm run test`      | Vitest unit tests                                    |
| `npm run test:e2e`  | Playwright (needs `npx playwright install chromium`) |
| `npm run db:reset`  | Rebuild schema + seed                                |
| `npm run db:types`  | Regenerate DB types                                  |

## Conventions worth knowing before your first PR

- **Every table has RLS on from the migration that creates it.** No exceptions,
  not even temporarily.
- **No direct writes to `donation.status`.** Everything goes through
  `transition()` in `src/lib/state-machine.ts`; an ESLint rule enforces it.
- **`src/lib/types.ts` is generated.** Never hand-edit it — run `npm run db:types`.
- **Every user-facing string goes through `t()`**, even though English is the
  only locale in v1.
- **Migration first, then types, then UI.**
