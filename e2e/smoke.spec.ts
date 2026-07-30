import { expect, test } from '@playwright/test'

test('the landing page loads, and the legal pages are reachable from it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // These two must be readable *before* registering — someone deciding whether
  // to hand over a phone number is entitled to read the terms first.
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible()

  await page.getByRole('link', { name: 'Terms' }).click()
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible()
})

test('the theme toggle inverts the ground', async ({ page }) => {
  await page.goto('/guide')

  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)

  // The suite runs at a phone viewport, where the header actions live behind
  // one menu — six icon buttons plus a back arrow do not fit in 360px. On a
  // wider screen the same button is already on the header, so the menu is
  // opened only when it is there to open.
  // Inside the menu it is a menuitem rather than a button, so the toggle is
  // matched on its name across both roles.
  // Waited for rather than probed with isVisible(): the route is lazy, so an
  // immediate probe answers "not visible" for the chunk that has not arrived
  // and the test then looks for a button that only a wide screen has.
  const menu = page.getByRole('button', { name: 'Menu' })
  await expect(menu).toBeVisible()
  await menu.click()

  await page
    .getByRole('menuitem', { name: 'Switch theme' })
    .or(page.getByRole('button', { name: 'Switch theme' }))
    .first()
    .click()
  await expect(html).toHaveClass(/dark/)
})
