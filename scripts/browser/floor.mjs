/**
 * §418. The Floor, driven the way an operator drives it.
 *
 * Click the platform, the post type, the format, type a subject, send it. The
 * only writes are the ones the UI makes — nothing is inserted into `jobs` by
 * hand, which is the whole point: seeding a payload proves the worker works and
 * proves nothing about the screen meant to produce it.
 *
 * Replaces `make-wizard.mjs`, which drove `/make`. The studio UI replaced that
 * route, so the operator-path test had been pointing at a page that no longer
 * exists — a stale test is the same defect as an unwired one, and it passes by
 * never running.
 *
 *   BASE=http://localhost:3200 OUT=.render-output/floor node scripts/browser/floor.mjs
 *
 * Env: PLATFORM, POST_TYPE, FORMAT, SUBJECT override the defaults below.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3200';
const OUT = process.env.OUT ?? '.render-output/floor';
const PLATFORM = process.env.PLATFORM ?? 'TikTok';
const POST_TYPE = process.env.POST_TYPE ?? 'Short video';
const FORMAT = process.env.FORMAT ?? 'History';
const SUBJECT = process.env.SUBJECT ?? 'Why does bread go stale?';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

/* Anything the page logs that an operator would never see, we should. */
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('response', (r) => {
  if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
});

await page.goto(`${BASE}/floor`, { waitUntil: 'networkidle' });
await shot('01-floor');

const click = async (name, step) => {
  const button = page.getByRole('button', { name, exact: true }).first();
  await button.click({ timeout: 15000 });
  await page.waitForTimeout(300);
  await shot(step);
};

await click(PLATFORM, '02-platform');
await click(POST_TYPE, '03-post-type');
await click(FORMAT, '04-format');

/*
 * An empty subject is a real case and the more interesting one: the room reads
 * this week's signals and decides for itself, which is the whole agentic path.
 * Briefing a subject tests the writer; leaving it empty tests the operation.
 */
if (SUBJECT) await page.locator('[name="subject"]').fill(SUBJECT);
await shot('05-subject');

await page.getByRole('button', { name: /Send it to the floor/ }).click({ timeout: 15000 });
/*
 * The action inserts a job and redirects. Waiting on the URL rather than a
 * timeout, so a server action that throws fails here rather than passing on a
 * screenshot of an unchanged page.
 */
await page.waitForURL((u) => !u.pathname.endsWith('/floor'), { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
await shot('06-sent');

console.log('landed on:', page.url());
console.log(problems.length === 0 ? 'no console errors, no 5xx' : `PROBLEMS:\n  ${problems.join('\n  ')}`);

await browser.close();
