/**
 * Cold-start honesty. Milestone 51.
 *
 * The rule under test: no screen shows a confident number it does not have the
 * data for. These assertions are deliberately about *absence* — that a rate is
 * withheld, that a window is labelled a default, that "no data" is not confused
 * with "no difference".
 */
import { db, expect, test } from './fixtures';

test.describe('cold start', () => {
  test('/analytics says what is not measurable before showing the charts', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.getByText('What is not measurable yet')).toBeVisible();
  });

  test('best-posting-time windows are labelled defaults until enough posts run', async ({
    page,
  }) => {
    await page.goto('/analytics');
    const section = page.locator('section', { hasText: 'Best time to post' }).first();
    await expect(section).toBeVisible();

    // The seeded database is far below the sample threshold, so every window
    // must say so rather than presenting a shipped default as a measurement.
    await expect(section.getByText(/Timing computed from fewer than 30 is noise/).first()).toBeVisible();
    await expect(section.getByText(/of 12 posts/).first()).toBeVisible();
  });

  test('a funnel with nothing behind it shows dashes, not zeros', async ({ page }) => {
    // "0.0% of the step before" computed from an empty database reads as a
    // catastrophic conversion rate rather than as an absence.
    const published = await db().query<{ n: string }>(
      `select count(*) as n from content_items where status = 'published'`,
    );

    await page.goto('/analytics');
    if (Number(published.rows[0]!.n) === 0) {
      await expect(page.getByText('they are absent ones')).toBeVisible();
    } else {
      // With data present the page must not be claiming otherwise.
      await expect(page.getByText('they are absent ones')).toHaveCount(0);
    }
  });

  test('the first-30-days page says which phase you are in', async ({ page }) => {
    await page.goto('/first-30-days');
    await expect(page.getByRole('heading', { name: 'The first thirty days' })).toBeVisible();
    await expect(page.getByText('you are here').first()).toBeVisible();
    // The point of the page: naming the things that look broken and are not.
    await expect(page.getByText('What looks wrong but is not').first()).toBeVisible();
  });

  test('/launch previews a fortnight without committing it', async ({ page }) => {
    const before = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );

    await page.goto('/launch');
    await expect(page.getByRole('button', { name: 'Generate my first two weeks' })).toBeVisible();

    // Rendering the preview must not have written anything.
    const after = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  test('the launch plan names what it could not place instead of dropping it silently', async ({
    page,
  }) => {
    await page.goto('/launch');
    const deferred = page.getByText('Could not be placed');
    if ((await deferred.count()) > 0) {
      await expect(page.getByText(/minimum is \d+/).first()).toBeVisible();
    }
  });
});

test.describe('cron entrypoints', () => {
  /**
   * Vercel Cron issues GET. This route exported only POST, so every scheduled
   * task would have returned 405 in production — silently, because a cron that
   * 405s does not page anybody. `refresh_tokens` is one of them, so the first
   * visible symptom would have been tokens expiring with nothing renewing them.
   */
  const SCHEDULED = ['refresh_tokens', 'account_health', 'purge_request_logs'];

  for (const task of SCHEDULED) {
    test(`${task} answers the GET that the scheduler actually sends`, async ({ request }) => {
      const secret = process.env.CRON_SECRET;
      test.skip(!secret, 'CRON_SECRET is not set in this environment');

      const response = await request.get(`/api/cron/${task}`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      expect(response.status(), `${task} must not 405`).toBe(200);
    });
  }

  test('refuses an unauthenticated call', async ({ request }) => {
    expect((await request.get('/api/cron/account_health')).status()).toBe(401);
  });

  test('refuses a task that is not on the list', async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, 'CRON_SECRET is not set in this environment');
    const response = await request.get('/api/cron/rm_rf', {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(response.status()).toBe(404);
  });

  test('every cron declared in vercel.json is a task the route knows', async ({ request }) => {
    // A schedule pointing at a path the route rejects is a job that never runs.
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, 'CRON_SECRET is not set in this environment');

    const declared = JSON.parse(
      await import('node:fs/promises').then((fs) => fs.readFile('apps/web/vercel.json', 'utf8')),
    ) as { crons: Array<{ path: string; schedule: string }> };

    for (const cron of declared.crons) {
      const response = await request.get(cron.path, {
        headers: { authorization: `Bearer ${secret}` },
      });
      expect(response.status(), `${cron.path} is declared in vercel.json`).toBe(200);
    }
  });
});
