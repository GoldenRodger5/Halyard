/**
 * §156. The queue as an operator surface: every lifecycle state reachable, and
 * the platform's state told apart from Halyard's.
 *
 * The thing being guarded is a sentence, not a layout. A native draft is
 * waiting for a person inside the platform's own app; a private upload is real
 * content Halyard can still publish. Both sit at `awaiting_manual_publish`, so
 * if the screen took its wording from the item status they would read alike —
 * and the operator would go to the wrong place.
 */
import { expect, test } from '@playwright/test';
import { db, seedItem } from './fixtures';

async function deliver(
  contentItemId: string,
  accountId: string,
  over: { mode: string; platform: string; externalId?: string; manualUrl?: string },
): Promise<void> {
  await db().query(
    `insert into publications
       (content_item_id, account_id, platform, publish_mode, platform_post_id, manual_publish_url)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      contentItemId,
      accountId,
      over.platform,
      over.mode,
      over.externalId ?? 'ext-e2e',
      over.manualUrl ?? null,
    ],
  );
  await db().query(`update content_items set status = 'awaiting_manual_publish' where id = $1`, [
    contentItemId,
  ]);
}

async function cleanup(): Promise<void> {
  await db().query(
    `delete from publications where content_item_id in
       (select id from content_items where generation_meta->>'e2e' = 'true')`,
  );
  await db().query(`delete from content_items where generation_meta->>'e2e' = 'true'`);
}

test.describe('the approval queue', () => {
  test.beforeEach(cleanup);
  test.afterAll(cleanup);

  test('every lifecycle state has somewhere to be seen', async ({ page }) => {
    /*
     * §572. Same contract, different shape.
     *
     * The old queue had one tab per status, and `published` and `rejected` had
     * none — so the only way to see what Halyard had actually done was the
     * database. The Gallery answers it with three filters plus two rooms of its
     * own, so the assertion is that each destination exists rather than that a
     * particular tab is named a particular thing.
     */
    await page.goto('/gallery');
    for (const label of ['Holding', 'Failed', 'Everything']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${label}`) }).first()).toBeVisible();
    }
    /* And the two that are rooms rather than filters. */
    await expect(page.getByRole('link', { name: 'Scheduled' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'On air' }).first()).toBeVisible();
  });

  test('a published item is reachable from the wall', async ({ page }) => {
    const item = await seedItem({ status: 'published', body: 'An e2e published post.' });
    await deliver(item.id, item.accountId, { mode: 'direct', platform: 'x' });
    await db().query(`update content_items set status = 'published' where id = $1`, [item.id]);

    /* `view=all` is Everything, which is the filter that includes published. */
    await page.goto('/gallery?view=all');
    await expect(page.locator(`a[href="/gallery/${item.id}"]`)).toBeVisible();
  });

  test('a native draft says a person must finish it in the platform', async ({ page }) => {
    const item = await seedItem({ status: 'pending_approval', body: 'An e2e tiktok draft.' });
    await deliver(item.id, item.accountId, {
      mode: 'draft',
      platform: 'x',
      externalId: 'tiktok-draft-1',
      manualUrl: 'https://www.tiktok.com/upload',
    });

    await page.goto(`/gallery/${item.id}`);
    /* §572. The badge carries the state; there is no "Delivery" heading. */
    await expect(page.getByText('Native draft').first()).toBeVisible();
    await expect(page.getByText(/needs you in-app/i).first()).toBeVisible();
    /*
     * §572. The state and what it asks of the operator, not the remote id.
     *
     * The detail screen does not print the platform's own draft id, and does
     * not need to: what the operator must know is that this one is finished by
     * hand in the platform's own app.
     */
    await expect(page.getByText(/finished by a person|finish it by hand/i).first()).toBeVisible();
  });

  test('a private upload is not called a draft, and asks nothing of the operator', async ({
    page,
  }) => {
    const item = await seedItem({ status: 'pending_approval', body: 'An e2e private upload.' });
    await deliver(item.id, item.accountId, {
      mode: 'private',
      platform: 'x',
      externalId: 'yt-private-1',
    });

    await page.goto(`/gallery/${item.id}`);
    await expect(page.getByText('Uploaded privately').first()).toBeVisible();
    // The specific wrong turn: sending someone to finish something that is done.
    await expect(page.getByText('creator action required')).toHaveCount(0);
  });

  /*
   * §572. Retired: the badge deliberately says nothing when nothing was sent.
   *
   * `readDelivery` still computes the "Held in Halyard" state, and
   * `deliveryState.test.ts` covers it. `DeliveryBadge` returns null when
   * `delivery_mode` is null, which is a deliberate choice — a badge on every
   * unpublished piece saying "not published" is noise on the one screen that
   * should be about the decision. There is nothing for an end-to-end test to
   * see, and asserting the absence of a badge proves nothing.
   */

  /*
   * §572. Retired: there is no way to edit the body from the screen.
   *
   * §157's rule — an edit must un-verify the claims gate, because the gates
   * render from `qc_results` and would otherwise read green for text nothing
   * examined — is still enforced inside `editItem`. What is gone is the caller:
   * the inline editor was not carried over to the Gallery, so `editItem` is a
   * server action nothing reaches (§562's shape) and there is no user path for
   * an end-to-end test to walk. Recorded in `docs/E2E_CONTRACT.md`; restoring
   * an edit control should restore this test with it.
   */
});
