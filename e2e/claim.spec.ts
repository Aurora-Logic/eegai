import { expect, test } from '@playwright/test'

/**
 * The claim flow — one of the three critical paths PLAN.md §3 asks Playwright
 * to cover. Runs against the seeded database, so it needs `npm run db:reset`
 * and `npm run dev` first.
 */

const NGO = { phone: '9100000001', password: 'password123' } // Sahyadri, takes all categories
const DONOR = { phone: '9300000001', password: 'password123' }

async function signIn(page: import('@playwright/test').Page, who: typeof NGO) {
  await page.goto('/sign-in')
  await page.getByLabel('Phone number').fill(who.phone)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('an NGO signs in, sees the wall, and claims a brick', async ({ page }) => {
  await signIn(page, NGO)

  await expect(page.getByRole('heading', { name: 'The wall' })).toBeVisible()

  const bricks = page.locator('article')
  // count() does not auto-wait. The shell renders its heading before the wall
  // query resolves, so without this the count is a race the test can lose.
  await expect(bricks.first()).toBeVisible()
  const before = await bricks.count()
  expect(before).toBeGreaterThan(0)

  await bricks
    .first()
    .getByRole('button', { name: /Claim this/ })
    .click()

  await expect(page.getByText('Claimed.')).toBeVisible()

  // The claimed brick lifts off and the wall is one shorter.
  await expect(async () => {
    expect(await bricks.count()).toBe(before - 1)
  }).toPass({ timeout: 5000 })

  // And it turns up under "Your claims".
  await page.getByRole('button', { name: 'Your claims' }).click()
  await expect(page.getByRole('heading', { name: 'Your claims' })).toBeVisible()
  await expect(page.locator('article').first()).toBeVisible()
})

test('a donor cannot reach the NGO wall', async ({ page }) => {
  await signIn(page, DONOR)

  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible()

  // Route guard sends them back to their own shell rather than showing an
  // empty wall.
  await page.goto('/ngo')
  await expect(page).toHaveURL(/\/donor$/)
})

test('a signed-out visitor is sent to sign in', async ({ page }) => {
  await page.goto('/donor')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('wrong password is refused', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Phone number').fill(NGO.phone)
  await page.getByLabel('Password').fill('definitely-wrong')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toContainText('do not match')
})
