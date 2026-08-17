/**
 * The Product Brain screens, against real data.
 *
 * The rule from the P0 specs applies unchanged: assert on content that can only
 * come from the database, never on a heading that would render whether or not
 * anything was wired. A page that says "Identity" proves nothing; a page that
 * says "verified · 0.50 · 2 sources" proves the whole chain ran.
 */
import { db, expect, test } from './fixtures';

/** Seed one evidence row and return its id. */
async function seedEvidence(url: string, hash: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `insert into product_evidence (product_id, kind, source_url, content_hash, title, body, collector)
     values ('recipefix','web_page',$1,$2,'E2E page','E2E body','e2e')
     returning id`,
    [url, hash],
  );
  return rows[0]!.id;
}

async function cleanup(): Promise<void> {
  await db().query(`delete from product_facts where key like 'e2e%'`);
  await db().query(`delete from product_evidence where collector = 'e2e'`);
}

test.describe('the Product Brain', () => {
  test.beforeEach(cleanup);
  test.afterAll(cleanup);

  test('says plainly that it knows nothing, rather than showing an empty shell', async ({
    page,
  }) => {
    const { rows } = await db().query<{ n: string }>(
      `select count(*)::int as n from product_facts where product_id = 'recipefix'`,
    );
    test.skip(Number(rows[0]!.n) > 0, 'facts exist, so the empty state is not the case under test');

    await page.goto('/brain');
    await expect(page.getByText('Halyard knows nothing about this product yet')).toBeVisible();
    // The offer must be an action, not an apology.
    await expect(page.getByRole('button', { name: 'Collect evidence' }).first()).toBeVisible();
  });

  test('a fact shows its status, confidence and source count together', async ({ page }) => {
    /**
     * The three are rendered as one unit deliberately: a confidence number
     * alone is the same failure as a quality gate with no measurement — it
     * looks like information.
     */
    const a = await seedEvidence('https://e2e.test/a', 'e2e-hash-a');
    const b = await seedEvidence('https://e2e.test/b', 'e2e-hash-b');

    await db().query(
      `insert into product_facts
         (product_id, category, key, value, status, confidence, evidence_ids,
          agent_id, agent_version, last_verified_at)
       values ('recipefix','identity','e2e_what','Adapts recipes for real diets',
               'verified', 0.50, array[$1::uuid,$2::uuid], 'product-discovery','1.0', now())`,
      [a, b],
    );

    await page.goto('/brain');
    await expect(page.getByText('Adapts recipes for real diets')).toBeVisible();
    await expect(page.getByText(/verified · 0\.50 · 2 sources/).first()).toBeVisible();
  });

  test('a fact can be followed to the page it came from', async ({ page }) => {
    // The whole point of the evidence table: a claim that cannot be traced to a
    // source is an assertion with a timestamp.
    const a = await seedEvidence('https://e2e.test/traceable', 'e2e-hash-trace');
    await db().query(
      `insert into product_facts
         (product_id, category, key, value, status, confidence, evidence_ids,
          agent_id, agent_version)
       values ('recipefix','pricing','e2e_price','Free to try','unverified', 0.25,
               array[$1::uuid], 'store-listing','1.0')`,
      [a],
    );

    await page.goto('/brain/pricing');
    await expect(page.getByText('Free to try')).toBeVisible();
    await expect(page.getByText('https://e2e.test/traceable')).toBeVisible();
    await expect(page.getByText('store-listing')).toBeVisible();
  });

  test('an unverified fact says so rather than showing a bare number', async ({ page }) => {
    const a = await seedEvidence('https://e2e.test/single', 'e2e-hash-single');
    await db().query(
      `insert into product_facts
         (product_id, category, key, value, status, confidence, evidence_ids,
          agent_id, agent_version)
       values ('recipefix','users','e2e_who','People with dietary restrictions',
               'unverified', 0.25, array[$1::uuid], 'product-discovery','1.0')`,
      [a],
    );

    await page.goto('/brain/users');
    await expect(page.getByText(/unverified · 0\.25 · 1 source/)).toBeVisible();
    await expect(page.getByText('never verified').first()).toBeVisible();
  });

  test('a contradiction shows both sides and resolves neither', async ({ page }) => {
    const a = await seedEvidence('https://e2e.test/web', 'e2e-hash-web');
    const b = await seedEvidence('https://e2e.test/store', 'e2e-hash-store');

    const left = await db().query<{ id: string }>(
      `insert into product_facts
         (product_id, category, key, value, status, confidence, evidence_ids,
          agent_id, agent_version)
       values ('recipefix','pricing','e2e_monthly','5 pounds a month','unverified',0.25,
               array[$1::uuid],'product-discovery','1.0') returning id`,
      [a],
    );
    const right = await db().query<{ id: string }>(
      `insert into product_facts
         (product_id, category, key, value, status, confidence, evidence_ids,
          agent_id, agent_version)
       values ('recipefix','pricing','e2e_monthly','9 pounds a month','unverified',0.25,
               array[$1::uuid],'store-listing','1.0') returning id`,
      [b],
    );

    const explanation = 'The website may be showing a promotional price.';
    await db().query('update product_facts set contradicts = $2, reconciliation = $3 where id = $1', [
      left.rows[0]!.id,
      right.rows[0]!.id,
      explanation,
    ]);
    await db().query('update product_facts set contradicts = $2, reconciliation = $3 where id = $1', [
      right.rows[0]!.id,
      left.rows[0]!.id,
      explanation,
    ]);

    await page.goto('/brain/contradictions');
    await expect(page.getByText('5 pounds a month')).toBeVisible();
    await expect(page.getByText('9 pounds a month')).toBeVisible();
    await expect(page.getByText(explanation)).toBeVisible();
    // Stated on the screen, so nobody reads the explanation as a verdict.
    await expect(page.getByText('An explanation, not a decision')).toBeVisible();
  });

  test('evidence nothing cites is reported, not hidden', async ({ page }) => {
    /**
     * Collected-and-unused is a different problem from not-collected, and it is
     * invisible from the fact list. It means either a page with nothing on it
     * or an agent not seeing what is there.
     */
    await seedEvidence('https://e2e.test/uncited', 'e2e-hash-uncited');

    await page.goto('/brain/evidence');
    await expect(page.getByText('https://e2e.test/uncited')).toBeVisible();
    await expect(page.getByText(/produced no fact/)).toBeVisible();
  });

  test('features come from the claim inventory, and say how they are verified', async ({
    page,
  }) => {
    // The Brain must not restate features. This screen states where they come
    // from so the distinction survives contact with a reader.
    await page.goto('/brain/features');
    await expect(page.getByText(/replayed in a real browser/)).toBeVisible();
    await expect(page.getByText('feature_claims')).toBeVisible();
  });

  test('exploring the product enqueues the job that had no trigger before', async ({ page }) => {
    /**
     * `explore_product` shipped with a handler, a policy and an agent contract,
     * and nothing in the entire system enqueued it. This button is the ignition
     * it was missing, and this test is what stops it going missing again.
     */
    await db().query(`delete from jobs where kind = 'explore_product'`);

    await page.goto('/brain/features');
    await page.getByRole('button', { name: 'Explore the product' }).first().click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ n: string }>(
          `select count(*) as n from jobs
            where kind = 'explore_product' and payload->>'productId' = 'recipefix'`,
        );
        return Number(rows[0]!.n);
      })
      .toBeGreaterThan(0);

    await db().query(`delete from jobs where kind = 'explore_product'`);
  });

  test('collecting evidence enqueues the collector', async ({ page }) => {
    await db().query(`delete from jobs where kind = 'collect_product_evidence'`);

    await page.goto('/brain');
    await page.getByRole('button', { name: 'Collect evidence' }).first().click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ n: string }>(
          `select count(*) as n from jobs where kind = 'collect_product_evidence'`,
        );
        return Number(rows[0]!.n);
      })
      .toBeGreaterThan(0);

    await db().query(`delete from jobs where kind = 'collect_product_evidence'`);
  });

  test('a category with no producing agent is not offered at all', async ({ page }) => {
    /**
     * Every category the Brain offers must be one some agent can fill. The
     * "Not yet reachable" panel exists for gaps, and an empty panel means there
     * are none — which is the state P1 leaves the system in.
     */
    const a = await seedEvidence('https://e2e.test/anchor', 'e2e-hash-anchor');
    await db().query(
      `insert into product_facts
         (product_id, category, key, value, evidence_ids, agent_id, agent_version)
       values ('recipefix','identity','e2e_anchor','Anchor', array[$1::uuid],
               'product-discovery','1.0')`,
      [a],
    );

    await page.goto('/brain');
    await expect(page.getByText('Not yet reachable')).toHaveCount(0);
  });
});
