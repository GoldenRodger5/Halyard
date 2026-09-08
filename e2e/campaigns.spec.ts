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
             '2026-09-18', '2026-09-23', 0.5, 'planning')
     returning id`,
    [name],
  );
  return rows[0]!.id;
}

test.describe('planning a campaign', () => {
  test.afterEach(async () => {
    await db().query(`delete from content_items where campaign_id is not null`);
    await db().query(`delete from campaigns where name like 'E2E %'`);
  });

  /**
   * Server actions in the app router fire on a hydrated button. Clicking before
   * hydration silently does nothing, so every action in this file is confirmed
   * by polling the row it should have written rather than by a load state.
   */
  async function planned(name: string): Promise<number> {
    const { rows } = await db().query<{ n: string }>(
      `select count(*) as n from content_items ci
         join campaigns c on c.id = ci.campaign_id where c.name = $1`,
      [name],
    );
    return Number(rows[0]!.n);
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
    await expect.poll(() => planned('E2E Product Hunt launch')).toBeGreaterThanOrEqual(10);

    const { rows } = await db().query<{
      platform: string;
      persona: string;
      body: string;
      purpose: string;
    }>(
      `select ci.platform, ci.persona, ci.body, ci.generation_meta ->> 'purpose' as purpose
         from content_items ci join campaigns c on c.id = ci.campaign_id
        where c.name = 'E2E Product Hunt launch' order by ci.scheduled_at`,
    );

    // Multi-day, multi-platform, and every slot still empty.
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rows.map((r) => r.platform)).size).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.body === '')).toBe(true);

    // The shape of a launch, not ten copies of an announcement.
    const purposes = new Set(rows.map((r) => r.purpose));
    expect(purposes.has('teaser')).toBe(true);
    expect(purposes.has('launch_announcement')).toBe(true);
    expect(purposes.has('results')).toBe(true);
    expect(rows.filter((r) => r.purpose === 'launch_announcement')).toHaveLength(1);

    // Only accounts that can actually publish get a slot.
    const unpublishable = await db().query(
      `select ci.id from content_items ci
         join social_accounts sa on sa.id = ci.account_id
         join campaigns c on c.id = ci.campaign_id
        where c.name = 'E2E Product Hunt launch'
          and sa.capability_state not in ('live', 'draft_only')`,
    );
    expect(unpublishable.rows).toHaveLength(0);
  });

  test('the timeline offers a move control whose value matches the label beside it', async ({
    page,
  }) => {
    const id = await seedCampaign('E2E timezone campaign');
    await page.goto(`/rundown/campaigns/${id}`);
    await page.getByRole('button', { name: 'Plan the sequence' }).click();
    await expect.poll(() => planned('E2E timezone campaign')).toBeGreaterThan(0);
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
