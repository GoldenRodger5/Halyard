/** What each empty screen actually says. Guidance, or a dead end? */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
for (const route of process.env.ROUTES.split(',')) {
  await p.goto(`http://localhost:3200${route}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(900);
  const main = (await p.textContent('main')) ?? '';
  const clean = main.replace(/\s+/g, ' ').replace(/HALYARD_DEV_UNAUTHENTICATED[^.]*\./g, '').trim();
  console.warn(`\n── ${route}\n${clean.slice(0, 420)}`);
}
await b.close();
