/**
 * The RSS handler that was scheduled for the life of the system and never
 * written. Tested against a real Postgres with a scripted fetch.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { collectSignalsHandler, relevanceOf, STORY_TTL_HOURS } from './handlers/signals.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toUTCString();

/**
 * Ages are relative on purpose. The first version of this helper hardcoded
 * `Wed, 13 Aug 2026` — inside the freshness window on the day it was written
 * and outside it two days later, which is a test that passes now and fails on
 * a date nobody will connect to this file.
 */
const feed = (items: Array<{ guid: string; title: string; ageHours?: number }>): string =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${items
    .map(
      (i) =>
        `<item><guid>${i.guid}</guid><link>https://example.test/${i.guid}</link><title>${i.title}</title><pubDate>${hoursAgo(i.ageHours ?? 2)}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('signals', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from rss_items');
  await pool.query('delete from rss_sources');
  await pool.query(`delete from products where id = 'founder'`);
});

function context(): HandlerContext & { logs: Array<[string, unknown]> } {
  const logs: Array<[string, unknown]> = [];
  return {
    pool,
    workerId: 'test',
    logs,
    log: (m: string, d?: unknown) => logs.push([m, d]),
    enqueue: async () => undefined,
  } as unknown as HandlerContext & { logs: Array<[string, unknown]> };
}

const job = (): Job =>
  ({
    id: 'j1',
    kind: 'collect_signals',
    payload: { productId: 'recipefix' },
    attempts: 1,
    max_attempts: 2,
    dedupe_key: null,
  }) as Job;

async function addSource(name: string, url: string, weight = 1): Promise<void> {
  await pool.query(
    `insert into rss_sources (product_id, name, feed_url, why, weight, enabled)
     values ('recipefix',$1,$2,'test',$3,true)`,
    [name, url, weight],
  );
}

describe('relevanceOf', () => {
  it('ranks a story one trusted outlet carried above a preprint nobody else did', () => {
    // The take screen was entirely arXiv: every single-outlet story scored an
    // identical 0.33, so the tie broke on recency and the highest-volume,
    // lowest-weighted source took all five slots.
    expect(relevanceOf([1.4])).toBeGreaterThan(relevanceOf([0.6]));
  });

  it('still lets convergence beat a single trusted outlet', () => {
    expect(relevanceOf([0.6, 0.6, 0.6])).toBeGreaterThan(relevanceOf([1.4]));
  });

  it('takes the highest contributing weight, not the average', () => {
    // Carried by Hacker News and arXiv, it is a Hacker News story.
    expect(relevanceOf([1.4, 0.6])).toBe(relevanceOf([0.6, 1.4]));
    expect(relevanceOf([1.4, 0.6])).toBeCloseTo(Math.min(1, (2 / 3) * 1.4), 5);
  });

  it('never exceeds 1, whatever the weights', () => {
    expect(relevanceOf([1.4, 1.3, 1.3, 1.0])).toBe(1);
  });

  it('is zero when nothing carried it', () => {
    expect(relevanceOf([])).toBe(0);
  });
});

d('collectSignalsHandler — reaching the feeds at all', () => {
  it('collects for the founder persona, whose feeds these are', async () => {
    /**
     * The bug that survived the first fix and looked exactly like a fix.
     *
     * Every RSS source belongs to `founder`, which is `kind = 'personal'`. The
     * scheduler's perProduct option enqueues one job per `kind = 'product'`
     * row, so the job arrived with `productId: 'recipefix'`, found no sources,
     * logged "no rss sources configured" and returned. Thirteen jobs drained
     * from queued to done in production and the feeds were still never polled.
     */
    await pool.query(
      `insert into products (id, name, kind, connector_type)
       values ('founder','Isaac','personal','none') on conflict do nothing`,
    );
    await pool.query(
      `insert into rss_sources (product_id, name, feed_url, why, weight, enabled)
       values ('founder','Founder feed','https://founder.test/rss','test',1,true)`,
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(feed([{ guid: 'f1', title: 'A story worth reacting to' }]))),
    );

    // No productId in the payload, exactly as the scheduler now enqueues it.
    const ctx = context();
    await collectSignalsHandler(
      { ...job(), payload: {} } as Job,
      ctx,
    );

    const { rows } = await pool.query<{ product_id: string }>('select product_id from rss_items');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.product_id).toBe('founder');
    vi.unstubAllGlobals();
  });

  it('polls the sources, so last_polled_at proves it ran', async () => {
    await pool.query(
      `insert into rss_sources (product_id, name, feed_url, why, weight, enabled)
       values ('recipefix','Product feed','https://p.test/rss','test',1,true)`,
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response(feed([{ guid: 'p', title: 'A story' }]))));

    await collectSignalsHandler({ ...job(), payload: {} } as Job, context());

    const { rows } = await pool.query<{ polled: string | null }>(
      'select last_polled_at as polled from rss_sources',
    );
    expect(rows[0]!.polled).not.toBeNull();
    vi.unstubAllGlobals();
  });
});

d('collectSignalsHandler', () => {
  it('says so when there are no sources rather than looking successful', async () => {
    const ctx = context();
    await collectSignalsHandler(job(), ctx);
    expect(ctx.logs.map(([m]) => m)).toContain('no products have rss sources');
  });

  it('stores what it fetched', async () => {
    await addSource('Test feed', 'https://feed.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(feed([{ guid: 'a', title: 'A story about bread' }]))),
    );

    await collectSignalsHandler(job(), context());
    const { rows } = await pool.query<{ title: string; status: string }>(
      'select title, status from rss_items',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('new');
    vi.unstubAllGlobals();
  });

  it('scores convergence by distinct outlets, not by items absorbed', async () => {
    /**
     * The bug the first real run produced. `feedCount` counts everything the
     * clusterer absorbed, and one feed publishing "Introducing X", "Introducing
     * Y" and "Introducing Z" absorbs its own headlines on title similarity —
     * scoring a single-source story as maximum convergence.
     */
    await addSource('Only feed', 'https://one.test/rss', 0.6);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            feed([
              { guid: '1', title: 'Introducing the first thing' },
              { guid: '2', title: 'Introducing the second thing' },
              { guid: '3', title: 'Introducing the third thing' },
            ]),
          ),
      ),
    );

    await collectSignalsHandler(job(), context());
    const { rows } = await pool.query<{ feed_count: number; relevance: string }>(
      'select feed_count, relevance from rss_items order by feed_count desc limit 1',
    );
    // One source, whatever the clusterer merged.
    expect(rows[0]!.feed_count).toBe(1);
    expect(Number(rows[0]!.relevance)).toBeLessThan(0.5);
    vi.unstubAllGlobals();
  });

  it('records a dead feed and keeps the others', async () => {
    await addSource('Broken', 'https://broken.test/rss');
    await addSource('Working', 'https://working.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('broken')
          ? new Response('nope', { status: 404 })
          : new Response(feed([{ guid: 'ok', title: 'A working story' }])),
      ),
    );

    await collectSignalsHandler(job(), context());

    const { rows: broken } = await pool.query<{ last_error: string | null }>(
      `select last_error from rss_sources where name = 'Broken'`,
    );
    expect(broken[0]!.last_error).toContain('404');

    const { rows: items } = await pool.query('select 1 from rss_items');
    expect(items).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('does not store the same story twice across runs', async () => {
    await addSource('Test feed', 'https://feed.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(feed([{ guid: 'same', title: 'The same story' }]))),
    );

    await collectSignalsHandler(job(), context());
    await collectSignalsHandler(job(), context());

    const { rows } = await pool.query('select 1 from rss_items');
    expect(rows).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('does not offer a story from 2015 as something to react to today', async () => {
    /**
     * Several of these feeds serve a deep archive rather than a recent window.
     * Expiry was written as `now() + 48 hours` — measured from when we happened
     * to fetch, not when it was published — so the first successful production
     * run stored 2,118 stories, marked every one `new`, and the take screen
     * offered a story from **2015** as today's news. 1,135 were over a year old.
     *
     * Nothing errored; the count went up, which read as the feature working.
     */
    await addSource('Archive feed', 'https://archive.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            feed([
              { guid: 'ancient', title: 'A story from years ago', ageHours: 24 * 365 * 10 },
              { guid: 'stale', title: 'A story from last week', ageHours: 24 * 7 },
              { guid: 'fresh', title: 'A story from this morning', ageHours: 3 },
            ]),
          ),
      ),
    );

    await collectSignalsHandler(job(), context());

    const { rows } = await pool.query<{ guid: string }>('select guid from rss_items');
    expect(rows.map((r) => r.guid)).toEqual(['fresh']);
    vi.unstubAllGlobals();
  });

  it('expires from publication, so a story fetched late is already old', async () => {
    // The window is a property of the story, not of when we got round to it.
    await addSource('Test feed', 'https://feed.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(feed([{ guid: 'late', title: 'Published a while back', ageHours: 40 }])),
      ),
    );

    await collectSignalsHandler(job(), context());

    const { rows } = await pool.query<{ hours: string }>(
      `select extract(epoch from (expires_at - published_at)) / 3600 as hours from rss_items`,
    );
    expect(Math.round(Number(rows[0]!.hours))).toBe(STORY_TTL_HOURS);
    vi.unstubAllGlobals();
  });

  it('keeps an undated item, since fetch time is the only clock there is', async () => {
    await addSource('Undated feed', 'https://undated.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            `<?xml version="1.0"?><rss version="2.0"><channel><item><guid>u</guid><link>https://example.test/u</link><title>No date on this one</title></item></channel></rss>`,
          ),
      ),
    );

    await collectSignalsHandler(job(), context());

    const { rows } = await pool.query('select 1 from rss_items');
    expect(rows).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('expires a story nobody reacted to rather than deleting it', async () => {
    await addSource('Test feed', 'https://feed.test/rss');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(feed([{ guid: 'old', title: 'An old story' }]))),
    );
    await collectSignalsHandler(job(), context());

    await pool.query(`update rss_items set expires_at = now() - interval '1 hour'`);
    await collectSignalsHandler(job(), context());

    const { rows } = await pool.query<{ status: string }>('select status from rss_items');
    // Still there: a story nobody reacted to is evidence of what the feeds
    // were carrying that week.
    expect(rows[0]!.status).toBe('expired');
    vi.unstubAllGlobals();
  });
});
