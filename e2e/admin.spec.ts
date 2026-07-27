import { expect, test } from '@playwright/test'

/**
 * M7 acceptance (PLAN.md §9): "no admin route is reachable by a non-admin,
 * verified at both the route level and the RLS level."
 */

const ADMIN = { phone: '9000000001', password: 'password123' }
const DONOR = { phone: '9300000001', password: 'password123' }

async function signIn(page: import('@playwright/test').Page, who: typeof ADMIN) {
  await page.goto('/sign-in')
  await page.getByLabel('Phone number').fill(who.phone)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('an admin sees the metrics that matter', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()

  // §1's success metric leads the dashboard.
  await expect(page.getByText('Completed donations')).toBeVisible()
  await expect(page.getByText('Organisations waiting')).toBeVisible()
})

/**
 * These two mutate the shared pending queue, so they must not interleave —
 * run in parallel they race for the same rows and one finds an empty queue.
 * The seed provides two pending organisations, one for each test.
 */
test.describe.serial('verification decisions', () => {
  test('an admin can verify a pending organisation', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.getByRole('tab', { name: 'Organisations' }).click()

    // Cards, not a table — so no header row to skip, and the role no longer
    // changes with the viewport the way a table's did below md.
    const cards = page.getByRole('listitem')
    await expect(cards.first()).toBeVisible()
    const before = await cards.count()

    await cards.first().getByRole('button', { name: 'Approve' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Approve')
    await dialog.getByRole('button', { name: 'Approve' }).click()

    await expect(dialog).toHaveCount(0)
    // One fewer row in the pending queue, or the queue is now empty entirely.
    await expect(async () => {
      const after = await page.getByRole('listitem').count()
      expect(after).toBeLessThan(before)
    }).toPass({ timeout: 5000 })
  })

  test('a rejection cannot be saved without a reason', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.getByRole('tab', { name: 'Organisations' }).click()

    const card = page.getByRole('listitem').first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Reject' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Reject' })).toBeDisabled()

    await dialog.getByLabel('Reason').fill('Registration number does not match DARPAN.')
    await expect(dialog.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })
})

test('the dispute view shows a full trail with request ids', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.getByRole('tab', { name: 'Items' }).click()

  await page.getByRole('listitem').first().getByRole('link', { name: 'Open' }).click()

  await expect(page.getByRole('heading', { name: 'Item trail' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()
  await expect(page.getByText('What the donor confirmed')).toBeVisible()
  await expect(page.getByText(/Raw audit rows \(\d+\)/)).toBeVisible()
})

test('a donor cannot reach any admin route', async ({ page }) => {
  await signIn(page, DONOR)
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible()

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/donor$/)

  await page.goto('/admin/items/00000000-0000-0000-0000-000000000000')
  await expect(page).toHaveURL(/\/donor$/)
})

test('the API refuses admin endpoints for a donor even without the UI', async ({ request }) => {
  // Route guards are a courtesy; this is the boundary that matters.
  await request.post('/api/auth/login', { data: DONOR })

  for (const path of ['/api/admin/metrics', '/api/admin/ngos', '/api/admin/users']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(403)
  }
})
