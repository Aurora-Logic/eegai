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
