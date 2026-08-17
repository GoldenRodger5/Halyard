/**
 * The path walked every day. Milestone 29, scenarios 1 to 6.
 *
 * Drafts appear, get read, get edited, get approved, and become a publication.
 * Every assertion here is about a state transition the operator can cause, not
 * about the internals underneath.
 */
import { db, expect, seedItem, test } from './fixtures';

test.describe('the daily path', () => {
  test('a draft appears in the queue with its QC visible', async ({ page }) => {
    const item = await seedItem({ body: 'E2E queue draft. Vinegar firms a gluten-free crumb.' });

    await page.goto('/queue');
    const card = page.locator(`#queue-item-${item.id}`);

    await expect(card).toBeVisible();
    // v2 F.5 — the queue shows its work, so approval is informed.
    await expect(card.getByText('passed (0 flags)')).toBeVisible();
    await expect(card.getByText('1/1 verified against artifact')).toBeVisible();
  });

  test('editing copy preserves the original for learning', async ({ page }) => {
    const item = await seedItem({ body: 'E2E original body about crumb structure.' });

    await page.goto('/queue');
    const card = page.locator(`#queue-item-${item.id}`);
    const textarea = card.locator('textarea').first();

    await textarea.fill('E2E edited body. The starch holds water wheat would have released.');
    await card.getByRole('button', { name: 'Save edit' }).click();

    // A server action re-renders without navigating, so poll the row rather
    // than guessing when the round trip finished.
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ body: string }>(
          'select body from content_items where id = $1',
          [item.id],
        );
        return rows[0]?.body ?? '';
      })
      .toContain('edited body');

    const { rows } = await db().query<{ original_body: string; edited_by_human: boolean }>(
      'select original_body, edited_by_human from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]?.original_body).toContain('original body');
    expect(rows[0]?.edited_by_human).toBe(true);
  });

  test('approving moves the item and writes an audit row', async ({ page }) => {
    const item = await seedItem({ body: 'E2E approve me. One teaspoon of acid changes the crumb.' });

    await page.goto('/queue');
    await page.locator(`#queue-item-${item.id}`).getByRole('button', { name: 'Approve' }).click();
    await page.waitForLoadState('networkidle');

    /**
     * Polled, not read once.
     *
     * `networkidle` means the network went quiet, which is not the same as the
     * server action having committed. On a fast machine the read lands after
     * the write and on a CI runner it does not — the assertion is unchanged,
     * only the waiting is correct.
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

    const { rows } = await db().query<{ status: string; approved_at: string | null }>(
      'select status, approved_at from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]?.status).toBe('approved');
    expect(rows[0]?.approved_at).not.toBeNull();

    const audit = await db().query(
      `select 1 from audit_log where entity_id = $1 and action = 'approve'`,
      [item.id],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  test('a due approved item is handed to the worker rather than published inline', async ({ page }) => {
    const item = await seedItem({
      body: 'E2E due now. Drop the oven twenty five degrees.',
      scheduledAt: new Date(Date.now() - 60_000),
    });

    await page.goto('/queue');
    await page.locator(`#queue-item-${item.id}`).getByRole('button', { name: 'Approve' }).click();
    await page.waitForLoadState('networkidle');

    // Publishing belongs to the worker and its idempotency guard, not to a
    // route handler with a user waiting on it.
    await expect
      .poll(async () => {
        const { rows } = await db().query(
          `select 1 from jobs where payload ->> 'contentItemId' = $1`,
          [item.id],
        );
        return rows.length;
      })
      .toBeGreaterThan(0);

    const jobs = await db().query<{ kind: string }>(
      `select kind from jobs where payload ->> 'contentItemId' = $1`,
      [item.id],
    );
    expect(jobs.rows.map((j) => j.kind)).toContain('publish');

    await db().query(`delete from jobs where payload ->> 'contentItemId' = $1`, [item.id]);
  });

  test('rejecting with a reason stores it as a negative example', async ({ page }) => {
    const item = await seedItem({ body: 'E2E reject me. RecipeFix makes cooking simple and easy.' });

    await page.goto('/queue');
    const card = page.locator(`#queue-item-${item.id}`);

    await card.locator('summary', { hasText: 'Reject' }).click();
    await card.locator('input[name="reason"]').fill('E2E reads like an ad, no mechanism');
    await card.getByRole('button', { name: 'Reject' }).click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ status: string }>(
          'select status from content_items where id = $1',
          [item.id],
        );
        return rows[0]?.status ?? '';
      })
      .toBe('rejected');

    const { rows } = await db().query<{ reject_reason: string }>(
      'select reject_reason from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]?.reject_reason).toContain('reads like an ad');

    // The reason becomes a do-not-do example in the copywriter prompt.
    const voice = await db().query<{ anti_examples: Array<{ why_bad: string }> }>(
      `select anti_examples from brand_voices where product_id = 'recipefix' and persona = 'brand'`,
    );
    expect(
      voice.rows[0]?.anti_examples.some((e) => e.why_bad?.includes('reads like an ad')),
    ).toBe(true);

    await db().query(
      `update brand_voices set anti_examples = '[]'::jsonb
        where product_id = 'recipefix' and persona = 'brand'`,
    );
  });

  test('regenerating carries the note into the job rather than retrying blind', async ({ page }) => {
    const item = await seedItem({ body: 'E2E regenerate me. Something about bread.' });

    await page.goto('/queue');
    const card = page.locator(`#queue-item-${item.id}`);

    await card.locator('summary', { hasText: 'Regenerate' }).click();
    await card.locator('input[name="note"]').fill('E2E less salesy, lead with the failure');
    await card.getByRole('button', { name: 'Regenerate' }).click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ status: string }>(
          'select status from content_items where id = $1',
          [item.id],
        );
        return rows[0]?.status ?? '';
      })
      .toBe('draft');

    const { rows } = await db().query<{ regen_notes: string[] }>(
      'select regen_notes from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]?.regen_notes.join(' ')).toContain('lead with the failure');

    const jobs = await db().query<{ payload: { note?: string } }>(
      `select payload from jobs where payload ->> 'regenerateContentItemId' = $1`,
      [item.id],
    );
    expect(jobs.rows[0]?.payload.note).toContain('lead with the failure');

    await db().query(`delete from jobs where payload ->> 'regenerateContentItemId' = $1`, [item.id]);
  });
});

test.describe('QC blocks the queue, it does not decorate it', () => {
  test('a render failure shows the error and offers a retry instead of Approve', async ({ page }) => {
    const item = await seedItem({
      status: 'failed',
      body: 'E2E media item. One swap, four consequences.',
      qc: {
        passed: false,
        gates: [
          { gate: 'copy', status: 'passed', summary: 'passed (0 flags)' },
          { gate: 'claims', status: 'passed', summary: '1/1 verified against artifact' },
          { gate: 'visual', status: 'failed', summary: 'failed — render did not complete' },
          { gate: 'audio', status: 'skipped', summary: 'no voiceover' },
        ],
      },
    });

    await db().query(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality, status, error)
       values ($1, 'transformation_diff_4x5', 'satori', '{}'::jsonb, 'final', 'failed',
               'E2E template props failed validation')`,
      [item.id],
    );

    await page.goto('/queue?status=failed');
    const card = page.locator(`#queue-item-${item.id}`);

    await expect(card.getByRole('paragraph').filter({ hasText: 'Render failed' })).toBeVisible();
    await expect(card.getByText('E2E template props failed validation')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Retry render' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });
});
