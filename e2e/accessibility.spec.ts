/**
 * Accessibility, asserted rather than assumed.
 *
 * A screenshot pass found four defects that every selector-based test walked
 * straight past, because in each case the element was present and only its
 * presentation was broken:
 *
 *  - wide tables scrolled with a mouse and were unreachable by keyboard
 *  - `/submissions` had five `<select>`s with no accessible name
 *  - `/signin` had no `main` landmark
 *  - `text-bad`, `bg-accent` and `bg-paper` named tokens that do not exist, so
 *    error text rendered as body copy and a publish button lost its background
 *
 * The last of those is guarded separately and cheaply in
 * `apps/web/src/lib/designTokens.test.ts`; this file covers what only a real
 * browser can see.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Representative of each layout: list, table, form, empty state, public page. */
const ROUTES = [
  '/', '/queue', '/take', '/compose', '/inbox', '/accounts',
  '/submissions', '/analytics', '/templates', '/calendar',
  '/settings', '/signin', '/privacy',
  /*
   * These two were not in the original list and a full 45-route sweep found
   * defects on both that nothing here would have caught: `/brain/evidence` used
   * `text-warn` — a badge colour at 2.49:1 — as body text, and `/products/new`
   * dimmed unreached wizard steps to 2.35:1. A representative sample is only
   * representative until it misses something.
   */
  '/brain/evidence', '/products/new',
];

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

/**
 * There is no longer an exemption here.
 *
 * The brand colour was the last one, and every violation in the product
 * involved it: 3.50:1 as text on surface, 3.14:1 on its own tint, 3.62:1 behind
 * white. It was darkened to #8c5035 on 2026-08-19 and the allowance it needed
 * went with it. Any contrast failure now fails this suite.
 */

for (const vp of WIDTHS) {
  test(`no accessibility regressions at ${vp.name}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const problems: string[] = [];

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);

      const structure = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        main: document.querySelectorAll('main').length,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
      }));

      if (structure.main === 0) problems.push(`${route}: no <main> landmark`);
      if (structure.h1 !== 1) problems.push(`${route}: ${structure.h1} <h1> elements, expected 1`);
      // A page that scrolls sideways on a phone has content the operator
      // cannot reach without pinching.
      if (structure.docScrollW > structure.docClientW + 1) {
        problems.push(`${route}: scrolls horizontally (${structure.docScrollW} > ${structure.docClientW})`);
      }

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      for (const violation of results.violations) {
        if (violation.id === 'color-contrast') {
          // Reported with the measured colours, because "contrast failed" is
          // not actionable and "#8c5035 on #ede3da = 4.37" is.
          for (const node of violation.nodes) {
            const data = (node.any?.[0] as { data?: Record<string, string> } | undefined)?.data ?? {};
            problems.push(
              `${route}: contrast ${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}`,
            );
          }
          continue;
        }
        problems.push(`${route}: ${violation.id} (${violation.impact}) ×${violation.nodes.length}`);
      }
    }

    expect(problems).toEqual([]);
  });
}
