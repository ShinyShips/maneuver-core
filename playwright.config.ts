import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'pr-chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'heavy-chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'heavy-webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },
  ],
  webServer: {
    command: `npm.cmd run dev:vite -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
