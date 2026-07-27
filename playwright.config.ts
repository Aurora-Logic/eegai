import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright covers the three flows where a bug loses someone's item
 * (PLAN.md §3): posting, claiming, and the OTP handoff. Those specs land with
 * M2–M4; M0 ships the harness and a smoke check.
 *
 * Not wired into CI yet — that needs a browser download and a running Supabase,
 * and is turned on in M4 when there is a real chain to protect.
 */
// Deliberately not Vite's default 5173 — a dev server for another project is a
// normal thing to have running, and reusing it silently tests the wrong app.
const E2E_PORT = Number(process.env.E2E_PORT ?? 5183)
const E2E_URL = `http://127.0.0.1:${E2E_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: E2E_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // A 360px Android screen is the design target (PLAN.md §8), so it is also
      // the default test viewport.
      name: 'android-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // `--strictPort` matters: without it Vite silently walks to the next free
    // port, the suite keeps pointing at E2E_PORT, and you spend an afternoon
    // testing whatever else happens to be listening there.
    command: `npm run dev -- --host 127.0.0.1 --port ${E2E_PORT} --strictPort`,
    url: E2E_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
