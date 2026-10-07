import { execFileSync } from 'node:child_process'

/**
 * Rebuild the test database before every run, where that is possible.
 *
 * The suites assert on what the seed contains, and they used to run against
 * whatever eegai_test last held. A seed change that made a hospital accept no
 * material broke an RLS test, and nobody saw it: the stale database still had
 * the old seed, so the suite stayed green until a reset turned it red on the
 * day a deploy needed it.
 *
 * Rebuilding needs a role that can drop the database. On a machine whose
 * .env.local holds only the API's low-privilege role, the reset is refused —
 * and then the run continues rather than refusing to test at all, but says
 * plainly that what follows describes the database as it was, not the code on
 * disk. Run with the superuser PGUSER (as `npm run db:reset` already needs)
 * and the warning goes away.
 *
 * SKIP_DB_RESET=1 skips it, for iterating on component tests with no database.
 */
export default function setup() {
  if (process.env.SKIP_DB_RESET === '1') return
  try {
    execFileSync('node', ['scripts/db.mjs', 'reset:test'], { stdio: 'pipe' })
  } catch (error) {
    const reason = String((error as { stderr?: Buffer }).stderr ?? '').trim() || String(error)
    console.warn(
      [
        '',
        '  ⚠ The test database was NOT rebuilt for this run:',
        `    ${reason.split('\n')[0]}`,
        '    Results describe eegai_test as it was left, which may not match the seed on disk.',
        '    Rebuild it with a superuser, e.g. PGUSER=<superuser> npm run db:reset:test',
        '',
      ].join('\n'),
    )
  }
}
