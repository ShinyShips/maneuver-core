import { expect, test } from '@playwright/test';

test.describe('framework shell', () => {
  test('loads the home route', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Version')).toBeVisible();
  });

  test('smokes the shared transfer routes', async ({ page }) => {
    await page.goto('/json-transfer');

    await expect(page.getByRole('heading', { name: 'JSON Data Transfer' })).toBeVisible();

    await page.goto('/qr-transfer');

    await expect(page.getByRole('heading', { name: 'QR Data Transfer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Fountain Codes' })).toBeVisible();
  });

  test('enters the JSON upload flow', async ({ page }) => {
    await page.goto('/json-transfer');

    await page.getByRole('button', { name: 'Upload JSON Data' }).click();

    await expect(page.getByRole('button', { name: /Back/ })).toBeVisible();
    await expect(page.getByText('automatically detect the data type')).toBeVisible();
  });
});
