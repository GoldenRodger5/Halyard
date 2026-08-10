import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. Milestone 29.
 *
 * 400+ unit and integration tests cover the parts; none of them cover the path
 * the operator walks every day. Nobody had clicked approve.
 *
 * Deliberately kept out of `vitest run`: these need a running app and a seeded
 * database, and a suite you have to set up is a suite that gets skipped if it
 * shares a command with the fast one.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.HALYARD_URL ?? 'http://localhost:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['iPhone 14'] }, testMatch: /mobile\.spec\.ts/ },
  ],

  webServer: process.env.HALYARD_URL
    ? undefined
    : {
        command: 'pnpm --filter @halyard/web dev',
        url: 'http://localhost:3200',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
