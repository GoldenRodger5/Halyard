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
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.HALYARD_URL ?? 'https://halyard-ten.vercel.app',
    ...(existsSync(AUTH) ? { storageState: AUTH } : {}),
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    /* A visible cursor: reviewers need to see what is being clicked. */
    launchOptions: { args: ['--force-prefers-reduced-motion'] },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
  },
  outputDir: './docs/tiktok-review/raw',
});
