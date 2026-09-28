/**
 * Campaigns. Milestone 44.
 *
 * The definition of done: a sentence describing a Product Hunt launch produces
 * a reviewable multi-day, multi-platform sequence, generated and staged.
 */
import { db, expect, test } from './fixtures';

/**
 * §572. A campaign row, because the UI cannot make one.
 *
 * `createCampaign` has no caller. Everything downstream of a campaign existing
 * — planning, moving, generating, pausing — is wired on the detail page, so the
 * fixture starts where the product actually begins.
 */
async function seedCampaign(name: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `insert into campaigns (product_id, name, kind, brief, starts_at, ends_at,
                            product_mix_ceiling, status)
     values ('recipefix', $1, 'launch', 'E2E brief for a bounded window.',
             current_date + 3, current_date + 8, 0.5, 'planning')
     returning id`,
    [name],
  );
  return rows[0]!.id;
}

test.describe('planning a campaign', () => {
  test.beforeEach(async () => {
    // Campaign planning uses the same actionable-identity rule as Launch:
    // direct credential OR mapped unified-provider account.
    await db().query(
      `update social_accounts
          set provider_account_id = 'e2e-campaign-' || platform || '-' || id::text
        where product_id='recipefix' and persona='brand' and capability_state <> 'disabled'`,
    );
  });

  test.afterEach(async () => {
    await db().query(`delete from content_items where campaign_id is not null`);
    await db().query(`delete from concepts where product_id='recipefix' and origin_kind='campaign'`);
    await db().query(`delete from campaigns where name like 'E2E %'`);
    await db().query(
      `update social_accounts set provider_account_id=null
        where product_id='recipefix' and provider_account_id like 'e2e-campaign-%'`,
    );
  });

  /**
   * Server actions in the app router fire on a hydrated button. Clicking before
   * hydration silently does nothing, so every action in this file is confirmed
   * by polling the row it should have written rather than by a load state.
   */
  async function campaignStatus(name: string): Promise<string | null> {
    const { rows } = await db().query<{ status: string }>(
      `select status from campaigns where name=$1`,
      [name],
    );
    return rows[0]?.status ?? null;
  }

  async function waitForCompletePlan(name: string): Promise<void> {
    // `staged` is written only after the planner finished every slot. A count
    // threshold can observe a partially committed loop and compare two moments
    // in the same plan as though they were one snapshot.
    await expect.poll(() => campaignStatus(name)).toBe('staged');
  }

  test('a sentence becomes a staged, rearrangeable timeline before anything generates', async ({
    page,
  }) => {
    /*
     * §572. Seeded, because there is no way to create a campaign from the UI.
     *
     * `createCampaign` is a server action with no caller — the Campaigns room
     * explains what a campaign is and lists the ones that exist, and offers no
     * form to make one. That is a product gap, recorded in
     * `docs/E2E_CONTRACT.md`; what it must not do is take the *planner* down
     * with it, because the planner is wired, is reachable, and is where the
     * bug this test was written for lived.
     */
    const id = await seedCampaign('E2E Product Hunt launch');
    await page.goto(`/rundown/campaigns/${id}`);

    await expect(page.getByText('E2E Product Hunt launch').first()).toBeVisible();

    await page.getByRole('button', { name: 'Plan the sequence' }).click();

    /**
     * Wait for the count this test actually needs, not for the first row.
     *
     * The planner inserts one slot per statement in a loop, each its own
     * autocommit, so a reader can observe the table part-filled. Polling for
     * `> 0` returned as soon as the *first* insert landed and the assertions
     * below then read a partial plan — reliably on a slow CI runner, never on
     * a fast local machine. The assertions are unchanged; only the barrier is,
     * and it now matches what they require.
     */
    await waitForCompletePlan('E2E Product Hunt launch');

    const { rows } = await db().query<{
      platform: string;
      persona: string;
      body: string;
      purpose: string;
      concept_id: string | null;
      brief_id: string | null;
      production_recipe_id: string | null;
      production_v2: boolean;
    }>(
      `select ci.platform, ci.persona, ci.body,
              ci.generation_meta ->> 'purpose' as purpose,
              ci.concept_id, ci.brief_id, ci.production_recipe_id,
              coalesce((ci.generation_meta->>'production_v2')::boolean,false) as production_v2
         from content_items ci join campaigns c on c.id = ci.campaign_id
        where c.name = 'E2E Product Hunt launch' order by ci.scheduled_at`,
    );

    // Multi-day, multi-platform, and every slot still empty.
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rows.map((r) => r.platform)).size).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.body === '')).toBe(true);
    expect(rows.every((r) => r.production_v2)).toBe(true);
    expect(rows.every((r) => r.concept_id !== null)).toBe(true);
    expect(rows.every((r) => r.brief_id !== null)).toBe(true);
    expect(rows.every((r) => r.production_recipe_id !== null)).toBe(true);

    const lineage = await db().query<{ variants: string; recipes: string; concepts: string }>(
      `select
         count(distinct pv.id)::text as variants,
         count(distinct pr.id)::text as recipes,
         count(distinct ci.concept_id)::text as concepts
       from content_items ci
       left join platform_variants pv on pv.content_item_id=ci.id
       left join production_recipes pr on pr.id=ci.production_recipe_id
       join campaigns c on c.id=ci.campaign_id
       where c.name='E2E Product Hunt launch'`,
    );
    expect(Number(lineage.rows[0]!.variants)).toBe(rows.length);
    expect(Number(lineage.rows[0]!.recipes)).toBe(rows.length);
    expect(Number(lineage.rows[0]!.concepts)).toBeLessThan(rows.length);

    // The shape of a launch, not ten copies of an announcement.
    const purposes = new Set(rows.map((r) => r.purpose));
    expect(purposes.has('teaser')).toBe(true);
    expect(purposes.has('launch_announcement')).toBe(true);
    expect(purposes.has('results')).toBe(true);
    expect(rows.filter((r) => r.purpose === 'launch_announcement')).toHaveLength(1);

    // Only actionable identities get a slot. A provider-mapped account may be
    // pending on its bespoke/direct OAuth and is still a real draft target.
    const unpublishable = await db().query(
      `select ci.id from content_items ci
         join social_accounts sa on sa.id = ci.account_id
         join campaigns c on c.id = ci.campaign_id
        where c.name = 'E2E Product Hunt launch'
          and (sa.capability_state='disabled'
               or (sa.access_token_enc is null and sa.provider_account_id is null))`,
    );
    expect(unpublishable.rows).toHaveLength(0);
  });

  test('replanning preserves a written slot without staging a duplicate of its stable key', async ({ page }) => {
    const id = await seedCampaign('E2E preserved campaign slot');
    await page.goto(`/rundown/campaigns/${id}`);
    await page.getByRole('button', { name: 'Plan the sequence' }).click();
    await waitForCompletePlan('E2E preserved campaign slot');

    const edited = await db().query<{ id: string; key: string }>(
      `update content_items set body='human-edited campaign copy'
        where id=(select id from content_items where campaign_id=$1 order by scheduled_at limit 1)
        returning id, generation_meta->>'key' as key`,
      [id],
    );
    const key = edited.rows[0]!.key;

    await page.reload();
    const replanned = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/rundown/campaigns/${id}`),
    );
    await page.getByRole('button', { name: 'Re-plan empty slots' }).click();
    await replanned;

    const duplicates = await db().query<{ n: string; body: string }>(
      `select count(*)::text as n, max(body) as body
         from content_items where campaign_id=$1 and generation_meta->>'key'=$2`,
      [id, key],
    );
    expect(Number(duplicates.rows[0]!.n)).toBe(1);
    expect(duplicates.rows[0]!.body).toBe('human-edited campaign copy');
  });

  test('the timeline offers a move control whose value matches the label beside it', async ({
    page,
  }) => {
    const id = await seedCampaign('E2E timezone campaign');
    await page.goto(`/rundown/campaigns/${id}`);
    await page.getByRole('button', { name: 'Plan the sequence' }).click();
    await waitForCompletePlan('E2E timezone campaign');
    await page.reload();

    const first = page.locator('input[name="scheduledAt"]').first();
    const value = await first.inputValue();

    // Moving without editing must be a no-op, not a silent shift by the UTC
    // offset. Compare what the input holds against what the row holds.
    const { rows } = await db().query<{ local: string }>(
      `select to_char(ci.scheduled_at at time zone p.operator_timezone, 'YYYY-MM-DD"T"HH24:MI') as local
         from content_items ci
         join campaigns c on c.id = ci.campaign_id
         join products p on p.id = ci.product_id
        where c.name = 'E2E timezone campaign'
        order by ci.scheduled_at limit 1`,
    );
    expect(value).toBe(rows[0]!.local);
  });
});
