/**
 * The queue must be fully usable on a phone. v1 §8, and milestone 29 scenario 7.
 *
 * "Approval happens in spare moments or it doesn't happen."
 */
import { db, expect, seedItem, test } from './fixtures';

/**
 * §528. This test had been asserting a deleted product.
 *
 * It navigated to `/queue`, which `aef621a` removed along with the old console,
 * and looked for a navigation landmark named "Sections", which the same commit
 * deleted — the string does not appear anywhere in the repo. So the one test
 * covering the human approval gate on a phone, the gate this entire system
 * exists to stop short of, had been failing against an information
 * architecture that no longer existed.
 *
 * Rewritten against the surface that actually holds the gate: an item is
 * approved from its own page under Gallery, not from a list.
 */
test('the whole approve flow works at phone width', async ({ page }) => {
  const item = await seedItem({ body: 'E2E mobile approve. Cool the loaf completely before slicing.' });

  /*
   * One navigation, not two. `/gallery` fires its own soft navigation while
   * hydrating, which aborts a `goto` already in flight — the race this file
   * documents for the horizontal-scroll test, hit here for the same reason.
   * The shell renders the bottom bar on every route, so the item page proves
   * the navigation just as well as the list did.
   */
  await page.goto(`/gallery/${item.id}`);

  /* Asserted by destination, not by label: §172 renamed this once already and
     the test kept passing on the old word. */
  const galleryTab = page.getByRole('navigation', { name: 'Rooms' }).locator('a[href="/gallery"]');
  await expect(galleryTab.first()).toBeVisible();

  const approve = page.getByRole('button', { name: 'Approve' });
  await expect(approve).toBeVisible();
  await expect(approve, 'approve must not be reachable while a render is pending').toBeEnabled();
  await approve.click();

  /*
   * Polled, like every read of a server action's effect in this suite: a quiet
   * network is not a committed transaction, and this read landed first on CI.
   */
  await expect
    .poll(async () => {
      const { rows } = await db().query<{ status: string }>(
        'select status from content_items where id = $1',
        [item.id],
      );
      return rows[0]?.status;
    })
    .toBe('approved');
});

test('no screen scrolls horizontally on a phone', async ({ page }) => {
  /*
   * §528. The routes that exist.
   *
   * This list held `/queue`, `/calendar`, `/analytics`, `/take`, `/swipe`,
   * `/inbox`, `/setup-kit`, `/launch` and `/first-30-days` — nine routes the
   * app no longer serves. The test passed on every one of them, because a 404
   * page does not scroll sideways either. Checking a deleted screen is not
   * weaker coverage than checking a real one; it is none.
   */
  for (const path of [
    '/',
    '/floor',
    '/gallery',
    '/rundown',
    '/wires',
    '/numbers',
    '/master',
    '/master/rules',
    '/master/templates',
    '/master/system',
    '/accounts',
    '/connections',
  ]) {
    // Two races to survive here, both artefacts of the dev server rather than
    // the app: `waitUntil: 'load'` races the first compile, and a hydrating page
    // can still fire its own soft navigation while the next goto is in flight,
    // which aborts it. So wait for the DOM, then the network, and retry once if
    // the previous page pulled the rug out.
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      if (!/interrupted by another navigation/.test((err as Error).message)) throw err;
      await page.goto(path, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForLoadState('networkidle');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `${path} scrolls horizontally`).toBe(false);
  }
});

/**
 * §527. The tab you are on has to be a tab you can see.
 *
 * Master has seven tabs in one horizontally scrolling row. At 390px the row is
 * far narrower than its contents, and nothing ever scrolled it to the selected
 * tab — so opening Master ▸ System showed a row starting at *Connections* with
 * no current tab anywhere on screen. Measured before the fix: the System tab
 * began 161px past the right edge, Templates 94px past.
 *
 * Asserted geometrically rather than by screenshot, because the failure is a
 * scroll position and not a rendering: every tab was in the DOM, styled
 * correctly, and reachable by a drag nobody knew to make.
 */
test('the selected room tab is on screen at phone width', async ({ page }) => {
  for (const route of ['/master/system', '/master/templates']) {
    await page.goto(route);

    const nav = page.getByRole('navigation', { name: /tabs$/ });
    await expect(nav).toBeVisible();

    const current = nav.locator('[aria-current="page"]');
    await expect(current).toBeVisible();

    const bounds = await nav.boundingBox();
    const tab = await current.boundingBox();
    expect(bounds, `no tab row on ${route}`).not.toBeNull();
    expect(tab, `no current tab on ${route}`).not.toBeNull();

    /* Wholly inside the row, not merely intersecting it. */
    expect(tab!.x, `${route}: current tab starts left of the row`).toBeGreaterThanOrEqual(
      bounds!.x - 1,
    );
    expect(
      tab!.x + tab!.width,
      `${route}: current tab ends past the right edge, so nothing marks the page`,
    ).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  }
});
