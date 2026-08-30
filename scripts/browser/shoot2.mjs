/** Shoot a route at both shapes, so a room is checked the way it is used. */
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [name, w, h] of [['laptop', 1440, 900], ['phone', 390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  for (const route of process.env.ROUTES.split(',')) {
    const slug = route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '-');
    try {
      await p.goto(`http://localhost:3200${route}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await p.waitForTimeout(3200);
      await p.screenshot({ path: `${process.env.OUT}/${slug}-${name}.png`, fullPage: name === 'laptop' });
      console.warn(`ok ${route} ${name}`);
    } catch (e) { console.warn(`FAIL ${route} ${name}: ${e.message.split('\n')[0].slice(0,60)}`); }
  }
}
await b.close();
