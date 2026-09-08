/**
 * The path walked every day. Milestone 29, scenarios 1 to 6.
 *
 * Drafts appear, get read, get approved or sent back, and become a publication.
 * Every assertion here is about a state transition the operator can cause, not
 * about the internals underneath.
 *
 * §572. Rewritten against the Gallery, which is where this now happens.
 *
 * The old queue put Approve, Reject and Regenerate on every card in a list. The
 * Gallery does not: the wall is monitors that open, and every decision is made
 * on the piece itself — deliberately, because approving something is a
 * judgement about a render and a set of gates, and neither is legible on a
 * thumbnail (`rooms.ts`: the wall advertises `↵ OPEN`, not `A APPROVE`).
 *
 * So the interactions moved and the contracts did not. What is asserted below
 * is what was asserted before — the row lands in the right state, the audit row
 * exists, publishing goes to the worker rather than happening inline, a reason
 * becomes an anti-example — reached through the screen that exists now.
 */
import { db, expect, seedItem, test } from './fixtures';

/** The wall is links to pieces. The href is the contract, so it is the selector. */
function monitorFor(page: import('@playwright/test').Page, id: string) {
  return page.locator(`a[href="/gallery/${id}"]`);
}

test.describe('the daily path', () => {
  test('a draft is on the wall, and opens to show the gates behind it', async ({ page }) => {
    const item = await seedItem({ body: 'E2E queue draft. Vinegar firms a gluten-free crumb.' });

    await page.goto('/gallery');
    await expect(monitorFor(page, item.id)).toBeVisible();
    await monitorFor(page, item.id).click();

    /* v2 F.5 — the decision is informed, so the gates are on the page that decides. */
    await page.waitForURL(`**/gallery/${item.id}`);
    await expect(page.getByText('passed (0 flags)')).toBeVisible();
    await expect(page.getByText('1/1 verified against artifact')).toBeVisible();
  });

  test('approving moves the item and writes an audit row', async ({ page }) => {
    const item = await seedItem({ body: 'E2E approve me. One teaspoon of acid changes the crumb.' });

    await page.goto(`/gallery/${item.id}`);
    await page.getByRole('button', { name: 'Approve' }).click();

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
    expect(rows[0]?.approved_at).not.toBeNull();

    const audit = await db().query(
      `select 1 from audit_log where entity_id = $1 and action = 'approve'`,
      [item.id],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  test('a due approved item is handed to the worker rather than published inline', async ({
    page,
  }) => {
    const item = await seedItem({
      body: 'E2E due now. Drop the oven twenty five degrees.',
      scheduledAt: new Date(Date.now() - 60_000),
    });

    await page.goto(`/gallery/${item.id}`);
    await page.getByRole('button', { name: 'Approve' }).click();

    // Publishing belongs to the worker and its idempotency guard, not to a
    // route handler with a user waiting on it.
    await expect
      .poll(async () => {
        const { rows } = await db().query(
          `select 1 from jobs where payload ->> 'contentItemId' = $1 and kind = 'publish'`,
          [item.id],
        );
        return rows.length;
      })
      .toBeGreaterThan(0);

    await db().query(`delete from jobs where payload ->> 'contentItemId' = $1`, [item.id]);
  });

  test('sending it back with a reason stores it as a negative example', async ({ page }) => {
    const item = await seedItem({ body: 'E2E reject me. RecipeFix makes cooking simple and easy.' });

    await page.goto(`/gallery/${item.id}`);
    await page.locator('[name="reason"]').fill('E2E reads like an ad, no mechanism');
    await page.getByRole('button', { name: 'Send it back' }).click();

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

    /**
     * Polled on the anti-example, not on the status.
     *
     * `rejectItem` writes the status first and appends to `anti_examples` in a
     * later statement of the same action, so the poll above returns while that
     * append is still in flight. This assertion passed on an idle machine and
     * failed under load — gotcha 7 in `CLAUDE.md`: poll for the value the
     * assertion actually needs, not for an earlier one that happens to arrive
     * first.
     */
    await expect
      .poll(async () => {
        const voice = await db().query<{ anti_examples: Array<{ why_bad: string }> }>(
          `select anti_examples from brand_voices
            where product_id = 'recipefix' and persona = 'brand'`,
        );
        return voice.rows[0]?.anti_examples.some((e) => e.why_bad?.includes('reads like an ad'));
      })
      .toBe(true);

    await db().query(
      `update brand_voices set anti_examples = '[]'::jsonb
        where product_id = 'recipefix' and persona = 'brand'`,
    );
  });

  test('asking for a change carries the note into the job, and keeps the piece in the room', async ({
    page,
  }) => {
    /*
     * §572. This asserted the behaviour the product deliberately stopped doing.
     *
     * It used to click Regenerate and require `status = 'draft'` and a job
     * keyed `regenerateContentItemId`. `adjustItem` replaced that on purpose:
     * setting the status to draft takes the piece out of every queue filter, so
     * an operator who asked for a change watched it disappear — which is the
     * reason regeneration looked broken. The note is recorded, a correction job
     * is queued, and the piece stays where the operator left it.
     */
    const item = await seedItem({ body: 'E2E adjust me. Something about bread.' });

    await page.goto(`/gallery/${item.id}`);
    /*
     * §573. Each button binds its own adjustment id through `formAction`. The
     * `name`/`value` pair this used to rely on is gone, because the value never
     * arrived and all eight buttons answered 500.
     *
     * Waiting for hydration is still not ceremony: the click has to reach
     * React's action handling rather than race it.
     */
    await page.waitForLoadState('networkidle');
    await page.locator('[name="note"]').fill('E2E less salesy, lead with the failure');
    const askFor = page.getByRole('button', { name: 'Say it differently' });
    await expect(askFor).toBeEnabled();
    await askFor.click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ regen_notes: string[] }>(
          'select regen_notes from content_items where id = $1',
          [item.id],
        );
        return (rows[0]?.regen_notes ?? []).join(' ');
      }, { timeout: 20_000 })
      .toContain('lead with the failure');

    const jobs = await db().query<{ kind: string; payload: { note?: string } }>(
      `select kind, payload from jobs where payload ->> 'contentItemId' = $1`,
      [item.id],
    );
    expect(jobs.rows.map((j) => j.kind)).toContain('correct_content');
    expect(jobs.rows[0]?.payload.note).toContain('lead with the failure');

    /* And it is still here to be decided on. */
    const { rows } = await db().query<{ status: string }>(
      'select status from content_items where id = $1',
      [item.id],
    );
    expect(rows[0]?.status).toBe('pending_approval');

    await db().query(`delete from jobs where payload ->> 'contentItemId' = $1`, [item.id]);
  });
});

test.describe('QC blocks the decision, it does not decorate it', () => {
  test('a render failure shows the error and offers a retry instead of Approve', async ({
    page,
  }) => {
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

    await page.goto(`/gallery/${item.id}`);

    /* The reason, in the provider's own words, on the piece that failed. */
    // `.first()`: the reason is shown both in the failure panel and in the
    // render history below it, and both are correct.
    await expect(page.getByText('E2E template props failed validation').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try the render again' })).toBeVisible();

    /*
     * And no way to approve something that was never made. Not a disabled
     * button: the decision block renders only for `pending_approval`, so on a
     * failed piece there is nothing to press at all — stronger than greying it
     * out, and the assertion should say the stronger thing.
     */
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });
});
