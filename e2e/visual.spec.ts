/**
 * Visual regression, scoped to surfaces where a pixel diff means something.
 *
 * ## Why so few screens
 *
 * Most of Halyard is unsuitable for snapshots and would produce a suite that
 * fails for reasons nobody cares about. The Daily Take renders live Hacker News
 * stories; the sidebar carries a badge count; sources say "polled 20h ago";
 * queue cards carry ids and timestamps. Snapshotting those needs seeded
 * fixtures and a frozen clock, and a suite that cries wolf is one people delete.
 *
 * The pages here have no dates, no counts and no provider data — verified, not
 * assumed: they contain no `new Date`, no `toLocale`, and no query. They are
 * also the pages a Meta reviewer opens, which makes an accidental change to
 * them expensive in a way a dashboard tweak is not.
 *
 * ## These baselines are NOT approved
 *
 * A baseline records what a page looked like at the moment it was captured. It
 * does not record that the page looked *right*. Nobody has reviewed these, so
 * they prove "this has not changed since 2026-08-19" and nothing stronger.
 * `docs/VISUAL_BASELINES.md` lists what is waiting on a human.
 *
 * ## Opt-in, deliberately
 *
 * Playwright writes a missing baseline and reports a **pass**, which is the
 * exact shape of failure this codebase keeps finding — a green result that
 * checked nothing. So this file is gated behind `HALYARD_VISUAL=1` and does not
 * run in the default suite, and a missing baseline fails with an explanation
 * instead of being created behind your back.
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const ENABLED = process.env.HALYARD_VISUAL === '1';

/**
 * Static, unauthenticated, and seen by reviewers.
 *
 * `/signin` is deliberately absent. Its appearance depends on whether Supabase
 * is configured — without it the page renders "Auth is not configured on this
 * deployment" and with it a sign-in form — so a baseline captured here records
 * a development fact rather than the page, and would fail on any deployment
 * that has credentials. The other three render the same markup everywhere.
 */
const PAGES = [
  { route: '/privacy', name: 'privacy' },
  { route: '/terms', name: 'terms' },
  { route: '/data-deletion', name: 'data-deletion' },
];

const WIDTHS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'phone', width: 390, height: 844 },
];

test.describe('visual baselines', () => {
  test.skip(!ENABLED, 'set HALYARD_VISUAL=1 to run. See docs/VISUAL_BASELINES.md.');

  for (const page_ of PAGES) {
    for (const vp of WIDTHS) {
      const file = `${page_.name}-${vp.label}.png`;

      test(`${page_.name} at ${vp.label}`, async ({ page }, testInfo) => {
        // `snapshotPath` resolves the name Playwright will actually use, which
        // carries a project and platform suffix — checking the bare filename
        // reported every baseline as missing.
        const baseline = testInfo.snapshotPath(file);
        const generating = process.env.HALYARD_VISUAL_WRITE === '1';

        /*
         * Baselines must come from a production build.
         *
         * The first set was captured against `next dev` and every image
         * contained the framework's floating dev indicator — a control that
         * does not exist in what ships. A baseline recording the dev server is
         * not a baseline of the page. `HALYARD_URL` is how Playwright is
         * pointed at an already-running server, so requiring it here makes
         * "regenerated from dev by accident" impossible rather than merely
         * discouraged.
         */
        if (generating && !process.env.HALYARD_URL) {
          throw new Error(
            'Refusing to write baselines against the dev server. Run `pnpm --filter @halyard/web build` ' +
              'then `pnpm --filter @halyard/web start`, and re-run with HALYARD_URL=http://localhost:3200. ' +
              'See docs/VISUAL_BASELINES.md.',
          );
        }

        if (!existsSync(baseline) && !generating) {
          throw new Error(
            `No baseline for ${file}. Playwright would have written one and passed, ` +
              `which would report a check that never ran. Generate candidates with ` +
              `HALYARD_VISUAL=1 HALYARD_VISUAL_WRITE=1 pnpm exec playwright test e2e/visual.spec.ts ` +
              `--update-snapshots, then review them before trusting a pass.`,
          );
        }

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(page_.route, { waitUntil: 'domcontentloaded' });
        // Fonts settle after paint; without this the first run and every later
        // run disagree about text metrics for reasons unrelated to the page.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);

        await expect(page).toHaveScreenshot(file, {
          fullPage: true,
          animations: 'disabled',
          /*
           * The Next.js dev indicator is a floating control the framework
           * injects in development and omits from a production build. Left
           * unmasked it lands in every baseline, which would make each one a
           * record of the dev server rather than of the page.
           */
          mask: [page.locator('nextjs-portal')],
          // A little tolerance for antialiasing across machines; not enough to
          // hide a layout change.
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }
});
