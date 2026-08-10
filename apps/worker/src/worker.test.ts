/**
 * Worker integration tests against a real Postgres.
 *
 * Build pack §6: "Publish idempotency — Integration. The one bug that must never
 * ship. Test concurrent publish of the same item."
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sealToken } from '../../../packages/core/src/crypto/tokenCrypto.js';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';
import { Poller, withTimeout, type HandlerContext, type Job } from './poller.js';
import { DuplicatePublishAbort, PublishingDisabled, publishHandler } from './handlers/publish.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let ids: { productId: string; accountId: string };
const KEY = randomBytes(32).toString('base64');

beforeAll(async () => {
  if (!available) return;
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  pool = await createIsolatedPool('worker', 10);

  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  const account = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state, access_token_enc)
     values ('recipefix','x','brand','@recipefix','live', $1) returning id`,
    [sealToken('platform-access-token', Buffer.from(KEY, 'base64'))],
  );
  ids = { productId: 'recipefix', accountId: account.rows[0]!.id };
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from publications');
  await pool.query('delete from notifications');
  await pool.query('delete from audit_log');
  await pool.query('delete from content_items');
  await pool.query('delete from jobs');
  await pool.query('update settings set publishing_enabled = true');
});

async function makeItem(over: Record<string, unknown> = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                body, status, ai_components, disclosure_text)
     values ('recipefix', $1, 'x', 'brand', 'text', 'education', $2, $3, $4, $5)
     returning id`,
    [
      ids.accountId,
      String(over.body ?? 'Your gluten-free loaf is gummy. Vinegar firms the crumb.'),
      String(over.status ?? 'approved'),
      (over.ai_components as string[]) ?? [],
      (over.disclosure_text as string | null) ?? null,
    ],
  );
  return rows[0]!.id;
}

function context(): HandlerContext {
  return {
    pool,
    workerId: 'test-worker',
    log: () => undefined,
    enqueue: async (kind, payload, options) => {
      await pool.query(
        `insert into jobs (kind, payload, run_after, dedupe_key) values ($1,$2,coalesce($3,now()),$4)
         on conflict do nothing`,
        [kind, payload, options?.runAfter ?? null, options?.dedupeKey ?? null],
      );
    },
  };
}

function job(contentItemId: string, attempts = 1): Job {
  return {
    id: randomBytes(16).toString('hex'),
    kind: 'publish',
    payload: { contentItemId, accountMeta: { fetchImpl: currentFetch } },
    attempts,
    max_attempts: 3,
    dedupe_key: null,
  };
}

let currentFetch: typeof fetch;
let postCount = 0;

function okFetch(): typeof fetch {
  postCount = 0;
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') postCount++;
    return new Response(JSON.stringify({ data: { id: `tweet-${postCount}` } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

d('publish idempotency — the bug that must never ship', () => {
  it('publishes once and records the publication', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();
    await publishHandler(job(itemId), context());

    const { rows } = await pool.query<{ platform_post_id: string; publish_mode: string }>(
      'select platform_post_id, publish_mode from publications where content_item_id = $1',
      [itemId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.platform_post_id).toBe('tweet-1');
    expect(postCount).toBe(1);

    const item = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [itemId],
    );
    expect(item.rows[0]?.status).toBe('published');
  });

  it('aborts a second publish of the same item and makes no API call', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();
    await publishHandler(job(itemId), context());
    const callsAfterFirst = postCount;

    await pool.query(`update content_items set status = 'approved' where id = $1`, [itemId]);
    await expect(publishHandler(job(itemId), context())).rejects.toBeInstanceOf(
      DuplicatePublishAbort,
    );
    expect(postCount).toBe(callsAfterFirst);
  });

  it('two concurrent workers publish exactly once between them', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();

    // The invariant is not "two callers get an error" — a caller that arrives
    // after the first finished correctly sees a published item and skips. The
    // invariant is that the platform sees exactly one post and the database
    // holds exactly one publication row.
    const results = await Promise.allSettled([
      publishHandler(job(itemId), context()),
      publishHandler(job(itemId), context()),
      publishHandler(job(itemId), context()),
    ]);

    expect(postCount).toBe(1);

    const { rows } = await pool.query('select * from publications where content_item_id = $1', [
      itemId,
    ]);
    expect(rows).toHaveLength(1);

    // Anything that did fail must have failed for the right reason.
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(DuplicatePublishAbort);
      }
    }
  });

  it('serialises a genuine race on the claim row', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();

    // Force all three past the pre-flight read before any of them inserts, so
    // the unique index is the only thing standing between them and a double
    // post.
    const gate = new Promise<void>((resolve) => setTimeout(resolve, 10));
    const attempt = async () => {
      await gate;
      return publishHandler(job(itemId), context());
    };

    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(postCount).toBe(1);
    expect(results.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1);
  });

  it('writes a duplicate-publish abort to the audit log and raises an alert', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();
    await publishHandler(job(itemId), context());
    await pool.query(`update content_items set status = 'approved' where id = $1`, [itemId]);
    await publishHandler(job(itemId), context()).catch(() => undefined);

    const audit = await pool.query<{ action: string }>(
      `select action from audit_log where action = 'duplicate_publish_abort'`,
    );
    expect(audit.rows.length).toBeGreaterThan(0);

    const alerts = await pool.query<{ severity: string }>(
      `select severity from notifications where kind = 'duplicate_publish_abort'`,
    );
    expect(alerts.rows[0]?.severity).toBe('critical');
  });
});

d('the kill switch — v1 §10', () => {
  it('refuses to publish anything when publishing_enabled is false', async () => {
    currentFetch = okFetch();
    await pool.query(
      `update settings set publishing_enabled = false, publishing_disabled_reason = 'launch day pause'`,
    );
    const itemId = await makeItem();

    await expect(publishHandler(job(itemId), context())).rejects.toBeInstanceOf(PublishingDisabled);
    expect(postCount).toBe(0);
    const { rows } = await pool.query('select * from publications');
    expect(rows).toHaveLength(0);
  });

  it('names the reason so the operator knows why', async () => {
    await pool.query(
      `update settings set publishing_enabled = false, publishing_disabled_reason = 'launch day pause'`,
    );
    const itemId = await makeItem();
    await expect(publishHandler(job(itemId), context())).rejects.toThrow(/launch day pause/);
  });
});

d('compliance is a code path — v2 C.3', () => {
  it('refuses to publish AI voiceover with no disclosure in the caption', async () => {
    currentFetch = okFetch();
    // Insert as draft, because the schema constraint blocks approving it at all.
    const itemId = await makeItem({ status: 'draft', ai_components: ['voiceover'] });
    await pool.query(
      `update content_items set status = 'approved', disclosure_text = '#AIvoiceover' where id = $1`,
      [itemId],
    );

    await expect(publishHandler(job(itemId), context())).rejects.toThrow(/Refusing to publish/);
    expect(postCount).toBe(0);
  });

  it('publishes once the caption carries the disclosure', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem({
      status: 'draft',
      ai_components: ['voiceover'],
      body: 'Gummy crumb, fixed. #AIvoiceover',
    });
    await pool.query(
      `update content_items set status = 'approved', disclosure_text = '#AIvoiceover' where id = $1`,
      [itemId],
    );
    await expect(publishHandler(job(itemId), context())).resolves.toBeUndefined();
  });
});

d('publish failure policy — build pack §3', () => {
  it('never retries an auth failure, marks the account, and pauses its queue', async () => {
    currentFetch = (async () =>
      new Response(JSON.stringify({ title: 'Unauthorized' }), { status: 401 })) as unknown as typeof fetch;

    const itemId = await makeItem();
    const otherId = await makeItem();

    await expect(publishHandler(job(itemId), context())).rejects.toThrow();

    const account = await pool.query<{ capability_state: string; last_error: string }>(
      'select capability_state, last_error from social_accounts where id = $1',
      [ids.accountId],
    );
    expect(account.rows[0]?.capability_state).toBe('error');

    const other = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [otherId],
    );
    expect(other.rows[0]?.status).toBe('failed');

    // The claim row is released, because nothing was posted.
    const publications = await pool.query('select * from publications');
    expect(publications.rows).toHaveLength(0);

    await pool.query(`update social_accounts set capability_state = 'live' where id = $1`, [
      ids.accountId,
    ]);
  });

  it('keeps the publication row and flags reconciliation on a malformed response', async () => {
    currentFetch = (async () =>
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const itemId = await makeItem();
    await publishHandler(job(itemId), context());

    const { rows } = await pool.query<{ needs_reconciliation: boolean; platform_post_id: string | null }>(
      'select needs_reconciliation, platform_post_id from publications where content_item_id = $1',
      [itemId],
    );
    expect(rows[0]?.needs_reconciliation).toBe(true);
    expect(rows[0]?.platform_post_id).toBeNull();
  });

  it('retries a transient failure and leaves the item approved', async () => {
    currentFetch = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const itemId = await makeItem();

    await expect(publishHandler(job(itemId), context())).rejects.toThrow();

    const item = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [itemId],
    );
    expect(item.rows[0]?.status).toBe('approved');
    expect((await pool.query('select * from publications')).rows).toHaveLength(0);
  });
});

d('follow-on work', () => {
  it('schedules metrics and comment polling after a successful publish', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();
    await publishHandler(job(itemId), context());

    const { rows } = await pool.query<{ kind: string }>('select kind from jobs order by kind');
    expect(rows.map((r) => r.kind)).toEqual(['collect_comments', 'collect_metrics']);
  });

  it('stamps a UTM link at publish time when the item has one', async () => {
    currentFetch = okFetch();
    const itemId = await makeItem();
    await pool.query(`update content_items set link_url = 'https://recipefix.app/adapt' where id = $1`, [
      itemId,
    ]);
    await publishHandler(job(itemId), context());

    const { rows } = await pool.query<{ final_link_url: string }>(
      'select final_link_url from content_items where id = $1',
      [itemId],
    );
    expect(rows[0]?.final_link_url).toContain(`utm_content=${itemId}`);
    expect(rows[0]?.final_link_url).toContain('utm_medium=social');
  });
});

d('Poller', () => {
  it('runs a handler and marks the job done', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: handler },
      log: () => undefined,
    });

    await poller.enqueue('render', { renderId: 'r1' });
    expect(await poller.tick()).toBe(true);
    expect(handler).toHaveBeenCalledOnce();

    const { rows } = await pool.query<{ status: string }>('select status from jobs');
    expect(rows[0]?.status).toBe('done');
  });

  it('returns false when there is nothing to do', async () => {
    const poller = new Poller({ pool, workerId: 'w1', handlers: {}, log: () => undefined });
    expect(await poller.tick()).toBe(false);
  });

  it('retries a failed job with backoff, then marks it dead', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: handler },
      log: () => undefined,
    });

    await poller.enqueue('render', {}, { maxAttempts: 2 });
    await poller.tick();

    let state = await pool.query<{ status: string; last_error: string; run_after: string }>(
      'select status, last_error, run_after from jobs',
    );
    expect(state.rows[0]?.status).toBe('queued');
    expect(state.rows[0]?.last_error).toBe('boom');
    expect(new Date(state.rows[0]!.run_after).getTime()).toBeGreaterThan(Date.now());

    await pool.query('update jobs set run_after = now()');
    await poller.tick();

    state = await pool.query('select status from jobs');
    expect(state.rows[0]?.status).toBe('dead');
  });

  it('puts back a job it cannot handle rather than failing it', async () => {
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: async () => undefined },
      log: () => undefined,
    });
    await pool.query(`insert into jobs (kind) values ('publish')`);
    await poller.tick();
    const { rows } = await pool.query<{ status: string; kind: string }>('select status, kind from jobs');
    expect(rows.find((r) => r.kind === 'publish')?.status).toBe('queued');
  });

  it('writes a heartbeat, because a missing one is the only way to spot a dead worker', async () => {
    const poller = new Poller({ pool, workerId: 'hb-worker', handlers: {}, log: () => undefined });
    await poller.heartbeat();
    const { rows } = await pool.query<{ worker_id: string }>(
      `select worker_id from worker_heartbeats where worker_id = 'hb-worker'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('reaps a stale lock', async () => {
    await pool.query(
      `insert into jobs (kind, status, locked_at, locked_by) values ('render','running', now() - interval '1 hour','dead')`,
    );
    const poller = new Poller({ pool, workerId: 'w1', handlers: {}, log: () => undefined });
    expect(await poller.reap()).toBe(1);
  });

  it('enforces a timeout rather than hanging forever', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 30, 'too slow'),
    ).rejects.toThrow('too slow');
  });
});
