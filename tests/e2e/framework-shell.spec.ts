import { expect, test } from '@playwright/test';

test.describe('framework shell', () => {
  test('loads the home route', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Version')).toBeVisible();
  });

  test('boots directly into the JSON transfer surface', async ({ page }) => {
    await page.goto('/json-transfer');

    await expect(page.getByRole('heading', { name: 'JSON Data Transfer' })).toBeVisible();
  });
});
