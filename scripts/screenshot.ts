/**
 * Visual capture of every screen, desktop and mobile.
 *
 * Not a test — a review aid. The queue must be fully usable on a phone (v1 §8),
 * and that is a claim best checked by looking at it.
 *
 *   pnpm dev            # in one terminal
 *   npx tsx scripts/screenshot.ts
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';

const BASE = process.env.HALYARD_URL ?? 'http://localhost:3200';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.screenshots');

const ROUTES = [
  ['dashboard', '/'],
  ['queue', '/queue'],
  ['calendar', '/calendar'],
  ['ideas', '/ideas'],
  ['library', '/library'],
  ['analytics', '/analytics'],
  ['inbox', '/inbox'],
  ['accounts', '/accounts'],
  ['templates', '/templates'],
  ['products', '/products'],
  ['product-detail', '/products/recipefix'],
  ['settings', '/settings'],
  ['health', '/settings/health'],
  ['compose', '/compose'],
  ['onboarding', '/onboarding'],
] as const;

async function capture(
  browser: Browser,
  label: string,
  viewport: { width: number; height: number },
): Promise<string[]> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const failures: string[] = [];

  page.on('pageerror', (err) => failures.push(`${label} page error: ${err.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`${label} console: ${message.text()}`);
  });

  for (const [name, route] of ROUTES) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    if (!response || response.status() >= 400) {
      failures.push(`${route} returned ${response?.status() ?? 'no response'}`);
      continue;
    }
    // Fonts load from Google; give them a beat so the serif is real in the shot.
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(OUT, `${label}-${name}.png`),
      fullPage: label === 'desktop',
    });

    // A page that scrolls horizontally on a phone is a bug, so check it here.
    if (label === 'mobile') {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      if (overflow) failures.push(`${route} scrolls horizontally at ${viewport.width}px`);
    }
  }

  await context.close();
  return failures;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  const failures = [
    ...(await capture(browser, 'desktop', { width: 1440, height: 1000 })),
    ...(await capture(browser, 'mobile', { width: 390, height: 844 })),
  ];

  await browser.close();

  console.log(`\nCaptured ${ROUTES.length * 2} screenshots into ${OUT}`);
  if (failures.length > 0) {
    console.log('\nProblems found:');
    for (const failure of failures) console.log(`  · ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('No page errors, no console errors, no horizontal overflow on mobile.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
