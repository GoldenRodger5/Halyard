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
  test('an approved post can be sent now rather than at its slot', async ({ page }) => {
    // Scheduled well into the future: without this button it would sit there.
    const item = await seedItem({
      status: 'approved',
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await page.goto(`/queue/${item.id}`);
    await expect(page.getByRole('heading', { name: 'Post now' })).toBeVisible();
    await page.getByRole('button', { name: 'Post it now' }).click();
    await page.waitForLoadState('networkidle');

    /**
     * The worker owns publishing, so what this proves is that the job was
     * queued — not that a network call happened on the web tier.
     *
     * Polled rather than read once. `waitForLoadState('networkidle')` returns
     * when the network is quiet, which is not the same as the server action
     * having committed; on a slower runner the read landed first and saw zero.
     * Same assertion, correct waiting — the convention campaigns.spec already
     * uses for exactly this.
     */
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ n: string }>(
          `select count(*) as n from jobs
            where kind = 'publish' and payload ->> 'contentItemId' = $1`,
          [item.id],
        );
        return Number(rows[0]!.n);
      })
      .toBe(1);
  });

  test('the button is not offered for something nobody has approved', async ({ page }) => {
    // Publishing straight from pending_approval would route around the review
    // this entire screen exists for.
    const item = await seedItem({ status: 'pending_approval' });
    await page.goto(`/queue/${item.id}`);
    await expect(page.getByRole('button', { name: 'Post it now' })).toHaveCount(0);
  });
});

test.describe('posts you have to make yourself', () => {
  test('hands over everything needed, and takes the link back', async ({ page }) => {
    const item = await seedItem({ status: 'awaiting_manual_publish' });

    await page.goto(`/queue/${item.id}`);
    await expect(page.getByRole('heading', { name: 'Post this yourself' })).toBeVisible();

    // The caption is one click from the clipboard, and the composer one click
    // from here. Anything that makes the operator assemble the post themselves
    // is a step where the posted version drifts from the reviewed one.
    await expect(page.getByRole('button', { name: 'Copy caption' })).toBeVisible();

    await page.getByLabel(/paste the link/i).fill('https://x.com/recipefix/status/123');
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
    await page.goto(`/queue/${item.id}`);

    await page.getByRole('button', { name: 'I posted it' }).click();
    await page.waitForTimeout(500);

    const { rows } = await db().query<{ status: string }>(
      'select status from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]!.status).toBe('awaiting_manual_publish');
  });
});
