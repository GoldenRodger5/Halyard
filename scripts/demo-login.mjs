/**
 * Capture a signed-in browser session for the TikTok review recording. §187.
 *
 * The demo must be filmed on `halyard-ten.vercel.app`, because TikTok requires
 * the domain in the video to match the website URL on the submission. But
 * production is behind Supabase auth, and the development bypass is guarded by
 * `NODE_ENV !== 'production'` — correctly, and permanently. Playwright therefore
 * cannot sign itself in.
 *
 * So a person signs in once, in a browser this script opens, and Playwright
 * reuses the resulting session for the recording. The password is typed into
 * that window and never passes through Halyard, this script, or any log; only
 * the resulting cookies are saved, to a gitignored file.
 *
 * Run: `pnpm demo:login`
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.env.HALYARD_URL ?? 'https://halyard-ten.vercel.app';
const OUT = '.demo-auth.json';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

console.log(`\nOpening ${URL}/signin`);
console.log('Sign in in the window that just opened. This script is waiting.');
console.log('Nothing you type is visible to it — only the session cookie is saved.\n');

await page.goto(`${URL}/signin`);

/*
 * Waits for the dashboard rather than for a fixed time: signing in can involve a
 * magic link or a second device, and a timer would either cut that short or make
 * every run wait for the slowest case.
 */
await page.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 10 * 60_000 });
await page.waitForLoadState('networkidle');

if (!existsSync(dirname(OUT)) && dirname(OUT) !== '.') mkdirSync(dirname(OUT), { recursive: true });
await context.storageState({ path: OUT });
await browser.close();

console.log(`Signed in. Session saved to ${OUT} (gitignored).`);
console.log('Now run: pnpm demo:tiktok\n');
