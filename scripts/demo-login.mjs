/**
 * Capture the sessions the review recording needs. §193.
 *
 * Two sign-ins, both done once, before any camera is running:
 *
 *   · **Halyard** — production is behind Supabase auth and the development
 *     bypass is correctly locked to `NODE_ENV !== 'production'`, so Playwright
 *     cannot get in by itself.
 *   · **TikTok** — so the recorded run lands directly on the *consent* screen.
 *
 * The second one is the fix for a real failure. The first version asked the
 * operator to log in to TikTok **inside the take**, which meant a QR code, a
 * phone, and minutes of dead air; the browser closed on the QR page and the
 * recording was lost along with the authorization. Logging in first means the
 * take contains only what review needs to see — Connect, consent, Authorize,
 * return — and nothing that has to be trimmed.
 *
 * Cookies for both domains land in one gitignored state file. Nothing is typed
 * through this script; it opens a window and waits.
 */
import { chromium } from '@playwright/test';

const URL = process.env.HALYARD_URL ?? 'https://halyard-ten.vercel.app';
const OUT = '.demo-auth.json';
const email = process.env.HALYARD_DEMO_EMAIL;
const password = process.env.HALYARD_DEMO_PASSWORD;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

// ── 1. Halyard ─────────────────────────────────────────────────────────────
await page.goto(`${URL}/signin`);
if (email && password) {
  console.log(`\nSigning in to Halyard as ${email} …`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
} else {
  console.log('\nSign in to Halyard in the window that opened.');
}
await page.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 5 * 60_000 });
console.log('  Halyard: signed in.');

// ── 2. TikTok ──────────────────────────────────────────────────────────────
console.log('\nNow log in to TikTok in the same window.');
console.log('Use the QR code, a password, whatever you like — take as long as you need.');
console.log('This is deliberately outside the recording, so none of it ends up in the video.\n');

await page.goto('https://www.tiktok.com/login');

/*
 * Waits for a session rather than for a URL: TikTok moves through several pages
 * during login and lands somewhere different depending on how you signed in.
 * The `sessionid` cookie is the thing that actually matters.
 */
const deadline = Date.now() + 15 * 60_000;
let signedIn = false;
while (Date.now() < deadline) {
  const cookies = await context.cookies('https://www.tiktok.com');
  if (cookies.some((c) => c.name === 'sessionid' && c.value)) { signedIn = true; break; }
  await page.waitForTimeout(2000);
}

if (!signedIn) {
  console.error('TikTok sign-in did not complete within 15 minutes.');
  await browser.close();
  process.exit(1);
}
console.log('  TikTok: signed in.');

await context.storageState({ path: OUT });
await browser.close();
console.log(`\nBoth sessions saved to ${OUT} (gitignored).`);
console.log('Now run:  DEMO_HEADED=1 pnpm demo:tiktok\n');
