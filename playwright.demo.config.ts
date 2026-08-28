import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/*
 * §187. Filmed against production by default, because TikTok requires the domain
 * in the video to match the submitted website URL. `.demo-auth.json` is written
 * by `pnpm demo:login`, where a person signs in once; without it the recording
 * would land on /signin and film nothing.
 */
const AUTH = '.demo-auth.json';

/**
 * A separate config for the demo recording. §181.
 *
 * Kept apart from `playwright.config.ts` so `pnpm test:e2e` never records video
 * — the recorder is slow, writes large files, and a suite that produces
 * artefacts nobody asked for gets disabled.
 */
export default defineConfig({
  testDir: './e2e/recordings',
  /*
   * §191. Long, because the Login Kit segment waits for a person.
   *
   * TikTok's consent screen is a real page on TikTok's domain, and the only
   * honest way to film it is to let the operator sign in and press Authorize
   * while the recorder keeps rolling. That wait is minutes, not seconds, and the
   * dead time is trimmed at encode.
   */
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.HALYARD_URL ?? 'https://halyard-ten.vercel.app',
    ...(existsSync(AUTH) ? { storageState: AUTH } : {}),
    ...devices['Desktop Chrome'],
    /* Headed when a human has to authorize; headless for unattended re-records. */
    headless: process.env.DEMO_HEADED !== '1',
    viewport: { width: 1280, height: 800 },
    /* A visible cursor: reviewers need to see what is being clicked. */
    launchOptions: { args: ['--force-prefers-reduced-motion'] },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
  },
  outputDir: './docs/tiktok-review/raw',
});
