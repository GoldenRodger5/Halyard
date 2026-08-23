/**
 * Watch terms — the ignition `collect_watch_terms` never had.
 *
 * The job has been scheduled daily per product since milestone 41. The handler
 * is written, three sources are implemented, `watch_hits` dedupes on
 * `(watch_term_id, url)`, and `findRecurringQuestions` promotes a question asked
 * repeatedly into a `signal` that feeds the idea engine.
 *
 * It read an **empty table** every day, because nothing in the product could
 * create a watch term: no page, no server action, no API route referenced
 * `watch_terms` at all. The same shape as `explore_product` before P1 and
 * `verify-provider` before P2 — a complete capability with no way in.
 *
 * These prove the way in exists and reaches the queue. What they cannot prove is
 * that Reddit returns anything useful, which needs a real term and a real day.
 */
import { db, expect, test } from './fixtures';

const TERM = 'e2e gluten free crumb';

test.describe('watch terms', () => {
  test.afterEach(async () => {
    await db().query('delete from watch_terms where term like $1', ['e2e %']);
    await db().query(`delete from jobs where dedupe_key like 'watch_manual:%'`);
  });

  test('an operator can create one, and it lands enabled with its sources', async ({ page }) => {
    await page.goto('/finds');
    await expect(page.getByText('What Halyard watches')).toBeVisible();

    await page.getByPlaceholder('gluten free bread gummy').fill(TERM);
    await page.getByRole('button', { name: 'Watch', exact: true }).click();

    // Polled: a server action's redirect is not the transaction committing.
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ enabled: boolean; sources: string[] }>(
          'select enabled, sources from watch_terms where term = $1',
          [TERM],
        );
        return rows[0] ?? null;
      })
      .toMatchObject({ enabled: true, sources: ['reddit'] });
  });

  test('says a term has never been read rather than showing a zero', async ({ page }) => {
    // "Read and found nothing" and "never read" are different facts, and only
    // one of them is a reason to change the term.
    await db().query(
      `insert into watch_terms (product_id, term, sources, enabled)
       values ('recipefix', $1, array['reddit'], true)
       on conflict (product_id, term) do nothing`,
      [TERM],
    );

    await page.goto('/finds');
    await expect(page.getByText('never read yet')).toBeVisible();
  });

  test('collect now enqueues the job the schedule alone could not fill', async ({ page }) => {
    await page.goto('/finds');
    await page.getByRole('button', { name: 'Collect now' }).click();

    await expect
      .poll(async () => {
        const { rows } = await db().query(
          `select id from jobs where kind = 'collect_watch_terms' and dedupe_key like 'watch_manual:%'`,
        );
        return rows.length;
      })
      .toBeGreaterThan(0);
  });

  test('stopping a term keeps what it already saw', async ({ page }) => {
    /**
     * Disabled rather than deleted. `watch_hits` references the term, and thirty
     * days of recurrence evidence is the only thing that makes a signal mean
     * anything — deleting the term to silence it would delete the evidence.
     */
    const { rows } = await db().query<{ id: string }>(
      `insert into watch_terms (product_id, term, sources, enabled)
       values ('recipefix', $1, array['reddit'], true) returning id`,
      [TERM],
    );
    await db().query(
      `insert into watch_hits (watch_term_id, product_id, source, url, title, question)
       values ($1, 'recipefix', 'reddit', 'https://example.com/e2e', 'why is my crumb gummy', true)`,
      [rows[0]!.id],
    );

    await page.goto('/finds');
    /*
     * Scoped to this term's own row. An unscoped locator clicked whichever
     * "Stop watching" rendered first, which is a different term as soon as the
     * database holds more than one — so the assertion below could pass while the
     * click had disabled somebody else's watch.
     */
    await page
      .getByRole('listitem')
      .filter({ hasText: TERM })
      .getByRole('button', { name: 'Stop watching' })
      .click();

    await expect
      .poll(async () => {
        const { rows: after } = await db().query<{ enabled: boolean }>(
          'select enabled from watch_terms where term = $1',
          [TERM],
        );
        return after[0]?.enabled;
      })
      .toBe(false);

    // The evidence survives the term being switched off.
    const { rows: hits } = await db().query('select id from watch_hits where watch_term_id = $1', [
      rows[0]!.id,
    ]);
    expect(hits).toHaveLength(1);
  });
});

/**
 * An operator's find becoming evidence, through the real screen.
 *
 * `signals` had one writer. A find could become one post through `draftFind`
 * and could never become evidence, so the idea generator (`DECISIONS.md` §84)
 * only ever saw recurring questions from watch terms.
 */
test.describe('finds become signals', () => {
  const URL_A = 'https://example.com/e2e-find-signal';

  test.afterEach(async () => {
    await db().query('delete from signals where raw ->> $1 = $2', ['url', URL_A]);
    await db().query('delete from finds where url = $1', [URL_A]);
  });

  test('a pasted find with a reason becomes a signal the idea path can see', async ({ page }) => {
    await page.goto('/finds');

    await page.getByPlaceholder('https://...').fill(URL_A);
    await page
      .getByPlaceholder(/why is it useful/i)
      .fill('shows the substitution mechanism plainly');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Polled: a server action's redirect is not the transaction committing.
    await expect
      .poll(async () => {
        const { rows } = await db().query<{ summary: string; raw: Record<string, unknown> }>(
          `select summary, raw from signals
            where product_id = 'founder' and consumed_at is null
              and raw ->> 'url' = $1`,
          [URL_A],
        );
        return rows[0] ?? null;
      })
      .not.toBeNull();

    const { rows } = await db().query<{ summary: string; raw: Record<string, unknown> }>(
      `select summary, raw from signals where raw ->> 'url' = $1`,
      [URL_A],
    );
    // The operator's sentence leads, and the provenance says who collected it.
    expect(rows[0]!.summary).toMatch(/^shows the substitution mechanism plainly/);
    expect(rows[0]!.raw.collectedBy).toBe('operator');
    expect(rows[0]!.raw.findId).toBeTruthy();
  });

  test('a bare URL with no reason creates no signal', async ({ page }) => {
    // The same gate `draftFind` applies: without the reason there is nothing to
    // say, and a bare link would reach the idea generator as though vouched for.
    await page.goto('/finds');
    await page.getByPlaceholder('https://...').fill(URL_A);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect
      .poll(async () => {
        const { rows } = await db().query('select id from finds where url = $1', [URL_A]);
        return rows.length;
      })
      .toBe(1);

    const { rows } = await db().query(`select id from signals where raw ->> 'url' = $1`, [URL_A]);
    expect(rows).toHaveLength(0);
  });
});
