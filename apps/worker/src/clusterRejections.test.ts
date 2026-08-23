/**
 * The rejection clusterer's producer, against a real Postgres.
 *
 * `rejection_clusters` had a complete consumer and no producer, so the tests
 * that matter are the ones proving a row now actually lands — and the ones
 * proving the job cannot destroy a decision the operator already made.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { HANDLERS } from './handlers/index.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('cluster_rejections', 4);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle)
     values ('recipefix','x','brand','@rf') returning id`,
  );
  accountId = rows[0]!.id;
});

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from rejection_clusters');
  await pool.query('delete from content_items');
});

function ctx(): HandlerContext {
  return {
    pool,
    log: () => undefined,
    enqueue: async () => undefined,
  } as unknown as HandlerContext;
}

const job = { id: 'j1', kind: 'cluster_rejections', payload: {} } as unknown as Job;

/** Rejected items whose reasons share known complaint vocabulary. */
async function seedRejections(
  reasons: string[],
  { category = 'education', status = 'rejected' } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (const reason of reasons) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, status, reject_reason, body)
       values ('recipefix', $1, 'x', 'brand', 'text', $2, $3, $4, 'body') returning id`,
      [accountId, category, status, reason],
    );
    ids.push(rows[0]!.id);
  }
  return ids;
}

d('cluster_rejections', () => {
  it('writes a cluster the dashboard can read', async () => {
    await seedRejections([
      'too salesy, reads like an ad',
      'this is just an advert',
      'way too promo for us',
    ]);

    await HANDLERS.cluster_rejections!(job, ctx());

    const { rows } = await pool.query<{ pattern: string; occurrences: number; status: string; suggested_rule: string | null }>(
      `select pattern, occurrences, status, suggested_rule from rejection_clusters`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pattern).toBe('reads like an ad');
    expect(rows[0]!.occurrences).toBe(3);
    expect(rows[0]!.status).toBe('surfaced');
    // The rule is what `clusterActions` promotes into brand_voices.dont_rules.
    expect(rows[0]!.suggested_rule).toContain('mechanism or a number');
  });

  it('records which items formed the pattern, so a cluster can be checked', async () => {
    const ids = await seedRejections(['too salesy', 'an advert', 'pure promo']);
    await HANDLERS.cluster_rejections!(job, ctx());
    const { rows } = await pool.query<{ example_ids: string[] }>(
      'select example_ids from rejection_clusters',
    );
    expect(rows[0]!.example_ids.slice().sort()).toEqual(ids.slice().sort());
  });

  it('does nothing when there are too few rejections to be a pattern', async () => {
    await seedRejections(['too salesy', 'an advert']);
    await HANDLERS.cluster_rejections!(job, ctx());
    const { rows } = await pool.query('select 1 from rejection_clusters');
    expect(rows).toHaveLength(0);
  });

  it('ignores items that were not rejected', async () => {
    // Approving is not a complaint. Reading `reject_reason` without checking
    // status would learn a rule from copy the operator liked.
    await seedRejections(['too salesy', 'an advert', 'pure promo'], { status: 'approved' });
    await HANDLERS.cluster_rejections!(job, ctx());
    const { rows } = await pool.query('select 1 from rejection_clusters');
    expect(rows).toHaveLength(0);
  });

  it('does not ask again about a cluster the operator dismissed', async () => {
    await seedRejections(['too salesy', 'an advert', 'pure promo']);
    await HANDLERS.cluster_rejections!(job, ctx());
    // What `dismissCluster` does: suppress for thirty days, not delete.
    await pool.query(
      `update rejection_clusters set status = 'dismissed', dismissed_until = now() + interval '30 days'`,
    );

    // The same rejections are still there, so a naive rerun would surface it
    // again and ask the operator the same question every day.
    await HANDLERS.cluster_rejections!(job, ctx());

    const { rows } = await pool.query<{ status: string }>('select status from rejection_clusters');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('dismissed');
  });

  it('surfaces it again once the dismissal window lapses', async () => {
    // `dismissCluster` suppresses rather than deletes, because a pattern
    // dismissed once may be worth acting on after another ten rejections.
    await seedRejections(['too salesy', 'an advert', 'pure promo']);
    await HANDLERS.cluster_rejections!(job, ctx());
    await pool.query(
      `update rejection_clusters set status = 'dismissed', dismissed_until = now() - interval '1 day'`,
    );

    await HANDLERS.cluster_rejections!(job, ctx());

    const { rows } = await pool.query<{ status: string }>(
      `select status from rejection_clusters order by status`,
    );
    expect(rows.map((r) => r.status)).toEqual(['dismissed', 'surfaced']);
  });

  it('never asks again about a rule the operator already accepted', async () => {
    await seedRejections(['too salesy', 'an advert', 'pure promo']);
    await HANDLERS.cluster_rejections!(job, ctx());
    // Accepting writes the rule into products.content_rules; re-surfacing it
    // would ask the operator to accept a rule that is already in force.
    await pool.query(`update rejection_clusters set status = 'accepted'`);

    await HANDLERS.cluster_rejections!(job, ctx());

    const { rows } = await pool.query<{ status: string }>('select status from rejection_clusters');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('accepted');
  });

  it('does not duplicate a cluster when it runs again', async () => {
    await seedRejections(['too salesy', 'an advert', 'pure promo']);
    await HANDLERS.cluster_rejections!(job, ctx());
    await HANDLERS.cluster_rejections!(job, ctx());
    const { rows } = await pool.query('select 1 from rejection_clusters');
    expect(rows).toHaveLength(1);
  });

  it('stops surfacing a pattern that no longer recurs', async () => {
    await seedRejections(['too salesy', 'an advert', 'pure promo']);
    await HANDLERS.cluster_rejections!(job, ctx());
    expect((await pool.query('select 1 from rejection_clusters')).rows).toHaveLength(1);

    // Clusters are a view over current rejections, not an event log.
    await pool.query('delete from content_items');
    await seedRejections(['boring', 'flat, no tension', 'dull hook']);
    await HANDLERS.cluster_rejections!(job, ctx());

    const { rows } = await pool.query<{ pattern: string }>('select pattern from rejection_clusters');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pattern).toBe('no tension in the hook');
  });
});
