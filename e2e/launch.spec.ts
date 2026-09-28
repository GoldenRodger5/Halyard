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
 * The submit button, located by the form that owns the run-length select rather than its label.
 *
 * The control is a `<select name="days">`; the older test looked for an input
 * with that name, so it never clicked anything and then waited for rows that
 * could not exist. This selector follows the actual accessible form contract.
 */
const generateButton = (page: Page) => page.locator('form:has(select[name="days"]) button');

/** Click it and wait for the staged count the page reports back. */
async function stage(page: Page): Promise<void> {
  await page.goto('/rundown/launch');
  const stagedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/rundown/launch'),
  );
  await generateButton(page).click();
  // The action writes package/brief/item/variant/recipe rows first, then jobs,
  // then the audit record. Waiting only for the first content row observes a
  // valid plan mid-flight and makes later assertions compare different moments.
  await stagedResponse;
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
                 delete from content_items where generation_meta->>'source' = 'launch_batch';
                 delete from concepts where product_id = 'recipefix' and origin_kind = 'launch';
                 update social_accounts set provider_account_id = null
                   where product_id='recipefix' and provider_account_id like 'e2e-%';`;

test.describe('launch batch', () => {
  test.beforeEach(async () => {
    await db().query(CLEANUP);
    // A social-account row is not an actionable identity by itself. Production
    // Launch requires either a direct credential or a unified provider mapping,
    // so the E2E fixture proves that same boundary instead of bypassing it.
    await db().query(
      `update social_accounts
          set provider_account_id = 'e2e-' || platform || '-' || id::text
        where product_id='recipefix' and persona='brand' and capability_state <> 'disabled'`,
    );
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
      concept_id: string | null;
      brief_id: string | null;
      production_recipe_id: string | null;
      production_v2: boolean;
    }>(
      `select id, body, status, scheduled_at, generation_meta->>'purpose' as purpose,
              concept_id, brief_id, production_recipe_id,
              coalesce((generation_meta->>'production_v2')::boolean, false) as production_v2
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
      expect(row.production_v2).toBe(true);
      expect(row.concept_id).not.toBeNull();
      expect(row.brief_id).not.toBeNull();
      expect(row.production_recipe_id).not.toBeNull();
      // The live orchestration rolls the whole opening run forward when today's
      // day-one slots have already passed. Never stage an opening post in the past.
      expect(new Date(row.scheduled_at!).getTime()).toBeGreaterThan(Date.now());
      // Nothing on the exact hour — that is the automation fingerprint.
      expect(new Date(row.scheduled_at!).getUTCMinutes()).not.toBe(0);
    }

    // Every account opens with a post that says what the account is.
    expect(staged.rows.filter((r) => r.purpose === 'introduction').length).toBeGreaterThan(0);

    const jobs = await db().query<{ n: string }>(
      `select count(*) as n from jobs where dedupe_key like 'launch_generate:%'`,
    );
    expect(Number(jobs.rows[0]!.n)).toBe(staged.rowCount);

    const lineage = await db().query<{
      items: string;
      concepts: string;
      briefs: string;
      variants: string;
      recipes: string;
      calibration_recipes: string;
      human_review_recipes: string;
    }>(
      `select
         count(*)::text as items,
         count(distinct ci.concept_id)::text as concepts,
         count(distinct ci.brief_id)::text as briefs,
         count(distinct pv.id)::text as variants,
         count(distinct pr.id)::text as recipes,
         count(distinct pr.id) filter (where pr.mode='calibration')::text as calibration_recipes,
         count(distinct pr.id) filter (where pr.human_review_required)::text as human_review_recipes
       from content_items ci
       left join platform_variants pv on pv.content_item_id = ci.id
       left join production_recipes pr on pr.id = ci.production_recipe_id
       where ci.generation_meta->>'source'='launch_batch'`,
    );
    const v2 = lineage.rows[0]!;
    expect(Number(v2.briefs)).toBe(staged.rowCount);
    expect(Number(v2.variants)).toBe(staged.rowCount);
    expect(Number(v2.recipes)).toBe(staged.rowCount);
    expect(Number(v2.calibration_recipes)).toBe(staged.rowCount);
    // Text-native variants may need no media production; every visual variant
    // is calibration-gated by the production router.
    expect(Number(v2.human_review_recipes)).toBeGreaterThan(0);
    expect(Number(v2.concepts)).toBeLessThan(staged.rowCount);
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
    const before = await db().query<{ n: string }>(
      `select count(*)::text as n from content_items
        where generation_meta->>'source'='launch_batch'`,
    );
    const edited = await db().query<{ id: string; key: string }>(
      `update content_items set body = 'written by hand'
        where id = (select id from content_items
                     where generation_meta->>'source' = 'launch_batch' limit 1)
        returning id, generation_meta->>'key' as key`,
    );

    await stage(page);

    const survived = await db().query<{ body: string }>(
      'select body from content_items where id = $1',
      [edited.rows[0]!.id],
    );
    expect(survived.rows[0]?.body).toBe('written by hand');

    const after = await db().query<{ n: string }>(
      `select count(*)::text as n from content_items
        where generation_meta->>'source'='launch_batch'`,
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);

    const sameKey = await db().query<{ n: string }>(
      `select count(*)::text as n from content_items
        where generation_meta->>'source'='launch_batch'
          and generation_meta->>'key'=$1`,
      [edited.rows[0]!.key],
    );
    expect(Number(sameKey.rows[0]!.n)).toBe(1);
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
