/** Screenshot a list of routes, so the UI can be looked at rather than imagined. */
import { chromium } from 'playwright';
const routes = process.env.ROUTES.split(',');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
for (const route of routes) {
  const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
  try {
    await p.goto(`http://localhost:3200${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${process.env.OUT}/${name}.png`, fullPage: true });
    console.warn(`ok ${route}`);
  } catch (err) {
    console.warn(`FAIL ${route}: ${err.message.split('\n')[0]}`);
  }
}
await b.close();
