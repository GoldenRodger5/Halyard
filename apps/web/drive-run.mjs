/**
 * The wizard, driven the way an operator drives it: sign in, click through,
 * press Generate, and watch the run page. Nothing is inserted into the
 * database by hand — the only writes are the ones the UI makes.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE;
const OUT = process.env.OUT;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: process.env.FILM ? { dir: OUT, size: { width: 1280, height: 900 } } : undefined,
});
const page = await context.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

await page.goto(`${BASE}/make`, { waitUntil: 'networkidle' });
await shot('02-make-empty');

// 1 · Where
await page.getByRole('button', { name: /^TikTok/ }).click();
await page.waitForTimeout(400);
await shot('03-platform');

// 2 · What kind of post
await page.getByRole('button', { name: 'Short video', exact: true }).click();
await page.waitForTimeout(400);
await shot('04-posttype');

// 3 · What shape
await page.getByRole('button', { name: /^Quiz/ }).click();
await page.waitForTimeout(600);
await shot('05-format-quiz');

// 4 · How it should be made — leave the look on auto, ask for a voice.
await page.getByRole('button', { name: 'Spoken', exact: true }).click();
await page.waitForTimeout(400);
await shot('06-options');

await page.getByRole('button', { name: 'Generate' }).click();
await page.waitForURL(/\/make\/run\//, { timeout: 60_000 });
const jobId = page.url().split('/').pop();
console.log('JOB', jobId);

// Watch the theatre. Screenshot as the feed grows.
let last = 0;
for (let i = 0; i < 150; i += 1) {
  await page.waitForTimeout(4000);
  const rows = await page.locator('li, [data-event]').count();
  if (rows > last) { last = rows; await shot(`run-${String(i).padStart(3, '0')}`); }
  const body = await page.textContent('body');
  if (/finished|failed|done/i.test(body ?? '') && i > 4) {
    const stop = await page.locator('text=/finished|failed/i').count();
    if (stop) break;
  }
}
await shot('99-run-final');
await context.close();
await browser.close();
console.log('DONE', jobId);
