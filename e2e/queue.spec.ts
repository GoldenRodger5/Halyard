/**
 * The approval boundary, through the screen an operator actually uses.
 *
 * `apps/worker/src/approvalBoundary.test.ts` attacks the publisher directly.
 * This covers the half that only exists in the UI: the edit form, and what
 * happens to an approval when the words change under it.
 */
import { db, expect, test } from './fixtures';

/**
 * Editing an approved item withdraws its approval.
 *
 * The gap: `editItem` changed the body and left `status` alone, so an approved
 * item could be edited and the publish job already sitting in the queue would
 * send text **nobody approved** — the exact thing the approval gate exists to
 * prevent, reached without touching the gate.
 */
test.describe('approval does not survive an edit', () => {
  const BODY = 'An approved body that a human signed off on.';

  test.afterEach(async () => {
    await db().query(`delete from content_items where body like 'An approved body%'`);
    await db().query(`delete from content_items where body like 'Edited after approval%'`);
  });

  test('an edit returns the item to pending approval', async ({ page }) => {
    const { rows: account } = await db().query<{ id: string }>(
      `select id from social_accounts where persona = 'brand' and platform = 'x' limit 1`,
    );
    const { rows } = await db().query<{ id: string }>(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, body, status, approved_at)
       values ('recipefix', $1, 'x', 'brand', 'text', 'education', $2, 'approved', now())
       returning id`,
      [account[0]!.id, BODY],
    );
    const id = rows[0]!.id;

    await page.goto(`/queue/${id}`);
    await page.locator('textarea[name="body"]').fill('Edited after approval, without re-approval.');
    await page.getByRole('button', { name: /save/i }).first().click();

    await expect
      .poll(async () => {
        const { rows: after } = await db().query<{ status: string; approved_at: string | null }>(
          'select status, approved_at from content_items where id = $1',
          [id],
        );
        return after[0] ?? null;
      })
      .toMatchObject({ status: 'pending_approval' });

    // And the approval timestamp is cleared, so nothing reads it as still-signed.
    const { rows: after } = await db().query<{ approved_at: string | null }>(
      'select approved_at from content_items where id = $1',
      [id],
    );
    expect(after[0]!.approved_at).toBeNull();
  });
});
