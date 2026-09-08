/**
 * The two decisions that were previously one.
 *
 * Approving a post said it was good *and* left when it went out to whatever
 * slot the scheduler picked. There was no way to say "this is fine, send it
 * now", and no path at all for an account that cannot be posted to through an
 * API — those items simply failed at the publish step.
 */
import { db, expect, seedItem, test } from './fixtures';

test.describe('posting on your own timing', () => {
  /*
   * §572. Retired: "post it now" is not offered anywhere.
   *
   * `publishNow` is a server action with no caller — the Gallery never renders
   * a control that reaches it, so an approved piece can only go out at its
   * slot. That may well be the right product decision, but it means there is no
   * user path for an end-to-end test to walk. Recorded in
   * `docs/E2E_CONTRACT.md` alongside the other orphaned actions.
   */

});

test.describe('posts you have to make yourself', () => {
  test('hands over everything needed, and takes the link back', async ({ page }) => {
    const item = await seedItem({ status: 'awaiting_manual_publish' });

    await page.goto(`/gallery/${item.id}`);
    /* §572. The panel is titled "Finish it by hand" on the piece itself. */
    await expect(page.getByText(/finish it by hand/i).first()).toBeVisible();

    // The caption is one click from the clipboard, and the composer one click
    // from here. Anything that makes the operator assemble the post themselves
    // is a step where the posted version drifts from the reviewed one.
    await expect(page.getByRole('button', { name: 'Copy caption' })).toBeVisible();

    await page.locator('#manual-url').fill('https://x.com/recipefix/status/123');
    await page.getByRole('button', { name: 'I posted it' }).click();
    await page.waitForLoadState('networkidle');

    // Polled, for the same reason as the job read above.
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ status: string }>(
          'select status from content_items where id = $1',
          [item.id],
        );
        return rows[0]!.status;
      })
      .toBe('published');

    // Recorded against the real URL, so metrics have something to collect on
    // and the claim of "published" rests on more than an assertion.
    const { rows: pubs } = await db().query<{ manual_publish_url: string; publish_mode: string }>(
      'select manual_publish_url, publish_mode from publications where content_item_id = $1',
      [item.id],
    );
    expect(pubs[0]!.manual_publish_url).toBe('https://x.com/recipefix/status/123');
    expect(pubs[0]!.publish_mode).toBe('draft');
  });

  test('will not mark something published without the link', async ({ page }) => {
    /**
     * Without a URL there is nothing to collect metrics against and nothing to
     * prove the post exists — the item would claim `published` on an assertion
     * alone, which is the shape of every "it looked done" bug in this codebase.
     */
    const item = await seedItem({ status: 'awaiting_manual_publish' });
    await page.goto(`/gallery/${item.id}`);

    await page.getByRole('button', { name: 'I posted it' }).click();
    await page.waitForTimeout(500);

    const { rows } = await db().query<{ status: string }>(
      'select status from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]!.status).toBe('awaiting_manual_publish');
  });
});
