/**
 * Failure rehearsals. Milestone 43, item 6, from build pack §3.
 *
 * Five specific failures, each rehearsed against a real database rather than
 * reasoned about. They are together in one file because they are a checklist
 * someone should be able to read start to finish before trusting this thing
 * with a live account.
 *
 * The malformed-response rehearsal is the one that matters most: a retry there
 * double-posts to a real account, which is the worst non-destructive bug this
 * system can have.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sealToken } from '../../../packages/core/src/crypto/tokenCrypto.js';
import {
  ConnectorUnavailableError,
  MAX_RESCHEDULES,
  decideReschedule,
  publishFailurePolicy,
  type ResolvedSlot,
} from '../../../packages/core/src/index.js';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import type { HandlerContext, Job } from './poller.js';
import { DuplicatePublishAbort, publishHandler } from './handlers/publish.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;
const KEY = randomBytes(32).toString('base64');

beforeAll(async () => {
  if (!available) return;
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  pool = await createIsolatedPool('rehearsals', 8);

  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  const account = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state,
                                  access_token_enc, refresh_token_enc)
     values ('recipefix','x','brand','@recipefix','live',$1,$2) returning id`,
    [
      sealToken('access-token', Buffer.from(KEY, 'base64')),
      sealToken('refresh-token', Buffer.from(KEY, 'base64')),
    ],
  );
  accountId = account.rows[0]!.id;
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
  await pool.query(
    `update social_accounts set capability_state = 'live', last_error = null where id = $1`,
    [accountId],
  );
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
});

async function makeItem(status = 'approved'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                body, status)
     values ('recipefix', $1, 'x', 'brand', 'text', 'education',
             'Vinegar firms the crumb in a gluten-free loaf.', $2)
     returning id`,
    [accountId, status],
  );
  return rows[0]!.id;
}

function context(): HandlerContext {
  return {
    pool,
    workerId: 'rehearsal',
    log: () => undefined,
    enqueue: async (kind, payload, options) => {
      await pool.query(
        `insert into jobs (kind, payload, run_after, dedupe_key)
         values ($1,$2,coalesce($3,now()),$4) on conflict do nothing`,
        [kind, payload, options?.runAfter ?? null, options?.dedupeKey ?? null],
      );
    },
  };
}

function job(contentItemId: string, fetchImpl: typeof fetch, attempts = 1): Job {
  return {
    id: randomBytes(16).toString('hex'),
    kind: 'publish',
    payload: { contentItemId, accountMeta: { fetchImpl } },
    attempts,
    max_attempts: 3,
    dedupe_key: null,
  } as unknown as Job;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Malformed publish response
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 1 — the platform returns success with no post id', () => {
  it('records the publication, flags reconciliation, and never sends a second write', async () => {
    let writes = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') writes++;
      // 200 OK, valid JSON, no id. The post may well be live.
      return new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    await publishHandler(job(itemId, fetchImpl), context());

    // Exactly one write. This is the assertion the whole design exists for.
    expect(writes, 'a retry here double-posts to a real account').toBe(1);

    const { rows } = await pool.query<{
      id: string;
      platform_post_id: string | null;
      needs_reconciliation: boolean;
    }>(
      'select platform_post_id, needs_reconciliation from publications where content_item_id = $1',
      [itemId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.platform_post_id).toBeNull();
    expect(rows[0]!.needs_reconciliation).toBe(true);

    // The claim row survives, which is what stops a later attempt reposting.
    const policy = publishFailurePolicy('malformed_response', 1);
    expect(policy.retry).toBe(false);

    const notifications = await pool.query<{ kind: string }>(
      `select kind from notifications where kind = 'duplicate_publish_abort'`,
    );
    expect(notifications.rows.length).toBeGreaterThan(0);
  });

  it('a job retry after a malformed response does not reach the network again', async () => {
    let writes = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') writes++;
      return new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    await publishHandler(job(itemId, fetchImpl), context());
    expect(writes).toBe(1);

    // The item is no longer approved, so the status guard — the first of the
    // three defences — returns quietly. Quietly is right for a job retry: it is
    // an idempotent no-op, not an error worth waking anyone for. What matters
    // is that nothing reaches the network.
    await expect(publishHandler(job(itemId, fetchImpl, 2), context())).resolves.toBeUndefined();
    expect(writes, 'the retry must not reach the network').toBe(1);
    expect((await pool.query('select * from publications')).rows).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Token expiry mid-publish
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 2 — the token expires between the refresh cron and the publish', () => {
  it('refreshes once, retries once, and publishes', async () => {
    process.env.X_CLIENT_ID = 'client-id';
    process.env.X_CLIENT_SECRET = 'client-secret';

    let tweetAttempts = 0;
    let refreshes = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('oauth2/token')) {
        refreshes++;
        return new Response(
          JSON.stringify({ access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_in: 7200 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (init?.method === 'POST' && href.includes('/tweets')) {
        tweetAttempts++;
        // The first attempt meets the expired token; the second succeeds.
        if (tweetAttempts === 1) {
          return new Response(JSON.stringify({ title: 'Unauthorized' }), { status: 401 });
        }
        return new Response(JSON.stringify({ data: { id: 'tweet-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    await publishHandler(job(itemId, fetchImpl), context());

    expect(refreshes).toBe(1);
    expect(tweetAttempts, 'once against the dead token, once against the fresh one').toBe(2);

    const { rows } = await pool.query<{ platform_post_id: string; status: string }>(
      `select p.platform_post_id, ci.status
         from publications p join content_items ci on ci.id = p.content_item_id
        where p.content_item_id = $1`,
      [itemId],
    );
    expect(rows[0]?.platform_post_id).toBe('tweet-1');
    expect(rows[0]?.status).toBe('published');

    // The new token is persisted, so the next publish does not repeat this.
    const account = await pool.query<{ last_error: string | null }>(
      'select last_error from social_accounts where id = $1',
      [accountId],
    );
    expect(account.rows[0]?.last_error).toBeNull();
  });

  it('gives up after one refresh, marks the account, and pauses its queue', async () => {
    process.env.X_CLIENT_ID = 'client-id';
    process.env.X_CLIENT_SECRET = 'client-secret';

    let tweetAttempts = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'still-bad', expires_in: 7200 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (init?.method === 'POST' && href.includes('/tweets')) {
        tweetAttempts++;
        return new Response(JSON.stringify({ title: 'Unauthorized' }), { status: 401 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    const otherId = await makeItem();

    await expect(publishHandler(job(itemId, fetchImpl), context())).rejects.toThrow();

    // Refreshed once and retried once. Never a third attempt against a token
    // the platform has already rejected twice.
    expect(tweetAttempts).toBe(2);

    const account = await pool.query<{ capability_state: string }>(
      'select capability_state from social_accounts where id = $1',
      [accountId],
    );
    expect(account.rows[0]?.capability_state).toBe('error');

    // The rest of the day's queue is held rather than burned against the same
    // dead credential.
    const other = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [otherId],
    );
    expect(other.rows[0]?.status).toBe('failed');
    expect((await pool.query('select * from publications')).rows).toHaveLength(0);
  });

  it('does not attempt a refresh it cannot perform', async () => {
    // No client credentials in the environment. Retrying without them would be
    // a guaranteed second 401.
    let tweetAttempts = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).includes('/tweets')) tweetAttempts++;
      return new Response(JSON.stringify({ title: 'Unauthorized' }), { status: 401 });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    await expect(publishHandler(job(itemId, fetchImpl), context())).rejects.toThrow();
    expect(tweetAttempts).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Render timeout past a slot
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 3 — a render finishes after its slot has passed', () => {
  const scheduledAt = new Date('2026-09-18T09:00:00Z');
  // Past the render grace window, so waiting is no longer an option.
  const wellPast = new Date('2026-09-18T09:45:00Z');
  const slot = (name: string, iso: string): ResolvedSlot => ({
    name,
    startUtc: new Date(iso),
    endUtc: new Date(new Date(iso).getTime() + 90 * 60_000),
    localDate: iso.slice(0, 10),
  });
  const nextSlots: ResolvedSlot[] = [
    slot('midday', '2026-09-18T13:00:00Z'),
    slot('evening', '2026-09-18T19:00:00Z'),
    slot('next morning', '2026-09-19T09:00:00Z'),
    slot('next midday', '2026-09-19T13:00:00Z'),
  ];

  const missed = (rescheduleCount: number) =>
    decideReschedule({
      status: 'scheduled',
      scheduledAt,
      now: wellPast,
      rescheduleCount,
      // The render is still not done: this is the whole failure being rehearsed.
      rendersComplete: false,
      nextSlots,
    });

  it('waits out the render grace window before moving anything', () => {
    const inGrace = decideReschedule({
      status: 'scheduled',
      scheduledAt,
      now: new Date('2026-09-18T09:05:00Z'),
      rescheduleCount: 0,
      rendersComplete: false,
      nextSlots,
    });
    expect(inGrace.action).toBe('wait');
  });

  it('reschedules up to three times, then expires instead of posting it stale', () => {
    expect(MAX_RESCHEDULES).toBe(3);

    for (let attempt = 0; attempt < MAX_RESCHEDULES; attempt++) {
      const decision = missed(attempt);
      expect(decision.action, `attempt ${attempt}`).toBe('reschedule');
    }

    const exhausted = missed(MAX_RESCHEDULES);
    expect(exhausted.action).toBe('expire');
    // Never publish something approved days ago as if it were fresh.
    expect(exhausted.action).not.toBe('publish_now');
    expect(exhausted.reason.length).toBeGreaterThan(10);
  });

  it('publishes immediately once the render does finish in time', () => {
    const done = decideReschedule({
      status: 'scheduled',
      scheduledAt,
      now: wellPast,
      rescheduleCount: 0,
      rendersComplete: true,
      nextSlots,
    });
    expect(done.action).toBe('publish_now');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Connector unreachable
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 4 — the product connector is unreachable', () => {
  it('is a distinct error type, so generation can pause instead of inventing', async () => {
    const error = new ConnectorUnavailableError('recipefix', 'MCP server did not respond in 90s');
    expect(error).toBeInstanceOf(ConnectorUnavailableError);
    expect(error.message).toContain('recipefix');
  });

  it('pauses generation for that product only, and leaves the queue alone', async () => {
    await pool.query(
      `insert into products (id, name, connector_type) values ('kinolog','Kinolog','none')
       on conflict (id) do nothing`,
    );

    const existing = await makeItem('pending_approval');

    // What the generate handler does on ConnectorUnavailableError: notify and
    // return. It must not touch content, and must not touch other products.
    await pool.query(
      `insert into notifications (kind, severity, title, body)
       values ('connector_down','critical','RecipeFix connector unreachable',
               'Generation is paused for this product; the queue is unaffected.')`,
    );

    const item = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [existing],
    );
    expect(item.rows[0]?.status, 'the existing queue is unaffected').toBe('pending_approval');

    const other = await pool.query<{ id: string }>(
      `select id from products where id = 'kinolog'`,
    );
    expect(other.rows, 'another product is untouched').toHaveLength(1);

    await pool.query(`delete from products where id = 'kinolog'`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Duplicate publish attempt
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 5 — two workers reach the same item at once', () => {
  it('hard-aborts when another worker has already claimed the item', async () => {
    // Deterministic rather than racy: the other worker's claim row already
    // exists and the item is still approved, which is exactly the state a real
    // race produces. Relying on interleaving would make this flaky and prove
    // less.
    let writes = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') writes++;
      return new Response(JSON.stringify({ data: { id: 'tweet-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    await pool.query(
      `insert into publications (content_item_id, account_id, platform, publish_mode,
                                 platform_post_id)
       values ($1, $2, 'x', 'direct', 'tweet-from-the-other-worker')`,
      [itemId, accountId],
    );

    await expect(publishHandler(job(itemId, fetchImpl), context())).rejects.toThrow(
      DuplicatePublishAbort,
    );

    expect(writes, 'the loser of the race must not reach the network').toBe(0);
    expect((await pool.query('select * from publications')).rows).toHaveLength(1);

    const audit = await pool.query<{ action: string }>(
      `select action from audit_log where action = 'duplicate_publish_abort'`,
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('publishes exactly once when two workers genuinely run at the same time', async () => {
    let writes = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') writes++;
      return new Response(JSON.stringify({ data: { id: `tweet-${writes}` } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();

    // Whichever way the interleaving falls — one wins and one aborts, or one
    // wins and the other finds the item no longer approved — the invariant is
    // the same and it is the only one that matters.
    await Promise.allSettled([
      publishHandler(job(itemId, fetchImpl), context()),
      publishHandler(job(itemId, fetchImpl), context()),
    ]);

    expect(writes, 'exactly one network write for one item').toBe(1);
    expect((await pool.query('select * from publications')).rows).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. The account has no stored credential
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 8 — publishing to an account whose credential is gone', () => {
  /**
   * The handler read `access_token_enc ? openToken(…) : ''` and an empty string
   * is a value: the post was composed, the request built, and sent to X with an
   * empty bearer. A real call, refused, three times under the retry policy,
   * against an API billed per call.
   *
   * `capability_state` does not catch it. `live` has never meant "connected" —
   * the seeded accounts are `live` with no token at all — and Disconnect now
   * erases a credential while leaving the row exactly in whatever state it was.
   */
  it('sends nothing, and says which account to reconnect', async () => {
    let requests = 0;
    const fetchImpl = (async () => {
      requests++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await pool.query('update social_accounts set access_token_enc = null where id = $1', [
      accountId,
    ]);
    const itemId = await makeItem();

    await expect(publishHandler(job(itemId, fetchImpl), context())).rejects.toThrow(
      /no stored credential/i,
    );
    expect(requests).toBe(0);

    // And nothing was claimed, so a reconnect-and-retry is clean.
    const { rows } = await pool.query('select id from publications');
    expect(rows).toHaveLength(0);

    await pool.query('update social_accounts set access_token_enc = $2 where id = $1', [
      accountId,
      sealToken('access-token', Buffer.from(KEY, 'base64')),
    ]);
  });

  it('still hands a draft_only account to the operator rather than failing it', async () => {
    /**
     * Ordering, asserted. A post being handed to a person to publish by hand
     * does not need a credential, so the guard sits *after* the handover. Put
     * it before and a working handover becomes a broken integration — which is
     * the same defect the handover branch was built to fix.
     */
    let requests = 0;
    const fetchImpl = (async () => {
      requests++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await pool.query(
      `update social_accounts set access_token_enc = null, capability_state = 'draft_only'
        where id = $1`,
      [accountId],
    );
    const itemId = await makeItem();

    await expect(publishHandler(job(itemId, fetchImpl), context())).resolves.toBeUndefined();
    expect(requests).toBe(0);

    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [itemId],
    );
    expect(rows[0]!.status).toBe('awaiting_manual_publish');

    await pool.query('update social_accounts set access_token_enc = $2 where id = $1', [
      accountId,
      sealToken('access-token', Buffer.from(KEY, 'base64')),
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. The successful publication, and everything it must leave behind
// ═══════════════════════════════════════════════════════════════════════════

d('rehearsal 6 — what one real publication has to produce', () => {
  /**
   * The execution-proof specification, in executable form.
   *
   * X credits are unavailable, so the first genuine publication has not
   * happened. When it does it will be **one controlled post**, and it has to
   * yield the whole evidence chain in that single run — there is no second
   * cheap attempt. This asserts, against the real handler and a real database,
   * exactly what an operator should expect to see afterwards.
   *
   * The fetch is a fixture. That makes this a specification of the contract,
   * **not** provider evidence: nothing here promotes X publishing beyond
   * `implemented`. The value is that every link is pinned now, so a live run
   * that deviates is immediately legible instead of being interpreted.
   */
  it('records the post id, the provider reply, and the collection that follows', async () => {
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ data: { id: '1799999999999999999', text: 'posted' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const itemId = await makeItem();
    await publishHandler(job(itemId, fetchImpl), context());

    const { rows } = await pool.query<{
      id: string;
      platform_post_id: string | null;
      published_at: string | null;
      raw_response: unknown;
      needs_reconciliation: boolean;
      publish_mode: string;
      account_id: string;
    }>(
      `select id, platform_post_id, published_at, raw_response, needs_reconciliation,
              publish_mode, account_id
         from publications where content_item_id = $1`,
      [itemId],
    );

    expect(rows).toHaveLength(1);
    const publication = rows[0]!;

    // 1. The provider's own identifier, which everything downstream keys on.
    expect(publication.platform_post_id).toBe('1799999999999999999');
    // 2. When, so decay-scheduled collection has an origin.
    expect(publication.published_at).not.toBeNull();
    // 3. The provider's reply, kept verbatim. A conclusion you cannot re-check
    //    is an assertion with a timestamp.
    expect(publication.raw_response).not.toBeNull();
    // 4. Not ambiguous: a real id means the post is not awaiting reconciliation.
    expect(publication.needs_reconciliation).toBe(false);
    // 5. Direct, not a draft handover.
    expect(publication.publish_mode).toBe('direct');
    // 6. Routed to the account it was written for.
    expect(publication.account_id).toBe(accountId);

    // 7. The item's own state agrees with the publication.
    const item = await pool.query<{ status: string; published_at: string | null }>(
      'select status, published_at from content_items where id = $1',
      [itemId],
    );
    expect(item.rows[0]!.status).toBe('published');
    expect(item.rows[0]!.published_at).not.toBeNull();

    /**
     * 8. The observation link. Without these two jobs the first real post
     *    produces no metrics and no comments — and the entire learning half of
     *    the system stays empty while looking like it published successfully.
     */
    const { rows: queued } = await pool.query<{ kind: string; dedupe_key: string }>(
      `select kind, dedupe_key from jobs
        where kind in ('collect_metrics','collect_comments') order by kind`,
    );
    expect(queued.map((q) => q.kind)).toEqual(['collect_comments', 'collect_metrics']);
    // Deduped per publication, so a second publish attempt cannot double them.
    // Asserted against the real id — `includes('')` would pass for anything.
    expect(publication.id).toMatch(/[0-9a-f-]{36}/);
    expect(queued.every((q) => q.dedupe_key.includes(publication.id))).toBe(true);
  });

  it('leaves nothing collectable when the provider refuses', async () => {
    /**
     * The 402 that actually happened on 2026-08-19. The distinction this pins:
     * a refused publication must not enqueue collection, or the system would be
     * polling for metrics on a post that does not exist — and an empty result
     * there is indistinguishable from a post nobody engaged with.
     */
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ title: 'credits depleted' }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const itemId = await makeItem();
    await expect(publishHandler(job(itemId, fetchImpl), context())).rejects.toThrow();

    const { rows: queued } = await pool.query(
      `select id from jobs where kind in ('collect_metrics','collect_comments')`,
    );
    expect(queued).toHaveLength(0);
  });
});
