/**
 * §434. The Gallery, opened the way an operator opens it.
 *
 * `floor.mjs` proves a brief reaches the worker. It proves nothing about what
 * the operator then *sees* — and every visual defect this session found was
 * found by looking at pixels, not at rows. So this clicks into the Gallery,
 * opens the newest piece, and photographs what is on the screen.
 *
 *   BASE=http://localhost:3200 OUT=.render-output/gallery node scripts/browser/gallery.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3200';
const OUT = process.env.OUT ?? '.render-output/gallery';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await context.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 160)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));
page.on('response', (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });

await page.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' });
await shot('01-gallery');

/*
 * The first piece in the queue. Clicked rather than navigated to by id: the
 * point is that the operator can get there from the screen they are on, and a
 * card that is not clickable is a defect a direct URL would hide.
 */
/*
 * A piece, not a nav link. `/gallery/scheduled` and `/gallery/stock` are
 * sections and match a naive href filter — the first attempt clicked one and
 * photographed a list.
 */
const card = page
  .locator('a[href*="/gallery/"]')
  .filter({ hasNotText: /^(Scheduled|Stock|On air|Queue)$/i })
  .locator('visible=true')
  .first();
const href = await card.getAttribute('href').catch(() => null);
if (href) {
  await card.click({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await shot('02-piece');
  console.log('opened:', page.url());
} else {
  console.log('no piece to open — the gallery is empty');
}

console.log(problems.length === 0 ? 'no console errors, no 5xx' : `PROBLEMS:\n  ${problems.join('\n  ')}`);
await browser.close();
