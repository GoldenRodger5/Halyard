import { defineConfig, devices } from '@playwright/test';

/**
 * Load `.env` before the tests decide what they can check.
 *
 * Several specs guard on a secret being present — `test.skip(!secret, ...)` —
 * which is right when the secret genuinely cannot exist, and quietly wrong
 * here. Playwright's own process never read `.env`, so the five tests covering
 * the cron entrypoints skipped unless the operator happened to have exported
 * `CRON_SECRET` into that shell. Those are the tests that catch the GET/POST
 * mismatch that would have made every scheduled task 405 in production.
 *
 * The suite reported "47 passed" and "42 passed, 6 skipped" on the same commit
 * depending on how it was invoked, and both looked green.
 */
if (!process.env.CRON_SECRET) {
  // `apps/web/.env.local` is where the web app's secrets actually live — the
  // first version of this looked for a root `.env`, which does not exist, and
  // so fixed nothing while appearing to.
  try {
    process.loadEnvFile('apps/web/.env.local');
  } catch {
    // Absent is a legitimate state — CI supplies the environment directly.
  }
}

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
    /*
     * §568. The cheap check that explains the expensive failure, run first.
     *
     * The studio reorganisation renamed every screen and the specs were not
     * moved with it, so 35 routes 404. Each test then waits 10s for a heading
     * on a 404 page and times out at 60s, and the job's ceiling is 20 minutes
     * — so the suite never reaches the end and the reason never appears. The
     * job has only ever been reported as a timeout.
     *
     * As a dependency it runs before either browser project and, when it
     * fails, the rest are skipped: the whole job then finishes in seconds
     * naming all 35 routes, instead of burning twenty minutes saying nothing.
     * It opens no browser and touches no database.
     */
    { name: 'preflight', testMatch: /preflight\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['preflight'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testMatch: /mobile\.spec\.ts/,
      dependencies: ['preflight'],
    },
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
