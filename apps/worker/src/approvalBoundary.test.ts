/**
 * The approval boundary, attacked.
 *
 * Halyard's premise is that it is autonomous up to the point of publication and
 * never past it. Every individual gate below is tested somewhere already; what
 * is not tested anywhere is the **boundary as a whole** — whether some
 * combination of a valid token, a granted scope, a working adapter and a
 * model-generated item that passed QC can reach a provider without a human
 * having said yes.
 *
 * Every test here drives the real `publishHandler` against a real Postgres and
 * counts network calls. Nothing is reimplemented; a fetch that is never called
 * is the assertion.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sealToken } from '../../../packages/core/src/crypto/tokenCrypto.js';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { DuplicatePublishAbort, publishHandler } from './handlers/publish.js';
import { PermanentJobFailure, type HandlerContext, type Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;
let otherAccountId: string;
const KEY = randomBytes(32).toString('base64');

/** Counts every outbound request. A publish that happens is a failed test. */
let requests = 0;

function providerResponse(): Response {
  return new Response(JSON.stringify({ data: { id: 'should-not-exist' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const countingFetch = (async () => {
  requests += 1;
  return providerResponse();
}) as unknown as typeof fetch;

/**
 * A fetch that parks its caller inside the network call until released.
 *
 * The concurrency test needs one publish to be *provably* mid-flight while a
 * second arrives. Starting two handlers and hoping they interleave is not a
 * test, it is a coin flip — and it was: `publish` claims the publication row
 * before the network call, so whichever way the race lands the invariants hold,
 * but *which* duplicate guard fires depends on how far the winner got. Parking
 * the winner inside `fetch` — after it holds the claim, before it returns —
 * pins the window open and makes the outcome deterministic.
 */
function parkedFetch(): { impl: typeof fetch; entered: Promise<void>; release: () => void } {
  let markEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => (markEntered = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));

  const impl = (async () => {
    requests += 1;
    markEntered();
    await gate;
    return providerResponse();
  }) as unknown as typeof fetch;

  return { impl, entered, release };
}

beforeAll(async () => {
  if (!available) return;
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
  pool = await createIsolatedPool('approvalboundary', 6);

  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  await pool.query(
    `insert into products (id, name, connector_type, kind)
     values ('founder','Founder','none','personal') on conflict (id) do nothing`,
  );

  const sealed = sealToken('a-real-looking-token', Buffer.from(KEY, 'base64'));
  const brand = await pool.query<{ id: string }>(
    `insert into social_accounts
       (product_id, platform, persona, handle, capability_state, access_token_enc, identity_confirmed_at)
     values ('recipefix','x','brand','@brand','live',$1, now()) returning id`,
    [sealed],
  );
  accountId = brand.rows[0]!.id;

  const founder = await pool.query<{ id: string }>(
    `insert into social_accounts
       (product_id, platform, persona, handle, capability_state, access_token_enc, identity_confirmed_at)
     values ('founder','x','founder','@founder','live',$1, now()) returning id`,
    [sealed],
  );
  otherAccountId = founder.rows[0]!.id;
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  requests = 0;
  await pool.query('delete from publications');
  await pool.query('delete from content_items');
  await pool.query('delete from jobs');
  await pool.query('update settings set publishing_enabled = true');
  await pool.query(
    `update social_accounts set capability_state = 'live', last_error = null where id = $1`,
    [accountId],
  );
});

function context(): HandlerContext {
  return {
    pool,
    workerId: 'adversary',
    log: () => undefined,
    enqueue: async (kind: string, payload: Record<string, unknown>, options?: { dedupeKey?: string }) => {
      await pool.query(
        `insert into jobs (kind, payload, dedupe_key) values ($1,$2,$3) on conflict do nothing`,
        [kind, payload, options?.dedupeKey ?? null],
      );
    },
  } as unknown as HandlerContext;
}

function job(contentItemId: string, attempts = 1, fetchImpl: typeof fetch = countingFetch): Job {
  return {
    id: randomBytes(16).toString('hex'),
    kind: 'publish',
    payload: { contentItemId, accountMeta: { fetchImpl } },
    attempts,
    max_attempts: 3,
    dedupe_key: null,
  } as unknown as Job;
}

async function item(status: string, account = accountId, product = 'recipefix'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, body, status)
     values ($1, $2, 'x', $3, 'text', 'education', 'A body that passed every gate.', $4)
     returning id`,
    [product, account, product === 'founder' ? 'founder' : 'brand', status],
  );
  return rows[0]!.id;
}

const published = async (id: string): Promise<number> =>
  (await pool.query('select id from publications where content_item_id = $1', [id])).rows.length;

// ─────────────────────────────────────────────────────────────────────────────

d('nothing publishes without a human approval', () => {
  for (const status of ['draft', 'pending_approval', 'rejected', 'archived', 'expired']) {
    it(`refuses an item in '${status}'`, async () => {
      /**
       * A model-generated item can be perfectly valid — QC passed, token good,
       * scope granted, adapter working — and still must not reach a provider
       * until a person moves it to `approved`.
       */
      const id = await item(status);
      await publishHandler(job(id), context());

      expect(requests).toBe(0);
      expect(await published(id)).toBe(0);
    });
  }

  it('refuses an item whose approval was withdrawn by an edit', async () => {
    /**
     * The gap this suite found. `editItem` changed the body and left `status`
     * alone, so an approved item could be edited and the publish job already in
     * the queue would send text **nobody approved**. The edit now demotes to
     * `pending_approval`, which this asserts from the publisher's side: the
     * queued job becomes a no-op.
     */
    const id = await item('approved');
    await pool.query(`update content_items set status = 'pending_approval' where id = $1`, [id]);

    await publishHandler(job(id), context());
    expect(requests).toBe(0);
  });
});

d('account state outranks a valid credential', () => {
  for (const state of ['pending_auth', 'error', 'disabled']) {
    it(`refuses a '${state}' account even with a good token`, async () => {
      // Connected, sealed, identity-confirmed, scope granted — and still not
      // publishable. Authentication is not authorisation.
      await pool.query(`update social_accounts set capability_state = $2 where id = $1`, [
        accountId,
        state,
      ]);
      const id = await item('approved');

      await expect(publishHandler(job(id), context())).rejects.toThrow();
      expect(requests).toBe(0);
    });
  }

  it('hands a draft_only account to a person rather than publishing publicly', async () => {
    // `draft_only` is the platform's answer, not Halyard's. It must never
    // escalate to public posting on its own.
    await pool.query(`update social_accounts set capability_state = 'draft_only' where id = $1`, [
      accountId,
    ]);
    const id = await item('approved');
    await publishHandler(job(id), context());

    expect(requests).toBe(0);
    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('awaiting_manual_publish');
  });

  it('refuses after the account degrades between approval and execution', async () => {
    /**
     * Approval is a decision about a moment. The account can stop being usable
     * afterwards, and the queued job must re-check rather than trusting the
     * approval it was created from.
     */
    const id = await item('approved');
    await pool.query(`update social_accounts set capability_state = 'disabled' where id = $1`, [
      accountId,
    ]);

    await expect(publishHandler(job(id), context())).rejects.toThrow(/disabled/);
    expect(requests).toBe(0);
  });
});

d('the kill switch is authoritative', () => {
  it('blocks a publish queued before it was thrown', async () => {
    const id = await item('approved');
    await pool.query('update settings set publishing_enabled = false');

    await expect(publishHandler(job(id), context())).rejects.toThrow();
    expect(requests).toBe(0);
  });

  it('is checked before the account, so a paused system says why', async () => {
    // Ordering matters for the operator: "publishing is paused" is actionable,
    // "account disabled" sends them to the wrong screen.
    await pool.query(`update social_accounts set capability_state = 'disabled' where id = $1`, [
      accountId,
    ]);
    await pool.query('update settings set publishing_enabled = false');
    const id = await item('approved');

    await expect(publishHandler(job(id), context())).rejects.toThrow(/publish/i);
    expect(requests).toBe(0);
  });
});

d('routing cannot be redirected by anything in the payload', () => {
  it('ignores an account id supplied by the job payload', async () => {
    /**
     * The account comes from the content item, which the routing constraint
     * binds to a product. A payload naming another account must not move it —
     * this is the path a compromised or buggy generator would take.
     */
    const id = await item('approved');
    const rogue = {
      ...job(id),
      payload: {
        contentItemId: id,
        accountId: otherAccountId,
        account_id: otherAccountId,
        accountMeta: { fetchImpl: countingFetch },
      },
    } as unknown as Job;

    await publishHandler(rogue, context());

    const { rows } = await pool.query<{ account_id: string }>(
      'select account_id from publications where content_item_id = $1',
      [id],
    );
    expect(rows[0]!.account_id).toBe(accountId);
    expect(rows[0]!.account_id).not.toBe(otherAccountId);
  });

  it('refuses to write a brand item against the founder account at all', async () => {
    // The database constraint is the real defence; this proves it is armed.
    await expect(
      pool.query(
        `insert into content_items
           (product_id, account_id, platform, persona, format, category, body, status)
         values ('recipefix', $1, 'x', 'brand', 'text', 'education', 'cross', 'approved')`,
        [otherAccountId],
      ),
    ).rejects.toThrow(/routing|foreign key|violates/i);
  });
});

d('a permanent failure stays dead', () => {
  it('is not retried when the account has no credential', async () => {
    /**
     * §79 at the worker boundary rather than at the policy function. A missing
     * credential cannot be fixed by repetition, and the job must dead-letter on
     * the first attempt instead of burning its allowance.
     */
    await pool.query(`update social_accounts set access_token_enc = null where id = $1`, [
      accountId,
    ]);
    const id = await item('approved');

    await expect(publishHandler(job(id), context())).rejects.toBeInstanceOf(PermanentJobFailure);
    expect(requests).toBe(0);

    await pool.query(`update social_accounts set access_token_enc = $2 where id = $1`, [
      accountId,
      sealToken('a-real-looking-token', Buffer.from(KEY, 'base64')),
    ]);
  });
});

d('duplicate protection survives every route back in', () => {
  it('aborts a second attempt permanently rather than retrying it', async () => {
    const id = await item('approved');
    await publishHandler(job(id), context());
    expect(requests).toBe(1);

    /**
     * Re-enqueued by hand, by a worker restart, or by a stale queue row. The
     * item is `published` now, so the status guard returns before any account
     * lookup — quietly, which is correct: there is nothing wrong, the work is
     * simply done.
     */
    await expect(publishHandler(job(id, 2), context())).resolves.toBeUndefined();
    expect(requests).toBe(1);
    expect(await published(id)).toBe(1);
  });

  it('aborts permanently when the item is re-approved with a publication already recorded', async () => {
    /**
     * The genuine duplicate path, reached by forcing the state an operator
     * could create: a publication exists and the item is `approved` again. The
     * idempotency layer must abort, and abort **permanently** — a retry
     * re-reads the same row and aborts identically.
     */
    const id = await item('approved');
    await publishHandler(job(id), context());
    expect(requests).toBe(1);

    await pool.query(`update content_items set status = 'approved' where id = $1`, [id]);
    await expect(publishHandler(job(id), context())).rejects.toBeInstanceOf(PermanentJobFailure);

    expect(requests).toBe(1);
    expect(await published(id)).toBe(1);
  });

  it('keeps one publication per item and account under concurrency', async () => {
    /*
     * The window this exists for, held open deliberately.
     *
     * `publish` claims the publications row *before* the network call, so the
     * unique index — not timing — is what guarantees a single request. The
     * second attempt arrives while the first is parked inside `fetch`, holding
     * that claim: the guard is therefore exercised at the moment it matters
     * rather than whenever the two handlers happen to interleave.
     *
     * The earlier version asserted "exactly one of the two promises fulfilled",
     * which is a statement about *which* duplicate guard fired, and that
     * depends on how far the winner got before the loser looked. Both outcomes
     * are safe; only one was asserted, so the test failed whenever the machine
     * was fast enough for the winner to finish first.
     */
    const id = await item('approved');
    const parked = parkedFetch();

    const winner = publishHandler(job(id, 1, parked.impl), context());
    await parked.entered;

    // The competing transition, arriving mid-flight. It must be refused.
    await expect(publishHandler(job(id), context())).rejects.toBeInstanceOf(DuplicatePublishAbort);

    parked.release();
    await winner;

    // The invariants, which hold whichever guard fires.
    expect(requests).toBe(1);
    expect(await published(id)).toBe(1);
  });

  it('refuses a second attempt after the first has completely finished', async () => {
    /*
     * The other side of the same race, and the one the flaky assertion was
     * accidentally exercising. Once the winner has finished the item is no
     * longer publishable, so the second attempt stops at the approval guard
     * rather than at a duplicate guard. It must still make no request and
     * create no second publication.
     */
    const id = await item('approved');
    await publishHandler(job(id), context());
    expect(await published(id)).toBe(1);

    await publishHandler(job(id), context());

    expect(requests).toBe(1);
    expect(await published(id)).toBe(1);
  });
});
