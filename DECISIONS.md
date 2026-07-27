# Decisions

One line of reasoning each, per PLAN.md §10. Newest at the bottom.

## M0 — Foundation

- **Tailwind v3, not v4.** PLAN.md §9 names `tailwind.config.ts` and
  `globals.css` explicitly; v4's CSS-first config would delete both.
- **Colour tokens live in `globals.css`, Tailwind only aliases them.** One place
  to change a brand hex; light/dark inversion is a variable swap, not a second
  palette.
- **shadcn semantic names kept (`primary`, `destructive`, …) alongside brand
  names.** Keeps `npx shadcn add` working unmodified; brand names stay available
  for the rare component that needs the literal colour.
- **`--radius` is 4px, not shadcn's 8px.** Bricks on a wall have hard corners.
- **Supabase client is a lazy singleton (`getSupabase()`), not a module-level
  `const`.** Otherwise importing anything from `supabase.ts` requires a
  configured `.env.local`, and the style-guide route dies on a fresh checkout.
- **`src/lib/types.ts` is a placeholder, not generated.** Generating needs a
  running Postgres, which needs Docker — absent on the scaffolding machine. CI
  regenerates and fails on drift, so this self-corrects on the first run.
- **Enums all declared in migration 1, ahead of their tables.** Cheap to create,
  awkward to alter inside a migration that is also creating tables.
- **`audit_log` ships with RLS on and zero policies.** Deliberate
  deny-everything: rows arrive via the security-definer trigger, and the admin
  read policy waits for `is_admin()` in M1.
- **`audit_log` carries `updated_at` despite being append-only.** Uniform with
  the §6 convention; cheaper than an exception everyone has to remember.
- **Prettier added beyond the §3 list.** Formatting tooling, not a runtime
  dependency; CI already required a lint step and format drift is noise in
  review.
- **Fonts from Google Fonts, not self-hosted.** Simpler to delete later;
  self-hosting is an M8 hardening task where the 4G latency actually gets
  measured.
- **An ESLint rule bans `.update({ status })`.** PLAN.md §7 says every status
  change goes through `transition()`; a lint rule makes a violation visible in
  review rather than in production.
- **Playwright is not in CI yet.** Needs a browser download and a running
  Supabase for no return until M4 has a real chain to protect.

## Backend swap — Supabase removed

Directed by the product owner mid-M1. §3 marked Supabase LOCKED, so this is a
deliberate, approved deviation rather than drift. PLAN.md is left as the
original record; the divergence is tracked here.

- **Local Postgres 16 via Homebrew, not Docker/PGlite/SQLite.** Keeps the SQL
  migrations, real RLS, enum types, `earthdistance` and `FOR UPDATE SKIP
LOCKED` — the four things the plan's guarantees actually rest on.
- **RLS is preserved as the real authorization boundary.** The API connects as
  `wok_app`, a role with no BYPASSRLS, and announces the caller with two
  transaction-local GUCs (`app.user_id`, `app.user_role`) set from a verified
  JWT. `auth.uid()` became `app.current_user_id()`; everything else about the
  policy design is unchanged.
- **Password auth, not OTP.** Also directed by the owner. scrypt from
  `node:crypto` at OWASP's N=2^17/r=8/p=1 rather than argon2 or bcrypt, both of
  which are native modules needing a compiler on every machine and in CI.
- **Session is an httpOnly cookie, not a bearer token in localStorage.** Vite
  proxies `/api`, so the cookie is first-party and no token is exposed to JS.
- **Hono over Express.** Smaller, native `Request`/`Response`, first-class TS.
- **OTP columns are protected by a column-level GRANT, not a policy.** The API
  role structurally cannot `SELECT collect_otp`, so no route-handler bug can
  leak one. The M4 acceptance criterion becomes a property of the schema.
- **Photo count (1–5) is a deferred constraint trigger.** "At least one" cannot
  be a row CHECK — at insert time of the first photo the count is still zero.
- **`setInterval` in the API for claim expiry, not pg_cron.** One less
  extension; the API is already a long-running process.
- **Seed passwords are all `password123`.** Local development only; the hash is
  committed so `db:reset` needs no key material.

## Deferred from the swap

- **`src/lib/types.ts` is now unused.** It described a Supabase-generated
  schema that no longer exists. Types at the API boundary are currently hand-
  written interfaces per route. Generating types from the live schema is worth
  doing but is not a blocker.
