import { expect, test, type Page } from '@playwright/test'

/**
 * The donor module, driven through the browser:
 *
 *   hospital posts a blood alert → every registered blood donor sees it → the
 *   donor answers Not available (nothing shared), then Available → the donor is
 *   given the address → the hospital sees who can come.
 *
 * Then hair and breast milk, offered by the donor to a partner, and the
 * hospital sign-up that requires the terms.
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
const HAIR_PARTNER = { phone: '9100000003', password: 'password123' }

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

test('a hospital posts a blood alert and is told how many were alerted', async ({ page }) => {
  await signIn(page, INSTITUTION)
  await page.goto('/ngo/needs')

  await page.getByRole('button', { name: 'Post a blood alert' }).first().click()
  const dialog = page.getByRole('dialog')
  // The send button waits for a group: the spec's alert always carries one.
  await expect(dialog.getByRole('button', { name: 'Send the alert' })).toBeDisabled()
  // A- on purpose: the seeded donor is O+, and the spec alerts every blood
  // donor, not only the matching group.
  await dialog.getByRole('combobox', { name: 'Blood group' }).click()
  await page.getByRole('option', { name: 'A-' }).click()
  await dialog.getByLabel('Units required').fill('2')
  await dialog.getByRole('textbox', { name: /Anything a donor should know/ }).fill(NOTE)
  await dialog.getByRole('button', { name: 'Send the alert' }).click()

  // The count, and never a list. Brief §5: the institution learns how many
  // people were told, not who they are.
  await expect(page.getByText(/donors? (was|were) alerted/)).toBeVisible()
  await expect(dialog).not.toContainText(/@|\b[6-9]\d{9}\b/)
})

test('a blood donor of another group sees it, with no way to ring anyone yet', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health/blood')

  const card = page.getByRole('listitem').filter({ hasText: NOTE })
  await expect(card).toBeVisible()
  // What the spec's notification shows.
  await expect(card).toContainText('A-')
  await expect(card).toContainText('2 units required')
  await expect(card).toContainText('Kongu Nala Sangam')
  await expect(card).not.toContainText(/\b[6-9]\d{9}\b/)
})

test('Not available shares nothing with the hospital', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health/blood')

  const card = page.getByRole('listitem').filter({ hasText: NOTE })
  await card.getByRole('button', { name: 'Not available' }).click()
  await expect(card.getByText('Your number was not shared.')).toBeVisible()

  await signIn(page, INSTITUTION)
  await page.goto('/ngo/needs')
  await page
    .getByRole('listitem')
    .filter({ hasText: NOTE })
    .getByRole('button', { name: /Available donors/ })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('1 said not available')
  await expect(dialog.locator('a[href^="tel:"]')).toHaveCount(0)
})

test('Available gives the donor somewhere to go', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health/blood')

  const card = page.getByRole('listitem').filter({ hasText: NOTE })
  await card.getByRole('button', { name: 'Available to donate' }).click()
  await expect(card.getByText('The hospital will contact you.')).toBeVisible()

  await page.goto('/health/responses')
  const offer = page.getByRole('listitem').filter({ hasText: 'Kongu Nala Sangam' }).first()
  await expect(offer).toBeVisible()
  await expect(offer.locator('a[href^="tel:"]')).toBeVisible()
})

test('the hospital sees what the spec allows, and no location', async ({ page }) => {
  await signIn(page, INSTITUTION)
  await page.goto('/ngo/needs')

  await page
    .getByRole('listitem')
    .filter({ hasText: NOTE })
    .getByRole('button', { name: /Available donors/ })
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('a[href^="tel:"]')).toBeVisible()
  await expect(dialog).toContainText('Lakshmi Subramanian')
  await expect(dialog).toContainText('O+')
  await expect(dialog).toContainText(/\d+ yrs/)
  await expect(dialog).toContainText(/last donated/)
  // No address, no coordinates, no map. The schema cannot supply one, and this
  // is the assertion that would notice if somebody added a path.
  await expect(dialog).not.toContainText(/lat|lng|\d+\.\d{3,}|641\d{3}/)
})

test('hair goes to the partner the donor chose, and comes back accepted', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health/hair')

  await page.getByLabel('Length of hair (in inches)').fill('8')
  const answer = (question: string, option: 'Yes' | 'No') =>
    page.getByRole('radiogroup', { name: question }).getByText(option, { exact: true }).click()
  await answer('Is the hair clean & dry?', 'Yes')
  await answer('Is the hair tied / braided?', 'Yes')
  await answer('Is the hair naturally coloured?', 'Yes')
  await answer('Is the hair bleached / chemically treated?', 'No')
  // Under ten inches is a warning, not a refusal — the partner decides.
  await expect(page.getByText('Most partners look for at least 10–12 inches.')).toBeVisible()

  await page.getByRole('combobox', { name: 'Select partner organisation' }).click()
  await page.getByRole('option', { name: /Kovai Anbu Illam/ }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/^Sent\. The organisation will review it/)).toBeVisible()

  await signIn(page, HAIR_PARTNER)
  await page.goto('/ngo/needs')
  const offer = page
    .getByRole('list', { name: 'Offers waiting' })
    .getByRole('listitem')
    .filter({ hasText: 'Lakshmi Subramanian' })
    .filter({ hasText: '8 in' })
    .first()
  await expect(offer.locator('a[href^="tel:"]')).toBeVisible()
  await offer.getByRole('button', { name: 'Accept' }).click()
  await expect(offer.getByRole('button', { name: 'Mark received' })).toBeVisible()
  // Received, so a re-run of this suite starts with nothing of ours waiting.
  await offer.getByRole('button', { name: 'Mark received' }).click()

  await signIn(page, DONOR)
  await page.goto('/health/hair')
  await expect(
    page.getByRole('list', { name: 'Your offers' }).getByText('Received').first(),
  ).toBeVisible()
})

test('breast milk cannot be sent until every eligibility point is ticked', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health/milk')

  await page.getByRole('combobox', { name: 'Lactation Management Centre' }).click()
  await page.getByRole('option', { name: /Kongu Nala Sangam/ }).click()

  const send = page.getByRole('button', { name: 'Register with the centre' })
  const boxes = page.getByRole('checkbox')
  await expect(boxes).toHaveCount(7)
  for (let i = 0; i < 6; i++) await boxes.nth(i).click()
  await expect(send).toBeDisabled()
  await boxes.nth(6).click()
  await expect(send).toBeEnabled()
})

test('registering a hospital requires the terms', async ({ page }) => {
  await page.goto('/sign-up')
  await page.getByText('Hospital', { exact: true }).click()
  await expect(page.getByText('Terms and conditions apply')).toBeVisible()

  await page.getByLabel('Hospital name').fill('Playwright General')
  await page.getByLabel('Phone number').fill('9876543210')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(
    page.getByText('Agree to the terms and conditions to register a hospital.'),
  ).toBeVisible()
  await expect(page).toHaveURL(/sign-up/)
})

test('withdrawing consent closes the donation screens', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)

  await page.getByRole('button', { name: 'Withdraw my consent' }).click()
  await expect(page.getByRole('button', { name: 'I agree' })).toBeVisible()

  for (const path of ['/health/blood', '/health/hair', '/health/milk']) {
    await page.goto(path)
    // Not an empty list — the gate itself, because consent is what opens it.
    await expect(page.getByRole('heading', { name: 'Before you register' })).toBeVisible()
  }
})

test('the required disclosure is on every screen of the lane', async ({ page }) => {
  // Brief §8 marks it required. It is on each screen rather than once at
  // signup, because somebody reading a blood alert at 11pm will not scroll
  // back to an onboarding step.
  await signIn(page, DONOR)
  await ensureConsent(page)

  for (const path of ['/health', '/health/responses', '/health/settings']) {
    await page.goto(path)
    await expect(page.getByText(/does not itself collect, store, test/)).toBeVisible()
  }
})

test('the donor home offers the four donation types and the manual', async ({ page }) => {
  await signIn(page, DONOR)
  await ensureConsent(page)
  await page.goto('/health')

  const types = page.getByRole('list', { name: 'Donation types' })
  for (const name of ['Blood', 'Hair', 'Breast milk', 'Material']) {
    await expect(types.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible()
  }

  const card = page.locator('a[href="/guide"]').filter({ hasText: 'Starts with' })
  await expect(card).toBeVisible()
  await card.click()

  await expect(page.getByRole('heading', { name: /How EEGAI works/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Breast milk', exact: true })).toBeVisible()
  // `exact` because the same words appear twice on purpose: once in the drawn
  // diagram and once in the sr-only list beside it.
  await expect(page.getByText('You donate there', { exact: true }).first()).toBeVisible()
})
