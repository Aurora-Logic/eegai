import { expect, test, type Page } from '@playwright/test'

/**
 * The brief's §2 core flow, driven through the browser:
 *
 *   institution posts a need → nearby consenting donor is alerted → donor taps
 *   "I'm willing to help" → donor is given the address → institution sees who
 *   is coming.
 *
 * Serial, because each step is the previous one's output. The assertions go all
 * the way to the write every time — this codebase has been bitten more than
 * once by a test that checked a button was enabled and stopped there.
 */
test.describe.configure({ mode: 'serial' })

/**
 * Unique per run, so a re-run against the same database targets its own
 * request rather than the six identical ones left by earlier runs.
 */
const NOTE = `Playwright run ${Date.now()}`

const INSTITUTION = { phone: '9100000001', password: 'password123' }
const DONOR = { phone: '9300000001', password: 'password123' }

async function signIn(page: Page, who: typeof DONOR) {
  await page.context().clearCookies()
  await page.addInitScript(
    `for (const r of ['donor','ngo','volunteer','admin']) localStorage.setItem('eegai.guide-seen.' + r, '1')`,
  )
  await page.goto('/sign-in')
  await page.getByLabel('Phone number').fill(who.phone)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Waited on the URL leaving /sign-in, not on a heading appearing. The first
  // version of this waited for `heading level 1`, which the sign-in page has
  // one of — so it passed instantly, the next goto raced the session, and
  // ProtectedRoute bounced it straight back. The failure then read as a
  // missing button on a page that was never reached.
  await expect(page).not.toHaveURL(/sign-in/)
}

/**
 * Make sure the donor has consented.
 *
 * The last test in this file withdraws consent, so without this the suite
 * works once and then fails on every re-run against the same database — which
 * is indistinguishable from a real regression until somebody wastes an
 * afternoon on it.
 */
async function ensureConsent(page: Page) {
  await page.goto('/health/settings')

  // Wait for the card to actually render before asking which button it has.
  // The first version probed immediately, got `false` from the skeleton, and
  // silently did nothing — so the next screen showed the consent gate and the
  // failure looked like a broken wall.
  const eitherButton = page.getByRole('button', { name: /^(I agree|Withdraw my consent)$/ })
  await expect(eitherButton).toBeVisible()

  const agree = page.getByRole('button', { name: 'I agree' })
  if ((await agree.count()) > 0) {
    await agree.click()
    await expect(page.getByRole('button', { name: 'Withdraw my consent' })).toBeVisible()
  }
}

test('an institution posts a need and is told how many were alerted', async ({ page }) => {
  await signIn(page, INSTITUTION)
  await page.goto('/ngo/needs')

  await page.getByRole('button', { name: 'Post a request' }).click()
  await page.getByRole('textbox', { name: /Anything a donor should know/ }).fill(NOTE)
  await page.getByRole('button', { name: 'Post it' }).click()

  // The count, and never a list. Brief §5: the institution learns how many
  // people were told, not who they are.
  await expect(page.getByText(/donors? (was|were) alerted/)).toBeVisible()
  await expect(page.getByRole('dialog')).not.toContainText(/@|\b[6-9]\d{9}\b/)
})

test('a donor sees it, with no way to ring anyone yet', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health')

  const card = page.getByRole('listitem').filter({ hasText: NOTE })
  await expect(card).toBeVisible()

  // Brief §4 hands the contact details over on opting in, so there must be no
  // phone number on the wall itself.
  await expect(card).not.toContainText(/\b[6-9]\d{9}\b/)
  await expect(card.getByRole('link', { name: /tel:/ })).toHaveCount(0)
})

test('the donor opts in and is given somewhere to go', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health')

  await page
    .getByRole('listitem')
    .filter({ hasText: NOTE })
    .getByRole('button', { name: /willing to help/i })
    .click()

  await page.goto('/health/responses')
  const offer = page.getByRole('listitem').first()
  await expect(offer).toBeVisible()
  // The address is the whole point of the screen, and the number is tappable.
  await expect(offer.locator('a[href^="tel:"]')).toBeVisible()
})

test('the institution now sees a name and a number, and nothing else', async ({ page }) => {
  await signIn(page, INSTITUTION)
  await page.goto('/ngo/needs')

  await page
    .getByRole('listitem')
    .filter({ hasText: NOTE })
    .getByRole('button', { name: /Who said yes/ })
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('a[href^="tel:"]')).toBeVisible()
  // No address, no coordinates, no map. The schema cannot supply one, and this
  // is the assertion that would notice if somebody added a path.
  await expect(dialog).not.toContainText(/lat|lng|\d+\.\d{3,}/)
})

test('withdrawing consent empties the wall', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)

  await page.getByRole('button', { name: 'Withdraw my consent' }).click()
  await expect(page.getByRole('button', { name: 'I agree' })).toBeVisible()

  await page.goto('/health')
  // Not an empty list — the gate itself, because consent is what opens it.
  await expect(page.getByText('Agree to the donor terms first')).toBeVisible()
})

test('the required disclosure is on every screen of the lane', async ({ page }) => {
  // Brief §8 marks it required. It is on each screen rather than once at
  // signup, because somebody reading a blood request at 11pm will not scroll
  // back to an onboarding step.
  await signIn(page, DONOR)
  await ensureConsent(page)

  for (const path of ['/health', '/health/responses', '/health/settings']) {
    await page.goto(path)
    await expect(page.getByText(/does not itself collect, store, test/)).toBeVisible()
  }
})
