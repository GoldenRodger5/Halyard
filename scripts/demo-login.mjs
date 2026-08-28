/**
 * Capture a signed-in session for the TikTok review recording. §189.
 *
 * The demo must be filmed on `halyard-ten.vercel.app`, because TikTok requires
 * the domain in the video to match the submitted website URL — and production is
 * behind Supabase auth, with the development bypass correctly locked to
 * `NODE_ENV !== 'production'`.
 *
 * Magic-link sign-in cannot be automated: the round trip goes through a mailbox.
 * That is why §189 added password sign-in — not to weaken the gate, which is
 * still `admin_users`, but so a machine can get past the door it is allowed
 * through.
 *
 * Credentials come from the environment, never from an argument, so they do not
 * land in shell history. Only the resulting cookies are written, to a gitignored
 * file. If they are absent the script falls back to opening a window and waiting
 * for a person, which is what it did before.
 */
import { chromium } from '@playwright/test';

const URL = process.env.HALYARD_URL ?? 'https://halyard-ten.vercel.app';
const OUT = '.demo-auth.json';
const email = process.env.HALYARD_DEMO_EMAIL;
const password = process.env.HALYARD_DEMO_PASSWORD;

const headless = Boolean(email && password);
const browser = await chromium.launch({ headless });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

await page.goto(`${URL}/signin`);

if (email && password) {
  console.log(`Signing in as ${email} …`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
} else {
  console.log('\nNo HALYARD_DEMO_EMAIL / HALYARD_DEMO_PASSWORD set.');
  console.log('Sign in in the window that opened; this script is waiting.\n');
}

try {
  await page.waitForURL((u) => !u.pathname.startsWith('/signin'), {
    timeout: headless ? 45_000 : 10 * 60_000,
  });
} catch {
  const shown = await page.locator('.text-danger').first().textContent().catch(() => null);
  console.error('Sign-in did not complete.', shown ? `Page said: ${shown}` : '');
  await browser.close();
  process.exit(1);
}

await page.waitForLoadState('networkidle');
await context.storageState({ path: OUT });
await browser.close();
console.log(`Signed in. Session saved to ${OUT} (gitignored). Now run: pnpm demo:tiktok`);
