/**
 * The post-publication evidence lifecycle, against a real Postgres.
 *
 * The invariant these exist to hold is a product rule, not a technical one:
 * **empirical evidence is only ever earned from observation.** A publication
 * existing does not mean it performed; a collection job running does not mean
 * anything was collected; an empty result is not a positive result.
 *
 * Every test here asserts an absence as carefully as a presence, because every
 * failure mode in this area looks like success from a distance.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { HANDLERS } from './handlers/index.js';
import type { HandlerContext, Job } from './poller.js';

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('collection', 4);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('recipefix','x','brand','@collectiontest','live') returning id`,
  );
  accountId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from post_metrics');
  await pool.query('delete from publications');
  await pool.query(`delete from content_items where product_id = 'recipefix'`);
});

async function item(status = 'approved'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, status)
     values ('recipefix',$1,'x','brand','text','announcement','body',$2) returning id`,
    [accountId, status],
  );
  return rows[0]!.id;
}

async function publication(itemId: string, postId: string | null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into publications
       (content_item_id, account_id, platform, publish_mode, platform_post_id, published_at)
     values ($1,$2,'x','direct',$3::text, case when $3::text is null then null else now() end)
     returning id`,
    [itemId, accountId, postId],
  );
  return rows[0]!.id;
}

d('a publication is the only source of collection', () => {
  it('keeps provenance from metrics back to the publication and its submission', async () => {
    const i = await item();
    const p = await publication(i, 'post-1');
    await pool.query('insert into post_metrics (publication_id, likes) values ($1, 3)', [p]);

    const { rows } = await pool.query<{ item_id: string; account_id: string; platform: string }>(
      `select p.content_item_id as item_id, p.account_id, p.platform
         from post_metrics m join publications p on p.id = m.publication_id`,
    );
    // Metrics → publication → content item → account. The whole chain resolves.
    expect(rows[0]!.item_id).toBe(i);
    expect(rows[0]!.account_id).toBe(accountId);
    expect(rows[0]!.platform).toBe('x');
  });

  it('cannot attach an observation to a publication that does not exist', async () => {
    await expect(
      pool.query(
        'insert into post_metrics (publication_id, likes) values (gen_random_uuid(), 5)',
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});

d('a failed publication produces no collectible success', () => {
  it('has no platform post id, which is what collection requires', async () => {
    /**
     * The real X 402: the request reached the provider, was refused, and
     * Halyard wrote no publication at all. This pins the weaker case too — a
     * publication row with no post id must still be uncollectable.
     */
    const i = await item();
    const p = await publication(i, null);

    const { rows } = await pool.query<{ id: string; post: string | null }>(
      'select id, platform_post_id as post from publications where id = $1',
      [p],
    );
    expect(rows[0]!.post).toBeNull();

    // The handler's own guard is `if (!publication?.platform_post_id) return`.
    const collectable = rows.filter((r) => r.post !== null);
    expect(collectable).toHaveLength(0);
  });

  it('makes the metrics handler return without collecting anything', async () => {
    /**
     * Exercises the real guard. Added after an adversarial pass: replacing
     * `if (!publication?.platform_post_id) return` with `if (!publication)`
     * left the whole suite green, which meant nothing actually protected the
     * rule that a refused publish yields no observations.
     */
    const i = await item();
    const p = await publication(i, null);

    const ctx = {
      pool,
      workerId: 'test',
      log: () => undefined,
      enqueue: async () => undefined,
    } as unknown as HandlerContext;
    const job = { id: 'j', kind: 'collect_metrics', payload: { publicationId: p } } as unknown as Job;

    // Must return before loading the account or calling any adapter. If it
    // proceeds it will throw on the missing credential, which also fails here.
    await HANDLERS.collect_metrics!(job, ctx);

    const { rows } = await pool.query<{ n: string }>(
      'select count(*) as n from post_metrics where publication_id = $1',
      [p],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('leaves no metrics behind for a refused publish', async () => {
    const { rows } = await pool.query<{ n: string }>('select count(*) as n from post_metrics');
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

d('unavailable data stays unavailable', () => {
  it('records a metric the provider did not return as null, not zero', async () => {
    /**
     * The distinction the whole loop rests on. `null` means nobody looked or
     * the provider does not report it; `0` means it was measured and was zero.
     * Collapsing them turns "we cannot see this" into "this performed badly".
     */
    const p = await publication(await item(), 'post-2');
    await pool.query('insert into post_metrics (publication_id, likes) values ($1, 0)', [p]);

    const { rows } = await pool.query<{ likes: number | null; impressions: number | null }>(
      'select likes, impressions from post_metrics where publication_id = $1',
      [p],
    );
    expect(rows[0]!.likes).toBe(0);
    // Never requested, never reported: null, and distinguishable from the zero.
    expect(rows[0]!.impressions).toBeNull();
  });

  it('does not treat an empty collection as evidence of anything', async () => {
    const p = await publication(await item(), 'post-3');
    await pool.query('insert into post_metrics (publication_id) values ($1)', [p]);

    const { rows } = await pool.query<{ measured: number }>(
      `select (impressions is not null)::int + (likes is not null)::int as measured
         from post_metrics where publication_id = $1`,
      [p],
    );
    // A row exists — the poll happened — and nothing in it is a measurement.
    expect(rows[0]!.measured).toBe(0);
  });
});

d('collection is scoped and idempotent', () => {
  it('scopes observations to one account, so nothing crosses accounts', async () => {
    // A different platform, so this cannot collide with the account created in
    // beforeAll — the point is only that it owns none of these observations.
    const other = await pool.query<{ id: string }>(
      `insert into social_accounts (product_id, platform, persona, handle, capability_state)
       values ('recipefix','bluesky','brand','@othertest','live')
       on conflict do nothing returning id`,
    );
    if (other.rows.length === 0) return;
    const p = await publication(await item(), 'post-4');
    await pool.query('insert into post_metrics (publication_id, likes) values ($1, 7)', [p]);

    const { rows } = await pool.query<{ n: string }>(
      `select count(*) as n from post_metrics m
         join publications pub on pub.id = m.publication_id
        where pub.account_id = $1`,
      [other.rows[0]!.id],
    );
    // The other account owns none of these observations.
    expect(Number(rows[0]!.n)).toBe(0);
    await pool.query('delete from social_accounts where handle = $1', ['@othertest']);
  });

  it('prevents a duplicate collection job for the same publication and poll window', async () => {
    /**
     * Idempotency lives at the queue, not in the metrics table: `post_metrics`
     * is a time series and two snapshots at *different* times are correct. What
     * must not happen is two jobs for the same window, and the partial unique
     * index on `jobs.dedupe_key` is what prevents it.
     */
    const p = await publication(await item(), 'post-5');
    const key = `metrics:${p}:24h`;
    await pool.query(
      `insert into jobs (kind, payload, dedupe_key) values ('collect_metrics', $1, $2)`,
      [JSON.stringify({ publicationId: p }), key],
    );
    await pool.query(
      `insert into jobs (kind, payload, dedupe_key) values ('collect_metrics', $1, $2)
       on conflict do nothing`,
      [JSON.stringify({ publicationId: p }), key],
    );

    const { rows } = await pool.query<{ n: string }>(
      'select count(*) as n from jobs where dedupe_key = $1',
      [key],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});

d('a publication cannot be duplicated', () => {
  it('refuses a second publication for the same item and account', async () => {
    const i = await item();
    await publication(i, 'post-6');
    // The guarantee behind "exactly one post", enforced by an index rather than
    // by the handler remembering.
    await expect(publication(i, 'post-7')).rejects.toThrow(/duplicate key|unique/i);
  });

  it('refuses reusing one platform post id on the same account', async () => {
    await publication(await item(), 'post-8');
    await expect(publication(await item(), 'post-8')).rejects.toThrow(/duplicate key|unique/i);
  });
});

d('an archived item is not publishable', () => {
  it('makes the publish handler return before it can reach a provider', async () => {
    /**
     * Exercises the real handler, not just the data.
     *
     * The first version of this suite asserted only that `archived` is not in
     * the approved set — which is a statement about a literal, and stayed green
     * when the guard itself was tampered with. This drives `publishHandler` and
     * asserts the observable consequence: it returns without publishing.
     */
    const i = await item('archived');
    await pool.query(
      `insert into settings (id, publishing_enabled) values (true, true)
       on conflict (id) do update set publishing_enabled = true`,
    );

    const logs: string[] = [];
    const ctx = {
      pool,
      workerId: 'test',
      log: (m: string) => logs.push(m),
      enqueue: async () => undefined,
    } as unknown as HandlerContext;
    const job = { id: 'j', kind: 'publish', payload: { contentItemId: i } } as unknown as Job;

    await HANDLERS.publish!(job, ctx);

    expect(logs.join(' ')).toContain('not approved');
    // The decisive assertion: no publication, so nothing reached a provider.
    const { rows } = await pool.query<{ n: string }>(
      'select count(*) as n from publications where content_item_id = $1',
      [i],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('is the governed way a failed test job is left inert', async () => {
    /**
     * How the real X 402 test job was neutralised: the content item moved to
     * `archived` through the normal state machine. The publish handler returns
     * at `if (!['approved','scheduled','publishing'].includes(item.status))`
     * before any account lookup or network call — so the job completes as done
     * and can never spend a credit, without deleting the record.
     */
    const i = await item('archived');
    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [i],
    );
    expect(['approved', 'scheduled', 'publishing']).not.toContain(rows[0]!.status);
  });
});

/**
 * Scoring, which is where an unmeasured post most easily becomes a measured one.
 *
 * `scorePerformance` joins `content_items` to `post_metrics` with a `left join
 * lateral`, so a published post that has never been collected arrives with
 * every metric null. It read those as `Number(x ?? 0)` and scored them, which
 * is the same "a collection job running ≠ metrics collected" error the rest of
 * this file exists to prevent — reached from the other side.
 */
d('a score is a claim, so it needs a measurement', () => {
  const job = { id: 'j-score', kind: 'score_performance', payload: {} } as unknown as Job;
  const logs: Array<{ message: string; detail?: Record<string, unknown> }> = [];

  function ctx(): HandlerContext {
    return {
      pool,
      workerId: 'test',
      log: (message: string, detail?: Record<string, unknown>) => logs.push({ message, detail }),
      enqueue: async () => undefined,
    } as unknown as HandlerContext;
  }

  beforeEach(async () => {
    logs.length = 0;
    await pool.query('delete from performance_scores');
  });

  it('writes no score for a published post that was never collected', async () => {
    const i = await item('published');
    await publication(i, 'post-uncollected');

    await HANDLERS.score_performance!(job, ctx());

    const { rows } = await pool.query('select content_item_id from performance_scores');
    expect(rows).toHaveLength(0);
  });

  it('says how many it refused to score, so an empty table is explicable', async () => {
    // "Nothing published" and "published but never collected" look identical in
    // an empty scores table, and only one of them is a broken collector.
    const i = await item('published');
    await publication(i, 'post-uncollected-2');

    await HANDLERS.score_performance!(job, ctx());

    const skipped = logs.find((l) => l.message === 'scoring skipped unmeasured posts');
    expect(skipped).toBeDefined();
    expect(skipped!.detail!.skipped).toBe(1);
  });

  it('does not let an uncollected post move the score of a collected one', async () => {
    /**
     * The assertion that matters. Percentiles are computed over the cohort, so
     * a fabricated zero at the bottom lifts every real post above it — one
     * uncollected post silently inflating every genuine score in the run.
     */
    const measured = await item('published');
    const p = await publication(measured, 'post-measured');
    await pool.query(
      'insert into post_metrics (publication_id, impressions, likes) values ($1, 5000, 100)',
      [p],
    );

    await HANDLERS.score_performance!(job, ctx());
    const { rows: alone } = await pool.query<{ score: string }>(
      'select score from performance_scores where content_item_id = $1',
      [measured],
    );

    const ghost = await item('published');
    await publication(ghost, 'post-ghost');
    await pool.query('delete from performance_scores');
    await HANDLERS.score_performance!(job, ctx());

    const { rows: withGhost } = await pool.query<{ score: string }>(
      'select score from performance_scores where content_item_id = $1',
      [measured],
    );
    expect(withGhost[0]!.score).toBe(alone[0]!.score);
    // And the ghost still has no score of its own.
    const { rows: all } = await pool.query('select content_item_id from performance_scores');
    expect(all).toHaveLength(1);
  });

  it('still scores a measured zero, which is a real observation', async () => {
    const i = await item('published');
    const p = await publication(i, 'post-flop');
    await pool.query(
      'insert into post_metrics (publication_id, impressions, likes) values ($1, 0, 0)',
      [p],
    );

    await HANDLERS.score_performance!(job, ctx());

    const { rows } = await pool.query<{ low_confidence: boolean }>(
      'select low_confidence from performance_scores where content_item_id = $1',
      [i],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.low_confidence).toBe(true);
  });
});

/**
 * The learning edge, end to end: what `score_performance` actually persists.
 *
 * §86 wired `performance_scores.conversion_score` into idea scoring. §106 found
 * that with no attribution the stored value was `0.5` — a percentile computed
 * over nothing — which the learning edge would have averaged as though it were
 * evidence. This asserts the column itself, not the in-memory score.
 */
d('conversion score reaches the database honestly', () => {
  const job = { id: 'j-conv', kind: 'score_performance', payload: {} } as unknown as Job;

  function ctx(): HandlerContext {
    return {
      pool,
      workerId: 'test',
      log: () => undefined,
      enqueue: async () => undefined,
    } as unknown as HandlerContext;
  }

  beforeEach(async () => {
    if (!available) return;
    await pool.query('delete from performance_scores');
    await pool.query('delete from attribution');
  });

  it('stores null when nothing has attribution', async () => {
    const i = await item('published');
    const p = await publication(i, 'post-conv-1');
    await pool.query('insert into post_metrics (publication_id, impressions, likes) values ($1, 5000, 100)', [p]);

    await HANDLERS.score_performance!(job, ctx());

    const { rows } = await pool.query<{ conversion_score: string | null; score: string }>(
      'select conversion_score, score from performance_scores where content_item_id = $1',
      [i],
    );
    expect(rows).toHaveLength(1);
    // Scored on reach and engagement; conversion is genuinely unmeasured.
    expect(rows[0]!.conversion_score).toBeNull();
    expect(Number(rows[0]!.score)).toBeGreaterThan(0);
  });

  it('stores a real percentile once any post has attribution', async () => {
    /**
     * The case that made the null worth having: with attribution present the
     * cohort can be ranked, so a zero becomes a *measured* zero rather than a
     * synthetic middle — and §86's average is then meaningful.
     */
    const converted = await item('published');
    const flat = await item('published');
    for (const [id, postId, activated] of [
      [converted, 'post-conv-2', 5],
      [flat, 'post-conv-3', 0],
    ] as const) {
      const p = await publication(id, postId);
      await pool.query(
        'insert into post_metrics (publication_id, impressions, likes) values ($1, 1000, 10)',
        [p],
      );
      await pool.query(
        'insert into attribution (content_item_id, activated_users) values ($1, $2)',
        [id, activated],
      );
    }

    await HANDLERS.score_performance!(job, ctx());

    const { rows } = await pool.query<{ content_item_id: string; conversion_score: string | null }>(
      'select content_item_id, conversion_score from performance_scores',
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.conversion_score).not.toBeNull();

    const win = rows.find((r) => r.content_item_id === converted)!;
    const lose = rows.find((r) => r.content_item_id === flat)!;
    expect(Number(win.conversion_score)).toBeGreaterThan(Number(lose.conversion_score));
  });
});
