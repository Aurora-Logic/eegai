import { expect, test } from '@playwright/test'

/**
 * The OTP handover chain — the third critical flow (PLAN.md §3), end to end:
 * NGO claims, donor picks a volunteer, volunteer accepts, then both gates.
 *
 * Serial because every step depends on the previous one having happened.
 */
test.describe.configure({ mode: 'serial' })

const NGO = { phone: '9100000001', password: 'password123' }
const DONOR = { phone: '9300000001', password: 'password123' }
const VOLUNTEER = { phone: '9200000001', password: 'password123' }

async function signIn(page: import('@playwright/test').Page, who: typeof NGO) {
  await page.goto('/sign-out-not-a-route').catch(() => {})
  await page.context().clearCookies()
  await page.goto('/sign-in')
  await page.getByLabel('Phone number').fill(who.phone)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Reads a code off the signed-in party's own Handover codes panel. */
async function readCode(page: import('@playwright/test').Page, label: RegExp) {
  const row = page.getByRole('listitem').filter({ hasText: label })
  await expect(row.first()).toBeVisible({ timeout: 10_000 })
  const text = await row.first().innerText()
  const match = text.match(/\b(\d{4})\b/)
  expect(match, `no 4-digit code in: ${text}`).not.toBeNull()
  return match![1]!
}

let itemTitle = ''

test('an NGO claims an item belonging to our donor', async ({ page }) => {
  // The item has to be *this* donor's, or the next step has nothing to choose
  // a delivery method for. The seed spreads donations across six donors.
  await signIn(page, DONOR)
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible()

  const posted = page.locator('article').filter({ hasText: 'posted' }).first()
  await expect(posted).toBeVisible()
  itemTitle = await posted.getByRole('heading').innerText()

  await signIn(page, NGO)
  await expect(page.getByRole('heading', { name: 'The wall' })).toBeVisible()

  const brick = page.locator('article').filter({ hasText: itemTitle }).first()
  await expect(brick).toBeVisible()
  await brick.getByRole('button', { name: /Claim this/ }).click()
  await expect(page.getByText('Claimed.')).toBeVisible()
})

test('the donor chooses a volunteer', async ({ page }) => {
  await signIn(page, DONOR)
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible()

  const card = page.locator('article').filter({ hasText: itemTitle }).first()
  await card.getByRole('button', { name: 'A volunteer' }).click()

  // The choice sticks: the prompt disappears once delivery_method is set.
  await expect(card.getByRole('button', { name: 'A volunteer' })).toHaveCount(0)
})

test('a volunteer accepts the pickup', async ({ page }) => {
  await signIn(page, VOLUNTEER)
  await expect(page.getByRole('heading', { name: 'Pickups' })).toBeVisible()

  const card = page.getByRole('listitem').filter({ hasText: itemTitle }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: "I'll collect this" }).click()

  await page.getByRole('dialog').getByRole('button', { name: 'Take it' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a wrong code does not advance the item', async ({ page }) => {
  await signIn(page, VOLUNTEER)
  await page.getByRole('tab', { name: /Your runs/ }).click()

  const card = page.getByRole('listitem').filter({ hasText: itemTitle }).first()
  await card.getByRole('button', { name: /enter the donor's code/i }).click()

  await page.getByRole('textbox', { name: 'Code' }).fill('0000')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()

  // Rejected, dialog stays open, nothing moved.
  await expect(page.getByRole('alert')).toContainText('not right')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('the real codes complete the handover', async ({ page }) => {
  // Collect gate: the donor's code.
  await signIn(page, DONOR)
  const collectCode = await readCode(page, /when they collect/i)

  await signIn(page, VOLUNTEER)
  await page.getByRole('tab', { name: /Your runs/ }).click()
  let card = page.getByRole('listitem').filter({ hasText: itemTitle }).first()
  await card.getByRole('button', { name: /enter the donor's code/i }).click()
  await page.getByRole('textbox', { name: 'Code' }).fill(collectCode)
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Deliver gate: the NGO's code.
  await signIn(page, NGO)
  const deliverCode = await readCode(page, /when they deliver/i)

  await signIn(page, VOLUNTEER)
  await page.getByRole('tab', { name: /Your runs/ }).click()
  card = page.getByRole('listitem').filter({ hasText: itemTitle }).first()
  await card.getByRole('button', { name: /enter the NGO's code/i }).click()
  await page.getByRole('textbox', { name: 'Code' }).fill(deliverCode)
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()

  await expect(card.getByText('Handed over')).toBeVisible({ timeout: 10_000 })
})

test('the OTP never appears in any response the volunteer can see', async ({ request }) => {
  // The M4 acceptance criterion, asserted against the wire rather than the UI.
  await request.post('/api/auth/login', { data: VOLUNTEER })

  for (const path of ['/api/pickups/open', '/api/pickups/mine', '/api/pickups/notifications']) {
    const response = await request.get(path)
    const body = await response.text()
    expect(body, path).not.toMatch(/collect_otp|deliver_otp/)
    // A volunteer's own notification list must carry no codes either.
    expect(body, path).not.toMatch(/"code"\s*:\s*"\d{4}"/)
  }
})
