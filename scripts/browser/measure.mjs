/** How tall is each screen, and does it render at all? A triage pass. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const rows = [];
for (const route of process.env.ROUTES.split(',')) {
  try {
    await p.goto(`http://localhost:3200${route}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await p.waitForTimeout(1200);
    const h = await p.evaluate(() => document.body.scrollHeight);
    const text = (await p.textContent('body')) ?? '';
    rows.push(`${String(h).padStart(6)}px  ${route}  ${text.replace(/\s+/g, ' ').length} chars`);
  } catch (err) {
    rows.push(`  FAIL  ${route}  ${err.message.split('\n')[0].slice(0, 60)}`);
  }
}
await b.close();
console.warn(rows.join('\n'));
