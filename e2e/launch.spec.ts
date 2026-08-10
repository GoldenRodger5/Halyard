/**
 * The launch batch, end to end. Milestone 51.
 *
 * The preview is unit-tested; what this covers is the part unit tests cannot —
 * that clicking the button stages real rows with real times and enqueues one
 * generation job each, and that clicking it twice does not write the fortnight
 * twice.
 */
import { db, expect, test } from './fixtures';

const CLEANUP = `delete from jobs where dedupe_key like 'launch_generate:%';
                 delete from content_items where generation_meta->>'source' = 'launch_batch';`;

test.describe('launch batch', () => {
  test.beforeEach(async () => {
    await db().query(CLEANUP);
  });
  test.afterAll(async () => {
    await db().query(CLEANUP);
  });

  test('stages a fortnight and queues one generation job per slot', async ({ page }) => {
    await page.goto('/launch');
    await page.getByRole('button', { name: 'Generate my first two weeks' }).click();
    await page.waitForLoadState('networkidle');

    const staged = await db().query<{
      id: string;
      body: string;
      status: string;
      scheduled_at: string | null;
      purpose: string | null;
    }>(
      `select id, body, status, scheduled_at, generation_meta->>'purpose' as purpose
         from content_items where generation_meta->>'source' = 'launch_batch'
         order by scheduled_at`,
    );

    expect(staged.rowCount).toBeGreaterThan(5);

    for (const row of staged.rows) {
      // Staged, not written: the body is filled by a separate job so one
      // failure costs one slot rather than the batch.
      expect(row.body).toBe('');
      expect(row.status).toBe('draft');
      expect(row.scheduled_at).not.toBeNull();
      // Nothing on the exact hour — that is the automation fingerprint.
      expect(new Date(row.scheduled_at!).getUTCMinutes()).not.toBe(0);
    }

    // Every account opens with a post that says what the account is.
    expect(staged.rows.filter((r) => r.purpose === 'introduction').length).toBeGreaterThan(0);

    const jobs = await db().query<{ n: string }>(
      `select count(*) as n from jobs where dedupe_key like 'launch_generate:%'`,
    );
    expect(Number(jobs.rows[0]!.n)).toBe(staged.rowCount);
  });

  test('generating twice does not write the fortnight twice', async ({ page }) => {
    await page.goto('/launch');
    await page.getByRole('button', { name: 'Generate my first two weeks' }).click();
    await page.waitForLoadState('networkidle');

    const first = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );

    await page.goto('/launch');
    await page.getByRole('button', { name: 'Replan the batch' }).click();
    await page.waitForLoadState('networkidle');

    const second = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );
    expect(second.rows[0]!.n).toBe(first.rows[0]!.n);
  });

  test('regenerating keeps a slot somebody has already edited', async ({ page }) => {
    await page.goto('/launch');
    await page.getByRole('button', { name: 'Generate my first two weeks' }).click();
    await page.waitForLoadState('networkidle');

    // A draft with a body is not scaffolding, whoever wrote it.
    const edited = await db().query<{ id: string }>(
      `update content_items set body = 'written by hand'
        where id = (select id from content_items
                     where generation_meta->>'source' = 'launch_batch' limit 1)
        returning id`,
    );

    await page.goto('/launch');
    await page.getByRole('button', { name: 'Replan the batch' }).click();
    await page.waitForLoadState('networkidle');

    const survived = await db().query<{ body: string }>(
      'select body from content_items where id = $1',
      [edited.rows[0]!.id],
    );
    expect(survived.rows[0]?.body).toBe('written by hand');
  });

  test('discarding removes the batch', async ({ page }) => {
    await page.goto('/launch');
    await page.getByRole('button', { name: 'Generate my first two weeks' }).click();
    await page.waitForLoadState('networkidle');

    // Staging writes a row and a job per slot, so wait for the page to actually
    // reflect the batch rather than for the network to go briefly quiet.
    await page.reload();
    await expect(page.getByText(/posts staged/)).toBeVisible();

    await page.getByRole('button', { name: 'Discard the batch' }).click();
    await page.waitForLoadState('networkidle');

    const left = await db().query<{ n: string }>(
      `select count(*) as n from content_items
        where generation_meta->>'source' = 'launch_batch' and status = 'draft'`,
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});
