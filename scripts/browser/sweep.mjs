/**
 * Every route, checked for a server error or an exception.
 *
 * A reorganisation of the shell touches every page, and a page that throws
 * looks identical to one nobody visited. This visits them.
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const problems = [];
p.on('pageerror', (err) => problems.push(`  console: ${err.message.split('\n')[0]}`));
for (const route of process.env.ROUTES.split(',')) {
  problems.length = 0;
  try {
    const res = await p.goto(`http://localhost:3200${route}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await p.waitForTimeout(700);
    /*
      The *visible* main region, not the whole body. Next's dev bundle carries
      its own 404 template in the payload of every page, so matching on `body`
      reported every route as broken — a check that fails on everything is
      exactly as useless as one that passes on everything.
    */
    const main = (await p.textContent('main')) ?? '';
    const bad = res && res.status() >= 400;
    const match = main.match(/Application error|Unhandled Runtime Error|This page could not be found/i);
    const threw = Boolean(match);
    if (bad || threw || problems.length) {
      console.warn(`FAIL ${route} status=${res?.status()}${threw ? ` matched:"${match?.[0]}"` : ''}`);
      problems.forEach((x) => console.warn(x));
    } else {
      console.warn(`ok   ${route}`);
    }
  } catch (err) {
    console.warn(`FAIL ${route} ${err.message.split('\n')[0].slice(0, 70)}`);
  }
}
await b.close();
