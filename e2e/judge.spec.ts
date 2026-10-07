import { expect, test, type Page } from '@playwright/test'
import { FAIL_AT, REVIEW_AT, judge, judgeAvailable, type Rule, type Verdict } from './support/judge'

/**
 * Every screen, as every role, read for what it means.
 *
 * The other specs check that the product works. This one checks that it never
 * *says* something the brief forbids, in any wording: claiming to test blood,
 * handing a donor's location to a hospital, sharing a number before the donor
 * agrees, or involving money. See support/judge.ts for the rules and why
 * meaning, not strings, is what has to be checked.
 *
 * Skipped without TYPESAFE_AI_KEY, so the suite still runs anywhere. It sends
 * the seeded test data on these screens to TypeSafe — fake people only. Never
 * point it at a database with real donors in it.
 */
test.skip(!judgeAvailable, 'TYPESAFE_AI_KEY is not set')
test.describe.configure({ mode: 'serial' })

const SCREENS: { who: string; phone: string | null; paths: string[] }[] = [
  { who: 'visitor', phone: null, paths: ['/', '/sign-up', '/privacy', '/terms', '/guide'] },
  {
    who: 'donor',
    phone: '9300000001',
    paths: [
      '/health',
      '/health/blood',
      '/health/hair',
      '/health/milk',
      '/health/responses',
      '/health/settings',
      '/donor',
      '/guide',
    ],
  },
  { who: 'hospital', phone: '9100000001', paths: ['/ngo/needs', '/guide'] },
  { who: 'ngo', phone: '9100000002', paths: ['/ngo', '/ngo/needs'] },
  { who: 'admin', phone: '9000000001', paths: ['/admin'] },
]

async function signIn(page: Page, phone: string | null) {
  await page.addInitScript(
    `for (const r of ['donor','ngo','volunteer','admin']) localStorage.setItem('eegai.guide-seen.' + r, '1')`,
  )
  if (!phone) return
  // Through the API: signing in is not what this spec is checking, and the
  // UI path is already covered by every other spec.
  const res = await page.request.post('/api/auth/login', {
    data: { phone, password: 'password123' },
  })
  expect(res.ok(), `sign in as ${phone}`).toBe(true)
}

function worst(verdict: Verdict): [Rule, number] {
  return (Object.entries(verdict) as [Rule, number][]).sort((a, b) => b[1] - a[1])[0]!
}

test('the judge still tells a breach from a denial', async () => {
  // If these two drift together, every screen below would pass for the wrong
  // reason — so this runs first, every time, and the screens are not trusted
  // unless it does.
  const breach = await judge(
    'Donate blood with EEGAI. Our team tests your blood and decides whether you are eligible. We share your home address with the hospital so they can visit, and they get your phone number as soon as you register. Each donation earns you ₹200.',
  )
  for (const [rule, value] of Object.entries(breach)) {
    expect(value, `deliberate breach of ${rule} was not flagged`).toBeGreaterThanOrEqual(FAIL_AT)
  }

  // The required disclosure names blood testing only to deny it. A judge that
  // matched words instead of meaning would fail it — this is the case that
  // separates the two.
  const denial = await judge(
    'EEGAI connects willing donors with verified organisations. It does not itself collect, store, test, process, transport or distribute blood or breast milk, and does not determine medical eligibility. Your exact location is never shown to anybody. No money changes hands.',
  )
  for (const [rule, value] of Object.entries(denial)) {
    expect(value, `a denial was read as a breach of ${rule}`).toBeLessThan(REVIEW_AT)
  }
})

for (const { who, phone, paths } of SCREENS) {
  test(`nothing a ${who} sees breaks the brief`, async ({ page }) => {
    await signIn(page, phone)
    const failures: string[] = []

    for (const path of paths) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')

      const text = (await page.locator('main').innerText()).trim()
      // An empty main means the screen did not render, which is a failure of
      // its own — judging nothing would pass every rule.
      expect(text.length, `${path} rendered no text`).toBeGreaterThan(40)

      const verdict = await judge(text)
      const [rule, value] = worst(verdict)
      const line = `${who.padEnd(8)} ${path.padEnd(20)} worst ${rule} ${value.toFixed(2)}`
      console.log(value >= REVIEW_AT ? `REVIEW ${line}` : `       ${line}`)

      for (const [r, v] of Object.entries(verdict)) {
        if (v >= FAIL_AT) failures.push(`${path}: ${r} = ${v.toFixed(2)}`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
}
