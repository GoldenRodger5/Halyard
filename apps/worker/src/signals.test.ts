/**
 * The RSS handler that was scheduled for the life of the system and never
 * written. Tested against a real Postgres with a scripted fetch.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { collectSignalsHandler } from './handlers/signals.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

const feed = (items: Array<{ guid: string; title: string }>): string =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${items
    .map(
      (i) =>
        `<item><guid>${i.guid}</guid><link>https://example.test/${i.guid}</link><title>${i.title}</title><pubDate>Wed, 13 Aug 2026 10:00:00 GMT</pubDate></item>`,
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

async function addSource(name: string, url: string): Promise<void> {
  await pool.query(
    `insert into rss_sources (product_id, name, feed_url, why, weight, enabled)
     values ('recipefix',$1,$2,'test',1,true)`,
    [name, url],
  );
}

d('collectSignalsHandler', () => {
  it('says so when there are no sources rather than looking successful', async () => {
    const ctx = context();
    await collectSignalsHandler(job(), ctx);
    expect(ctx.logs.map(([m]) => m)).toContain('no rss sources configured');
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
    await addSource('Only feed', 'https://one.test/rss');
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
