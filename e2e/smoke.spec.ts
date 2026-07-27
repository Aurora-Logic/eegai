import { expect, test } from '@playwright/test'

test('the wall loads and the style guide is reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'EEGAI' })).toBeVisible()

  await page.getByRole('link', { name: 'Style guide' }).click()
  await expect(page.getByRole('heading', { name: 'Style guide', level: 1 })).toBeVisible()
})

test('the theme toggle inverts the ground', async ({ page }) => {
  await page.goto('/style-guide')

  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Switch theme' }).click()
  await expect(html).toHaveClass(/dark/)
})
