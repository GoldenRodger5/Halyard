/**
 * §498. Look at it on both screens before saying it works.
 *
 * A studio screen that is only ever opened at 1440px is half untested: the
 * operator carries a phone, and the mobile tab bar, the wrapped rows and the
 * folded-away controls only exist at 390. This drives the real app and writes
 * a PNG per route per width, so a change can be looked at rather than asserted.
 *
 *   BASE=http://localhost:3200 node scripts/browser/shots.mjs /master /
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3200';
const OUT = process.env.OUT ?? '.render-output/shots';
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['/master'];
const WIDTHS = [
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844, isMobile: true },
];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const size of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    ...(size.isMobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 120_000 });
    const file = path.join(OUT, `${route.replace(/\W+/g, '_') || 'home'}-${size.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${size.name} ${route} → ${file}`);
  }
  if (errors.length) console.log(`  ${size.name} errors: ${errors.slice(0, 4).join(' | ')}`);
  await context.close();
}
await browser.close();
