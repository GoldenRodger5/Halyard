/**
 * The rules that must hold even when everything else is broken.
 * Milestone 29, scenarios 6, 9 and 10.
 */
import { db, expect, seedItem, test } from './fixtures';

test.describe('the kill switch', () => {
  /**
   * Establish the precondition rather than inherit it.
   *
   * This test pauses publishing, so it needs publishing to be running first.
   * It had an `afterEach` restoring that state and no `beforeEach` setting it,
   * which worked only because `seed-demo.sql` happens to enable publishing —
   * and the canonical `db:reset --fresh --seed` path that CI runs does not.
   *
   * The schema default is `false` and that is deliberate: publishing is off
   * until somebody turns it on. Enabling it in the canonical seed to satisfy a
   * test would weaken a safety default, so the test arranges its own state
   * instead. No assertion below changes.
   */
  test.beforeEach(async () => {
    await db().query('update settings set publishing_enabled = true, publishing_disabled_reason = null');
  });

  test.afterEach(async () => {
    await db().query('update settings set publishing_enabled = true, publishing_disabled_reason = null');
  });

  test('pausing publishing shows everywhere and stops the publish job at its first check', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.locator('input[name="reason"]').fill('E2E pause');
    await page.getByRole('button', { name: 'Pause all publishing' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Publishing is currently')).toBeVisible();
    await expect(page.locator('aside').getByText('Publishing paused')).toBeVisible();

    const { rows } = await db().query<{ publishing_enabled: boolean; publishing_disabled_reason: string }>(
      'select publishing_enabled, publishing_disabled_reason from settings where id = true',
    );
    expect(rows[0]?.publishing_enabled).toBe(false);
    expect(rows[0]?.publishing_disabled_reason).toBe('E2E pause');

    // An approved, due item stays approved: the worker checks the switch first.
    const item = await seedItem({ status: 'approved', scheduledAt: new Date(Date.now() - 60_000) });
    const before = await db().query('select count(*) from publications');
    await page.goto('/queue?status=scheduled');
    const after = await db().query('select count(*) from publications');
    expect(after.rows[0]).toEqual(before.rows[0]);

    const state = await db().query<{ status: string }>(
      'select status from content_items where id = $1',
      [item.id],
    );
    expect(state.rows[0]?.status).toBe('approved');
  });
});

test.describe('draft_only accounts', () => {
  test('a TikTok item shows the manual-publish path rather than pretending it went live', async ({
    page,
  }) => {
    const item = await seedItem({
      platform: 'tiktok',
      status: 'awaiting_manual_publish',
      body: 'E2E tiktok draft. Three changes, two of them matter.',
      scheduledAt: null,
    });

    const account = await db().query<{ id: string }>(
      `select id from social_accounts where platform = 'tiktok' and persona = 'brand' limit 1`,
    );
    await db().query(
      `insert into publications (content_item_id, account_id, platform, platform_post_id,
                                 publish_mode, manual_publish_url, published_at)
       values ($1, $2, 'tiktok', 'e2e-pub', 'draft', 'https://www.tiktok.com/upload?lang=en', now())`,
      [item.id, account.rows[0]!.id],
    );

    await page.goto('/queue?status=all');
    await expect(
      page.locator(`#queue-item-${item.id}`).getByText('awaiting manual publish'),
    ).toBeVisible();

    await page.goto('/accounts');
    /**
     * Provider-specific constraints moved into "Advanced connection details" in
     * the Accounts clarity pass — they are secondary to whether the account
     * works, but they are not deleted. This opens the disclosure and asserts
     * the constraint is still there, which is the property that matters: an
     * operator planning TikTok content can still find out that API-published
     * video cannot carry trending audio.
     */
    // Every card has its own disclosure, so open them all rather than guessing
    // which index belongs to TikTok.
    const disclosures = page.getByText('Advanced connection details');
    const count = await disclosures.count();
    for (let i = 0; i < count; i += 1) await disclosures.nth(i).click();
    await expect(page.getByText(/cannot attach trending audio/i).first()).toBeVisible();

    await db().query('delete from publications where platform_post_id = $1', ['e2e-pub']);
  });
});

test.describe('the Daily Take is input-gated', () => {
  test('offers no way to generate an opinion without one', async ({ page }) => {
    await page.goto('/take');

    await expect(page.getByRole('heading', { name: 'Daily Take' })).toBeVisible();
    await expect(page.getByText(/nothing is drafted until you give it one/i)).toBeVisible();

    // The absence is the assertion: there is no button that produces a take.
    await expect(page.getByRole('button', { name: /generate.*take/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /write.*for me/i })).toHaveCount(0);
  });

  test('the composer refuses to submit an empty take', async ({ page }) => {
    /**
     * This used to `test.skip` when no unexpired story happened to be in the
     * database, which made the coverage a function of when the feeds last ran.
     * It skipped for real the day story expiry was corrected to run from
     * publication rather than fetch — the whole local table aged out at once
     * and the rule this test guards stopped being checked, silently.
     *
     * A test that needs a story should make one.
     */
    await db().query(
      `insert into rss_sources (id, product_id, name, feed_url, why, weight, enabled)
       values ('00000000-0000-0000-0000-0000000000e2', 'founder', 'E2E source',
               'https://e2e.test/rss', 'E2E', 1, false)
       on conflict (id) do nothing`,
    );
    await db().query(
      `insert into rss_items
         (source_id, product_id, guid, url, title, fetched_at, published_at,
          cluster_key, feed_count, expires_at, relevance, status)
       values ('00000000-0000-0000-0000-0000000000e2', 'founder', 'E2E story',
               'https://e2e.test/s', 'E2E story worth an opinion', now(), now(),
               'e2e', 1, now() + interval '1 hour', 1, 'new')
       on conflict (product_id, guid) do update set expires_at = now() + interval '1 hour',
                                                    status = 'new'`,
    );

    await page.goto('/take');
    await page.getByRole('button', { name: 'I have a take on this' }).first().click();
    await expect(page.getByRole('button', { name: 'Check and draft' })).toBeDisabled();
  });
});

test.describe('the inbox never sends', () => {
  test('states the rule and offers no auto-reply', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByText(/There is no auto-reply in this system/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /auto.?reply/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /reply to all/i })).toHaveCount(0);
  });
});

test.describe('onboarding gates generation', () => {
  // Restored afterwards: a spec that leaves the database in a different state
  // makes the next run depend on the last one.
  test.afterEach(async () => {
    await db().query(
      `update onboarding_state set step_calibration_done = false, step_templates_done = false
        where product_id = 'recipefix'`,
    );
  });

  test('an unfinished wizard blocks the daily job and says so', async ({ page }) => {
    await db().query(
      `update onboarding_state set step_calibration_done = false, step_templates_done = false
        where product_id = 'recipefix'`,
    );

    await page.goto('/');
    await expect(page.getByText(/First-run calibration is not finished/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue setup' })).toBeVisible();

    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'First run' })).toBeVisible();
    await expect(page.getByText(/Calibration batch/)).toBeVisible();
  });
});
