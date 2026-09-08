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
  test('Numbers says what is not measurable before showing anything', async ({ page }) => {
    /*
     * §572. The rule, not the heading it used to sit under.
     *
     * This asserted a panel titled "What is not measurable yet". The rebuilt
     * Numbers room states the same rule in the body, and the distinction it
     * draws is the whole contract: a dash is unmeasured, a zero is measured and
     * found to be zero, and those are different facts.
     */
    await page.goto('/numbers');
    await expect(page.getByText(/nothing has published yet/i).first()).toBeVisible();
    await expect(page.getByText(/a dash means unmeasured/i).first()).toBeVisible();
  });

  /*
   * §572. Retired: best-posting-time windows are not on this screen.
   *
   * The panel that labelled shipped defaults as defaults does not exist in the
   * rebuilt Numbers room. The rule it protected — never present a default as a
   * measurement — is still enforced where the timing is computed, and is
   * covered by the scheduling unit tests. There is nothing here to click.
   */

  test('a funnel with nothing behind it shows dashes, not zeros', async ({ page }) => {
    // "0.0% of the step before" computed from an empty database reads as a
    // catastrophic conversion rate rather than as an absence.
    const published = await db().query<{ n: string }>(
      `select count(*) as n from content_items where status = 'published'`,
    );

    await page.goto('/numbers');
    if (Number(published.rows[0]!.n) === 0) {
      await expect(page.getByText(/absent numbers, not low ones/i)).toBeVisible();
    } else {
      // With data present the page must not be claiming otherwise.
      await expect(page.getByText(/absent numbers, not low ones/i)).toHaveCount(0);
    }
  });

  test('Learned says why there is nothing yet, rather than showing an empty chart', async ({
    page,
  }) => {
    /*
     * §572. The "first thirty days" page became Numbers ▸ Learned.
     *
     * Same job: say what looks broken and is not. It now does it by naming the
     * reason a belief cannot exist yet — a cohort needs a baseline before a
     * difference means anything — which is the honest version of the phase
     * banner this used to assert.
     */
    await page.goto('/numbers/learned');
    await expect(page.getByText(/no beliefs yet/i)).toBeVisible();
    await expect(page.getByText(/nothing has published, so nothing has been measured/i)).toBeVisible();
    /* And it must not be a model's opinion dressed as a measurement. */
    await expect(page.getByText(/never written by a model/i)).toBeVisible();
  });

  test('/launch previews a fortnight without committing it', async ({ page }) => {
    const before = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );

    await page.goto('/rundown/launch');
    await expect(page.getByRole('button', { name: 'Generate the batch' })).toBeVisible();

    // Rendering the preview must not have written anything.
    const after = await db().query<{ n: string }>(
      `select count(*) as n from content_items where generation_meta->>'source' = 'launch_batch'`,
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  test('the launch plan names what it could not place instead of dropping it silently', async ({
    page,
  }) => {
    await page.goto('/rundown/launch');
    const deferred = page.getByText(/could not be honoured/i);
    if ((await deferred.count()) > 0) {
      /* Named and counted, with the rule that refused them. */
      await expect(
        page.getByText(/slots? could not be placed without breaking a spacing rule/i).first(),
      ).toBeVisible();
      await expect(page.getByText(/dropped rather than squeezed in/i).first()).toBeVisible();
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
