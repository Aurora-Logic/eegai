import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Posting an item — the second of the three critical flows (PLAN.md §3), and
 * the one carrying the condition gates, which are the single control stopping
 * the platform being used as a dump.
 */

const DONOR = { phone: '9300000001', password: 'password123' }

const photo = () => ({
  name: 'item.png',
  mimeType: 'image/png',
  buffer: readFileSync('storage/seed/0.png'),
})

async function signInAsDonor(page: import('@playwright/test').Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Phone number').fill(DONOR.phone)
  await page.getByLabel('Password').fill(DONOR.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // The draft persists in localStorage by design, which would leak between tests.
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('wok.donation-draft'))
})

test('a donor posts an item through the whole wizard', async ({ page }) => {
  await signInAsDonor(page)
  await page.getByRole('link', { name: 'Post an item' }).click()

  // Step 1 — photos, via the dropzone's underlying input.
  await page.locator('input[type="file"]').setInputFiles([photo(), photo()])
  await expect(page.getByRole('listitem').filter({ has: page.locator('img') })).toHaveCount(2)
  await expect(page.getByText('Cover')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2 — what it is.
  await page.getByLabel('What is it?').fill('Winter jackets')
  await page.getByRole('button', { name: 'clothes', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 3 — the gates. All four must be yes.
  const yesButtons = page.getByRole('button', { name: 'Yes' })
  const gateCount = await yesButtons.count()
  expect(gateCount).toBe(4)
  for (let i = 0; i < gateCount; i++) await yesButtons.nth(i).click()
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 4 — pickup.
  await page.getByLabel('Pickup address').fill('12 Race Course Road')
  await page.getByLabel('Pincode').fill('641018')
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 5 — review and post.
  await expect(page.getByRole('heading', { name: 'Winter jackets' })).toBeVisible()
  await page.getByRole('button', { name: 'Put it on the wall' }).click()

  await expect(page).toHaveURL(/\/donor$/)
  await expect(page.getByRole('heading', { name: 'Winter jackets' }).first()).toBeVisible()
})

test('a failed condition gate blocks the post and says why', async ({ page }) => {
  await signInAsDonor(page)
  await page.goto('/donor/post')

  await page.locator('input[type="file"]').setInputFiles(photo())
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByLabel('What is it?').fill('Unwashed jackets')
  await page.getByRole('button', { name: 'Next' }).click()

  // Answer the first gate "No" — the reason appears and Next stays disabled.
  await page.getByRole('button', { name: 'No' }).first().click()
  await expect(page.getByRole('alert')).toContainText('Unwashed clothes are thrown away')
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('photos can be reordered, changing which one is the cover', async ({ page }) => {
  await signInAsDonor(page)
  await page.goto('/donor/post')

  await page.locator('input[type="file"]').setInputFiles([photo(), photo()])
  const tiles = page.getByRole('listitem').filter({ has: page.locator('img') })
  await expect(tiles).toHaveCount(2)

  // The cover badge sits on the first tile.
  await expect(tiles.nth(0).getByText('Cover')).toBeVisible()

  // Promote the second photo. Keyboard-accessible path, not drag.
  await page.getByRole('button', { name: 'Move photo 2 earlier' }).click()

  await expect(tiles.nth(0).getByText('Cover')).toBeVisible()
  await expect(tiles.nth(1).getByText('Cover')).toHaveCount(0)
})

test('the draft survives a reload', async ({ page }) => {
  await signInAsDonor(page)
  await page.goto('/donor/post')

  await page.locator('input[type="file"]').setInputFiles(photo())
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('What is it?').fill('Half-finished post')

  await page.reload()

  // Step resets to the start, but nothing typed is lost.
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('What is it?')).toHaveValue('Half-finished post')
})
