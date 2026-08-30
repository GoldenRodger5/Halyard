/** Click the templates step done, in the UI, after looking at the templates. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
await p.goto('http://localhost:3200/templates', { waitUntil: 'networkidle' });
await p.goto('http://localhost:3200/onboarding', { waitUntil: 'networkidle' });
const done = p.getByRole('button', { name: 'Mark done' });
const n = await done.count();
if (n === 0) throw new Error('no Mark done button on the onboarding page');
await done.first().click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${process.env.OUT}/12-onboarding-done.png`, fullPage: true });
await b.close();
