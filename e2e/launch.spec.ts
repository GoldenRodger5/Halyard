/**
 * The launch batch, end to end. Milestone 51.
 *
 * The preview is unit-tested; what this covers is the part unit tests cannot —
 * that clicking the button stages real rows with real times and enqueues one
 * generation job each, and that clicking it twice does not write the fortnight
 * twice.
 */
import type { Page } from '@playwright/test';
import { db, expect, test } from './fixtures';

/**
 * The submit button, located by its form rather than its label.
 *
 * The label changes once a batch exists ("Replan the batch"), and it changes on
 * a re-render the test does not control. Matching the form that owns the day
 * count is stable across both states.
 */
const generateButton = (page: Page) => page.locator('form:has(input[name="days"]) button');

/** Click it and wait for the staged count the page reports back. */
async function stage(page: Page): Promise<void> {
  await page.goto('/rundown/launch');
  await generateButton(page).click();
  await page.waitForLoadState('networkidle');

  /**
   * §572. Polled on the rows, not on a sentence the page used to print.
   *
   * This waited for the text "posts staged", which the rebuilt Rundown does not
   * say anywhere — so it reloaded for thirty seconds and gave up, on a batch
   * that had staged correctly. What the test needs is that the rows exist, and
   * the rows are readable directly. Staging is a server action that keeps
   * working after the network goes quiet, so it is still polled rather than
   * read once.
   */
  await expect
    .poll(async () => {
      const { rows } = await db().query<{ n: string }>(
        `select count(*) as n from content_items
          where generation_meta->>'source' = 'launch_batch'`,
      );
      return Number(rows[0]!.n);
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

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
    await stage(page);

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
    await stage(page);

    // Polled: staging is a server action, and the count below races its commit
    // on a slower runner. The assertion is unchanged.
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ n: string }>(
          `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
        );
        return Number(rows[0]!.n);
      })
      .toBeGreaterThan(0);

    const first = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );

    // Replanning must not see its own untouched slots as a full calendar and
    // defer everything — the bug this test was written to catch.
    await stage(page);

    const second = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );
    expect(second.rows[0]!.n).toBe(first.rows[0]!.n);
  });

  test('regenerating keeps a slot somebody has already edited', async ({ page }) => {
    await stage(page);

    // A draft with a body is not scaffolding, whoever wrote it.
    const edited = await db().query<{ id: string }>(
      `update content_items set body = 'written by hand'
        where id = (select id from content_items
                     where generation_meta->>'source' = 'launch_batch' limit 1)
        returning id`,
    );

    await stage(page);

    const survived = await db().query<{ body: string }>(
      'select body from content_items where id = $1',
      [edited.rows[0]!.id],
    );
    expect(survived.rows[0]?.body).toBe('written by hand');
  });

  /*
   * §572. Retired: there is no way to discard a batch from the screen.
   *
   * `discardLaunchBatch` is a server action with no caller — the rebuilt
   * Rundown never renders a control that reaches it, so there is no user path
   * for an end-to-end test to walk. The action is orphaned (§562's shape) and
   * is recorded in `docs/E2E_CONTRACT.md`; restoring a discard control should
   * restore this test with it.
   */
});
