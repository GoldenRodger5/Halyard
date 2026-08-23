/**
 * Worker integration tests against a real Postgres.
 *
 * Build pack §6: "Publish idempotency — Integration. The one bug that must never
 * ship. Test concurrent publish of the same item."
 */
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sealToken } from '../../../packages/core/src/crypto/tokenCrypto.js';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';
import {
  PermanentJobFailure,
  Poller,
  withTimeout,
  type HandlerContext,
  type Job,
} from './poller.js';
import { DuplicatePublishAbort, PublishingDisabled, notify, publishHandler } from './handlers/publish.js';

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

d('accounts with no API path', () => {
  it('hands a draft_only account to manual publish rather than failing at the adapter', async () => {
    /**
     * `draft_only` and `awaiting_manual_publish` were designed together — the
     * capability state, the item state, the schema constraints and the
     * architecture doc all describe this path — and **neither end was ever
     * built**. The handler refused only `disabled` and `error`, so a
     * `draft_only` account fell straight through to the adapter and failed
     * there, which reads as a broken integration rather than as a post waiting
     * for a person.
     *
     * Any account whose platform review has not landed sits in this state.
     * (Facebook cannot even be represented — it is not in the platform check
     * constraint, so it is not a supported platform here at all.)
     */
    const account = await pool.query<{ id: string }>(
      `insert into social_accounts (product_id, platform, persona, handle, capability_state)
       values ('recipefix','instagram','brand','@recipe.fix','draft_only') returning id`,
    );
    const itemId = await makeItem();
    await pool.query('update content_items set account_id = $2, platform = $1 where id = $3', [
      'instagram',
      account.rows[0]!.id,
      itemId,
    ]);

    // No fetch stub: reaching the network at all would be the bug.
    currentFetch = (() => {
      throw new Error('the adapter must not be called for a draft_only account');
    }) as unknown as typeof fetch;

    await publishHandler(job(itemId), context());

    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [itemId],
    );
    expect(rows[0]!.status).toBe('awaiting_manual_publish');

    // Nothing was published, so nothing claims to have been.
    const { rows: pubs } = await pool.query('select 1 from publications where content_item_id = $1', [
      itemId,
    ]);
    expect(pubs).toHaveLength(0);

    // And it is recorded as a decision rather than inferred from the state.
    const { rows: audit } = await pool.query<{ action: string }>(
      `select action from audit_log where entity_id = $1 and action = 'handed_to_manual_publish'`,
      [itemId],
    );
    expect(audit).toHaveLength(1);

    // The item still points at this account, and `content_items_account_routing_fk`
    // is NO ACTION, so the account cannot go first. This cleanup dropped the
    // suite with a foreign-key violation once during the activation pass.
    await pool.query('delete from content_items where id = $1', [itemId]);
    await pool.query('delete from social_accounts where id = $1', [account.rows[0]!.id]);
  }, 60_000);
});

/**
 * §153. The last gate before the outside world.
 *
 * §111 made generation refuse to build a link from an unset
 * `HALYARD_PUBLIC_URL`. An item drafted before that, or on a developer's
 * machine, still carries `http://localhost:3200/r/…` — and nothing between the
 * row and the platform looked at it again. On X the link also buys a second
 * billed post to carry it.
 */
d('a link nobody can open', () => {
  it('refuses to publish an item carrying a local link', async () => {
    const itemId = await makeItem();
    await pool.query(
      `update content_items set status = 'approved', link_url = $2 where id = $1`,
      [itemId, 'http://localhost:3200/r/abc'],
    );

    currentFetch = (() => {
      throw new Error('the adapter must not be reached with an unpublishable link');
    }) as unknown as typeof fetch;

    await expect(publishHandler(job(itemId), context())).rejects.toThrow(/not publicly reachable/);

    const { rows } = await pool.query('select 1 from publications where content_item_id = $1', [
      itemId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('publishes the same item once the link is cleared', async () => {
    // Dropping the link changes what goes out, so it is the operator's call —
    // the handler refuses, it does not decide.
    const itemId = await makeItem();
    await pool.query(
      `update content_items set status = 'approved', link_url = null where id = $1`,
      [itemId],
    );
    currentFetch = okFetch();

    await expect(publishHandler(job(itemId), context())).resolves.toBeUndefined();
  });
});

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

  /**
   * The container healthcheck reads this file's mtime. It used to run
   * `node -e "process.exit(0)"` and report healthy on a wedged worker.
   */
  it('leaves a liveness file the container healthcheck can read', async () => {
    const path = join(tmpdir(), `halyard-liveness-${process.pid}`);
    const previous = process.env.HALYARD_LIVENESS_FILE;
    process.env.HALYARD_LIVENESS_FILE = path;
    try {
      const poller = new Poller({ pool, workerId: 'live-worker', handlers: {}, log: () => undefined });
      await poller.heartbeat();
      expect(readFileSync(path, 'utf8')).toContain('live-worker');
    } finally {
      process.env.HALYARD_LIVENESS_FILE = previous;
      rmSync(path, { force: true });
    }
  });

  it('touches no disk when the healthcheck path is not configured', async () => {
    // Local runs and tests must not litter; the Dockerfile sets the variable.
    const previous = process.env.HALYARD_LIVENESS_FILE;
    delete process.env.HALYARD_LIVENESS_FILE;
    try {
      const poller = new Poller({ pool, workerId: 'nofile-worker', handlers: {}, log: () => undefined });
      await expect(poller.heartbeat()).resolves.toBeUndefined();
    } finally {
      if (previous !== undefined) process.env.HALYARD_LIVENESS_FILE = previous;
    }
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

/**
 * A failure that retrying cannot fix.
 *
 * `publishFailurePolicy` has always decided this — `retry: false` for an auth
 * failure, a duplicate abort, and a malformed response whose own note reads
 * "never retried — that double-posts". `publish.ts` read the policy, acted on it
 * for the item and the account, then threw a plain `Error`, and the poller
 * retried the job anyway because `fail()` had no way to hear it. The idempotency
 * index was the only thing standing between a malformed response and the second
 * write its policy warns about.
 */
d('a permanent failure is not retried', () => {
  it('dead-letters on the first attempt instead of burning the allowance', async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new PermanentJobFailure('no credential', 'nothing to retry with'));
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: handler },
      log: () => undefined,
    });

    await poller.enqueue('render', {}, { maxAttempts: 3 });
    await poller.tick();

    const { rows } = await pool.query<{ status: string; last_error: string; finished_at: string }>(
      'select status, last_error, finished_at from jobs',
    );
    expect(rows[0]!.status).toBe('dead');
    expect(rows[0]!.last_error).toBe('no credential');
    // Terminal, so it carries a finish time like any other completed job.
    expect(rows[0]!.finished_at).not.toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('still retries an ordinary failure, which is the point of the distinction', async () => {
    // The guard against over-applying this: a flaky provider must keep its
    // retries. Only a handler that knows repetition cannot help may opt out.
    const handler = vi.fn().mockRejectedValue(new Error('transient'));
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: handler },
      log: () => undefined,
    });

    await poller.enqueue('render', {}, { maxAttempts: 3 });
    await poller.tick();

    const { rows } = await pool.query<{ status: string }>('select status from jobs');
    expect(rows[0]!.status).toBe('queued');
  });

  it('treats a duplicate publish abort as permanent', async () => {
    // It is permanent by construction: a second attempt re-reads the same
    // publication row and aborts identically.
    const abort = new DuplicatePublishAbort('item-1', 'account-1');
    expect(abort).toBeInstanceOf(PermanentJobFailure);
    // And still its own type, so existing catches keep working.
    expect(abort).toBeInstanceOf(DuplicatePublishAbort);
  });
});

/**
 * Error text reaching the database.
 *
 * `scrubEvent` has always guarded the path to Sentry, and nothing guarded the
 * path to Postgres. An error message is arbitrary text from whatever threw, and
 * the Instagram adapter carries its access token in the URL query string — so a
 * stack or cause quoting a URL puts a live credential into a row that the
 * operator UI renders and that is kept indefinitely.
 */
d('a credential cannot reach jobs.last_error', () => {
  const TOKEN = 'EAAGm0PX4ZCpsBO1234567890abcdefghijklmnopqrstuv';

  it('scrubs a token out of the stored failure message', async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(
        new Error(
          `Instagram GET failed https://graph.facebook.com/v21.0/me/permissions?access_token=${TOKEN}`,
        ),
      );
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: handler },
      log: () => undefined,
    });

    await poller.enqueue('render', {}, { maxAttempts: 1 });
    await poller.tick();

    const { rows } = await pool.query<{ last_error: string }>('select last_error from jobs');
    expect(rows[0]!.last_error).not.toContain(TOKEN);
    // The shape of the failure survives, so the row is still diagnostic.
    expect(rows[0]!.last_error).toContain('access_token=[redacted]');
    expect(rows[0]!.last_error).toContain('Instagram GET failed');
  });

  it('leaves an ordinary failure message intact', async () => {
    // Redaction that ate normal errors would cost more than it saved.
    const handler = vi.fn().mockRejectedValue(new Error('ffmpeg exited with code 1'));
    const poller = new Poller({
      pool,
      workerId: 'w1',
      handlers: { render: handler },
      log: () => undefined,
    });

    await poller.enqueue('render', {}, { maxAttempts: 1 });
    await poller.tick();

    const { rows } = await pool.query<{ last_error: string }>('select last_error from jobs');
    expect(rows[0]!.last_error).toBe('ffmpeg exited with code 1');
  });
});

/**
 * §122. Notifications were the fourth path to an error-text column and the only
 * one that was not scrubbed.
 */
d('notifications cannot carry a credential', () => {
  function ctx() {
    return { pool, log: () => undefined, enqueue: async () => undefined } as unknown as HandlerContext;
  }

  beforeEach(async () => {
    await pool.query('delete from notifications');
  });

  it('redacts a token that arrived in a query string', async () => {
    // Meta's Graph API takes the access token as a query parameter, so a failed
    // Instagram call produces exactly this shape of message.
    await notify(
      ctx(),
      'connector_down',
      'critical',
      'Instagram unreachable',
      'GET https://graph.facebook.com/v21.0/me?access_token=EAAGm0PXsecretvalue failed with 400',
    );

    const { rows } = await pool.query<{ body: string }>('select body from notifications');
    expect(rows[0]!.body).not.toContain('EAAGm0PXsecretvalue');
    // The parameter name survives, so a reader can still tell what was removed.
    expect(rows[0]!.body).toContain('access_token=[redacted]');
  });

  it('redacts the title as well, which is equally caller-supplied', async () => {
    await notify(ctx(), 'connector_down', 'warning', 'failed: ?client_secret=abc123def456', 'body');
    const { rows } = await pool.query<{ title: string }>('select title from notifications');
    expect(rows[0]!.title).not.toContain('abc123def456');
  });

  it('leaves an ordinary message untouched', async () => {
    // Over-redaction costs a debugging detail, so the scrub must be narrow.
    const body = 'Generation is paused for this product; the queue is unaffected.';
    await notify(ctx(), 'connector_down', 'info', 'Connector down', body);
    const { rows } = await pool.query<{ body: string }>('select body from notifications');
    expect(rows[0]!.body).toBe(body);
  });
});

/**
 * §155. A malformed payload is a permanent failure, not a database error.
 *
 * `String(undefined)` is `'undefined'`, which reached Postgres as a uuid and
 * came back as `invalid input syntax for type uuid: "undefined"` — and was then
 * retried, spending the whole budget rediscovering the same unfixable row.
 * Every sibling handler already guarded this.
 */
d('collect_metrics with nothing to collect from', () => {
  it('refuses a job with no publicationId, permanently', async () => {
    const { HANDLERS } = await import('./handlers/index.js');
    const { PermanentJobFailure } = await import('./poller.js');

    await expect(
      HANDLERS.collect_metrics!(
        { id: 'j', kind: 'collect_metrics', payload: {}, attempts: 1, max_attempts: 3 } as never,
        context(),
      ),
    ).rejects.toBeInstanceOf(PermanentJobFailure);
  });
});

/**
 * §156. Delivering to a platform is not publishing.
 *
 * A native draft is sitting in someone's TikTok inbox and a private upload is
 * on YouTube and not public. Recording either as a publication starts the
 * 90-day repost clock, stamps `published_at`, and points metrics collection at
 * something nobody can see.
 */
describe('what a delivery outcome means for Halyard', () => {
  it('publishes only on a direct post', async () => {
    const { statusAfterDelivery } = await import('./handlers/publish.js');
    expect(statusAfterDelivery('direct')).toEqual({ status: 'published', published: true });
  });

  it('does not publish a native draft', async () => {
    const { statusAfterDelivery } = await import('./handlers/publish.js');
    const out = statusAfterDelivery('draft');
    expect(out.published).toBe(false);
    expect(out.status).toBe('awaiting_manual_publish');
  });

  it('does not publish a private upload', async () => {
    const { statusAfterDelivery } = await import('./handlers/publish.js');
    const out = statusAfterDelivery('private');
    expect(out.published).toBe(false);
    expect(out.status).toBe('awaiting_manual_publish');
  });

  it('fails closed on a delivery mode it has not been taught', async () => {
    // The polarity that matters: a capability added later must not arrive as a
    // publication by default.
    const { statusAfterDelivery } = await import('./handlers/publish.js');
    expect(statusAfterDelivery('something_new' as never).published).toBe(false);
  });
});
