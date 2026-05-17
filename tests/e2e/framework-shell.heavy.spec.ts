import { expect, test, type Page } from '@playwright/test';

async function loadBrowserFixture(
  page: Page,
  fixtureExportName: string,
): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (fixtureName) => {
    const fixturesModule = await import('/src/core/testing/fixtures.ts');
    const fixture = fixturesModule[fixtureName as keyof typeof fixturesModule];

    if (!fixture || typeof fixture !== 'object') {
      throw new Error(`Unknown browser fixture: ${fixtureName}`);
    }

    await fixturesModule.loadTestHarnessFixture(
      fixture as Parameters<typeof fixturesModule.loadTestHarnessFixture>[0],
    );
  }, fixtureExportName);
}

test.describe('framework shell heavy lane', () => {
  test('captures the home route visual baseline', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('main').last()).toHaveScreenshot('framework-shell-home.png');
  });

  test('captures the JSON transfer visual baseline', async ({ page }) => {
    await loadBrowserFixture(page, 'persistedOfflineDataFixture');
    await page.goto('/json-transfer');

    await expect(page.getByRole('main').last()).toHaveScreenshot('framework-shell-json-transfer.png');
  });

  test('captures the QR transfer visual baseline', async ({ page }) => {
    await loadBrowserFixture(page, 'persistedOfflineDataFixture');
    await page.goto('/qr-transfer');

    await expect(page.getByRole('main').last()).toHaveScreenshot('framework-shell-qr-transfer.png');
  });

  test('exports persisted scouting data from the JSON transfer surface', async ({ page }) => {
    await loadBrowserFixture(page, 'persistedOfflineDataFixture');
    await page.goto('/json-transfer');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Scouting Data as JSON' }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('ManeuverScoutingData-');
  });

  test('generates QR fountain packets from persisted scouting data', async ({ page }) => {
    await loadBrowserFixture(page, 'persistedOfflineDataFixture');
    await page.goto('/qr-transfer');

    await page.getByRole('button', { name: 'Generate Fountain Codes' }).click();
    await page.getByRole('button', { name: 'Generate & Start Auto-Cycling' }).click();

    await expect(page.getByText(/Packet #1/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate More Packets/ })).toBeVisible();
  });
});
