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
