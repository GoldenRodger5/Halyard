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
    // `published` and `rejected` had no tab at all, so the only way to see what
    // Halyard had actually done was the database.
    await page.goto('/queue');
    for (const label of ['Needs you', 'Scheduled', 'Published', 'Rejected', 'Everything']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('a published item is reachable from the queue', async ({ page }) => {
    const item = await seedItem({ status: 'published', body: 'An e2e published post.' });
    await deliver(item.id, item.accountId, { mode: 'direct', platform: 'x' });
    await db().query(`update content_items set status = 'published' where id = $1`, [item.id]);

    await page.goto('/queue?status=published');
    await expect(page.getByText('An e2e published post.')).toBeVisible();
  });

  test('a native draft says a person must finish it in the platform', async ({ page }) => {
    const item = await seedItem({ status: 'pending_approval', body: 'An e2e tiktok draft.' });
    await deliver(item.id, item.accountId, {
      mode: 'draft',
      platform: 'x',
      externalId: 'tiktok-draft-1',
      manualUrl: 'https://www.tiktok.com/upload',
    });

    await page.goto(`/queue/${item.id}`);
    await expect(page.getByRole('heading', { name: 'Delivery' })).toBeVisible();
    await expect(page.getByText('creator action required')).toBeVisible();
    await expect(page.getByText('tiktok-draft-1')).toBeVisible();
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

    await page.goto(`/queue/${item.id}`);
    await expect(page.getByRole('heading', { name: 'Delivery' })).toBeVisible();
    await expect(page.getByText('Uploaded privately')).toBeVisible();
    // The specific wrong turn: sending someone to finish something that is done.
    await expect(page.getByText('creator action required')).toHaveCount(0);
  });

  test('an item with nothing delivered says so, without implying a failure', async ({ page }) => {
    const item = await seedItem({ status: 'pending_approval', body: 'An e2e held post.' });

    await page.goto(`/queue/${item.id}`);
    await expect(page.getByText('Held in Halyard')).toBeVisible();
  });

  test('editing the body un-verifies the claims gate', async ({ page }) => {
    /**
     * §157. The gates render from `qc_results`, and an edit used to leave them
     * reading green for text nothing had examined.
     */
    const item = await seedItem({ status: 'pending_approval', body: 'Before the edit.' });

    await page.goto(`/queue/${item.id}`);
    await page.getByRole('textbox').first().fill('After the edit, entirely different words.');
    await page.getByRole('button', { name: /save|edit/i }).first().click();

    await expect
      .poll(
        async () => {
          const { rows } = await db().query<{ summary: string }>(
            `select g->>'summary' as summary
               from content_items, jsonb_array_elements(qc_results->'gates') g
              where id = $1 and g->>'gate' = 'claims'`,
            [item.id],
          );
          return rows[0]?.summary ?? '';
        },
        { timeout: 15_000 },
      )
      .toMatch(/not re-verified/);
  });
});
