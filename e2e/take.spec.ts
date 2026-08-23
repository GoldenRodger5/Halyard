/**
 * The founder take, end to end through the screen.
 *
 * `approveTake` and `discardTake` were complete server actions referenced from
 * **nowhere** — not a page, not a component, not a test. A take could be spoken,
 * fact-checked and drafted, and then the operator had no way to act on it: the
 * draft rendered with no controls beneath it and the workflow dead-ended.
 *
 * These assert the two ends of that workflow, and specifically that approving a
 * take does not publish it.
 */
import { db, expect, test } from './fixtures';

const RAW = 'E2E raw reaction for the take workflow';

async function seedDraftedTake(): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `insert into takes (product_id, raw_input, status, draft)
     values ('founder', $1, 'drafted', 'E2E drafted take body that the operator can act on.')
     returning id`,
    [RAW],
  );
  return rows[0]!.id;
}

test.describe('the founder take', () => {
  test.afterEach(async () => {
    await db().query('delete from content_items where body like $1', ['E2E drafted take%']);
    await db().query('delete from takes where raw_input = $1', [RAW]);
  });

  test('a drafted take can be sent to the queue', async ({ page }) => {
    const id = await seedDraftedTake();

    await page.goto('/take');
    await expect(page.getByText('E2E drafted take body')).toBeVisible();
    await page.getByRole('button', { name: 'Send to queue' }).first().click();

    // Polled: a server action's redirect is not the transaction committing.
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ status: string }>(
          'select status from takes where id = $1',
          [id],
        );
        return rows[0]?.status;
      })
      .toBe('approved');

    /**
     * The decisive assertion. Approving a take creates a content item in
     * `pending_approval` — it does **not** publish, and it does not skip the
     * queue's own approval gate. A take is raw material, not a shortcut past
     * the boundary §90/§92 exist to hold.
     */
    const { rows } = await db().query<{ status: string; persona: string; platform: string }>(
      `select status, persona, platform from content_items where body like 'E2E drafted take%'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending_approval');
    expect(rows[0]!.persona).toBe('founder');
  });

  test('says plainly that sending it to the queue is not publishing', async ({ page }) => {
    // The control is new; the copy has to say what it does, because "send" is
    // exactly the word an operator would read as "post it".
    await seedDraftedTake();
    await page.goto('/take');
    await expect(page.getByText(/does not publish it/i)).toBeVisible();
  });

  test('a drafted take can be discarded without creating anything', async ({ page }) => {
    const id = await seedDraftedTake();

    await page.goto('/take');
    await page.getByRole('button', { name: 'Discard' }).first().click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ status: string }>(
          'select status from takes where id = $1',
          [id],
        );
        return rows[0]?.status;
      })
      .toBe('discarded');

    const { rows } = await db().query(
      `select id from content_items where body like 'E2E drafted take%'`,
    );
    expect(rows).toHaveLength(0);
  });
});
