/**
 * The queue must be fully usable on a phone. v1 §8, and milestone 29 scenario 7.
 *
 * "Approval happens in spare moments or it doesn't happen."
 */
import { db, expect, seedItem, test } from './fixtures';

test('the whole approve flow works at phone width', async ({ page }) => {
  const item = await seedItem({ body: 'E2E mobile approve. Cool the loaf completely before slicing.' });

  await page.goto('/queue');

  /*
   * The bottom tab bar is the mobile navigation.
   *
   * Asserted by destination, not by label. §172 renamed this tab from "Queue" to
   * "Content" — the same route, answering the operator's question rather than
   * naming our table — and this test kept asserting the old word. It should have
   * failed that day and did not, because the browser suite could not sign in
   * (§174); a rename is exactly the kind of change an E2E suite exists to catch.
   */
  const queueTab = page
    .getByRole('navigation', { name: 'Sections' })
    .locator('a[href="/queue"]');
  await expect(queueTab).toBeVisible();
  await expect(queueTab).toHaveText(/content/i);

  const card = page.locator(`#queue-item-${item.id}`);
  await expect(card).toBeVisible();
  await expect(card.getByText('passed (0 flags)')).toBeVisible();

  await card.getByRole('button', { name: 'Approve' }).click();
  await page.waitForLoadState('networkidle');

  // Polled, like every other read of a server action's effect in this suite:
  // a quiet network is not a committed transaction, and this read landed first
  // on a CI runner. Same assertion, correct waiting.
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
  for (const path of [
    '/',
    '/queue',
    '/calendar',
    '/analytics',
    '/take',
    '/swipe',
    '/inbox',
    '/setup-kit',
    '/accounts',
    '/launch',
    '/first-30-days',
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
