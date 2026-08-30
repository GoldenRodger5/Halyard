/**
 * §359. The Make wizard, driven the way an operator drives it.
 *
 * Click through, press Generate, watch the run page. Nothing is inserted into
 * the database by hand — the only writes are the ones the UI makes, which is
 * the whole point: a test that seeds a job payload proves the worker works and
 * proves nothing about the screen that is supposed to produce it.
 *
 * Two defects surfaced on its first run that every test in the suite had
 * missed, because both were about what the screen *looked like* rather than
 * what it contained: the template diagrams were invisible in the default state,
 * and the voice override is labelled `Spoken` rather than `Voice over`.
 *
 *   BASE=http://localhost:3200 OUT=media-review/quiz-run node scripts/browser/make-wizard.mjs
 *
 * `FILM=1` records a video of the run. It is off by default because a long run
 * writes a very large webm.
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
const voice = page.getByRole('button', { name: 'Spoken', exact: true });
if ((await voice.count()) === 0) throw new Error('no Spoken control — the voice option did not render');
await voice.click();
await page.waitForTimeout(400);
await shot('06-options');

await page.getByRole('button', { name: 'Generate' }).click();
await page.waitForURL(/\/make\/run\//, { timeout: 60_000 });
const jobId = page.url().split('/').pop();
console.warn('JOB', jobId);

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
console.warn('DONE', jobId);
