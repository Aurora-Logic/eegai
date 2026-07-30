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

  await page.getByRole('button', { name: 'Switch theme' }).click()
  await expect(html).toHaveClass(/dark/)
})
