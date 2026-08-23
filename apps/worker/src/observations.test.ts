/**
 * Account-scoped capability observations, against a real Postgres.
 *
 * `read_comments` could not reach `verified` before this: nothing wrote an
 * observation an account could be the subject of, so the resolver could only
 * report what the adapter *declares*. These tests cover the writer that closes
 * that gap, and — more importantly — every way it could close it dishonestly.
 *
 * The assertions that matter most are the negative ones. A failed read must
 * never harden into "this account cannot read comments", one account's success
 * must never vouch for another's, and a background poll running fifteen times a
 * day must not bury a genuine change under identical rows.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PublishError,
  getAdapter,
  resolveCapability,
  sealToken,
  type CapabilityObservation,
} from '@halyard/core';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { classifyObservationFailure, recordAccountObservation } from './observations.js';
import { HANDLERS } from './handlers/index.js';
import type { HandlerContext, Job } from './poller.js';

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;
let otherAccountId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('observations', 4);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  /**
   * Two brand accounts on different platforms rather than a brand and a
   * founder: the routing constraint requires a founder account to hang off the
   * personal product, and the point of the second account here is only that it
   * is a *different* account.
   */
  const seed = async (platform: string, handle: string): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into social_accounts
         (product_id, platform, persona, handle, capability_state, access_token_enc,
          token_expires_at, identity_confirmed_at)
       values ('recipefix',$1,'brand',$2,'draft_only',$3, now() + interval '30 days', now())
       returning id`,
      [platform, handle, sealToken('token')],
    );
    return rows[0]!.id;
  };
  accountId = await seed('instagram', '@obs-brand');
  otherAccountId = await seed('threads', '@obs-threads');
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from capability_probes');
  await pool.query('delete from comments');
  await pool.query('delete from publications');
  await pool.query(`delete from content_items where product_id = 'recipefix'`);
});

const logs: Array<{ message: string; detail?: Record<string, unknown> }> = [];
const enqueued: Array<{ kind: string; payload: Record<string, unknown> }> = [];

function ctx(): HandlerContext {
  return {
    pool,
    workerId: 'test',
    log: (message: string, detail?: Record<string, unknown>) => logs.push({ message, detail }),
    enqueue: async (kind: string, payload: Record<string, unknown>) => {
      enqueued.push({ kind, payload });
    },
  } as unknown as HandlerContext;
}

async function publication(postId: string): Promise<string> {
  const { rows: item } = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, status)
     values ('recipefix',$1,'instagram','brand','image','education','body','published') returning id`,
    [accountId],
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into publications
       (content_item_id, account_id, platform, publish_mode, platform_post_id, published_at)
     values ($1,$2,'instagram','direct',$3, now()) returning id`,
    [item[0]!.id, accountId, postId],
  );
  return rows[0]!.id;
}

interface ProbeRow {
  account_id: string | null;
  action: string;
  outcome: string;
  provider: string;
  platform: string;
  detail: string;
}

async function probes(): Promise<ProbeRow[]> {
  const { rows } = await pool.query<ProbeRow>(
    'select * from capability_probes order by started_at',
  );
  return rows;
}


/**
 * `listComments` is optional on `PlatformAdapter`, so the spy needs a concrete
 * shape. The adapter object itself is the same instance the handler resolves,
 * so patching it here patches what production calls.
 */
function spyOnComments() {
  const adapter = getAdapter('instagram') as unknown as {
    listComments: (...args: unknown[]) => Promise<unknown[]>;
  };
  return vi.spyOn(adapter, 'listComments');
}

// ─────────────────────────────────────────────────────────────────────────────

d('classifying a failed read', () => {
  it('never calls any failure a refutation', () => {
    /**
     * The whole reason this function exists. A deleted post, an expired token
     * and a rate limit all surface as a thrown error, and none of them proves
     * the account cannot read comments. Refutation is a strong claim and this
     * is not a probe designed to make it.
     */
    const failures: unknown[] = [
      new PublishError('auth', 'auth', 401),
      new PublishError('forbidden', 'auth', 403),
      new PublishError('slow down', 'rate_limit', 429),
      new PublishError('gone', 'permanent', 404),
      new PublishError('provider down', 'transient', 503),
      new Error('socket hang up'),
    ];
    for (const failure of failures) {
      expect(classifyObservationFailure(failure).outcome).not.toBe('refuted');
      expect(classifyObservationFailure(failure).outcome).not.toBe('confirmed');
    }
  });

  it('calls a refused credential unavailable rather than an error', () => {
    // Different words for the operator reading the probe list; identical, and
    // deliberately inert, to the resolver.
    const out = classifyObservationFailure(new PublishError('nope', 'auth', 401));
    expect(out.outcome).toBe('unavailable');
    expect(out.detail).toMatch(/says nothing about what the account is permitted/i);
  });
});

d('recording an observation', () => {
  it('writes it scoped to the account, action and transport', async () => {
    await recordAccountObservation(ctx(), {
      accountId,
      platform: 'instagram',
      action: 'read_comments',
      outcome: 'confirmed',
      detail: 'read it',
    });

    const [row] = await probes();
    expect(row!.account_id).toBe(accountId);
    expect(row!.action).toBe('read_comments');
    expect(row!.platform).toBe('instagram');
    // Not null: the same read through a unified provider is a different
    // observation and must not be confused with this one.
    expect(row!.provider).toBe('direct');
  });

  it('does not repeat an unchanged outcome within the interval', async () => {
    const input = {
      accountId,
      platform: 'instagram' as const,
      action: 'read_comments' as const,
      outcome: 'confirmed' as const,
      detail: 'read it',
    };
    expect(await recordAccountObservation(ctx(), input)).not.toBeNull();
    expect(await recordAccountObservation(ctx(), input)).toBeNull();
    expect(await probes()).toHaveLength(1);
  });

  it('records a changed outcome immediately', async () => {
    // The transition is the alert. Rate-limiting it to keep the table tidy
    // would trade the only thing worth having for the thing that does not.
    await recordAccountObservation(ctx(), {
      accountId,
      platform: 'instagram',
      action: 'read_comments',
      outcome: 'confirmed',
      detail: 'read it',
    });
    await recordAccountObservation(ctx(), {
      accountId,
      platform: 'instagram',
      action: 'read_comments',
      outcome: 'unavailable',
      detail: 'token refused',
    });
    expect(await probes()).toHaveLength(2);
  });

  it('keeps each account and action on its own clock', async () => {
    const base = { platform: 'instagram' as const, outcome: 'confirmed' as const, detail: 'x' };
    await recordAccountObservation(ctx(), { ...base, accountId, action: 'read_comments' });
    // A different account and a different action must both still record: the
    // rate limit is per subject, not global.
    await recordAccountObservation(ctx(), {
      ...base,
      platform: 'threads',
      accountId: otherAccountId,
      action: 'read_comments',
    });
    await recordAccountObservation(ctx(), { ...base, accountId, action: 'read_mentions' });
    expect(await probes()).toHaveLength(3);
  });

  it('is erased with its account rather than widening to the platform', async () => {
    /**
     * `on delete cascade`, not `set null`. A null account id means "about the
     * transport", so letting an account-scoped row fall back to null would
     * silently promote one account's confirmation into a platform-wide one.
     */
    await recordAccountObservation(ctx(), {
      accountId: otherAccountId,
      platform: 'threads',
      action: 'read_comments',
      outcome: 'confirmed',
      detail: 'read it',
    });
    await pool.query('delete from social_accounts where id = $1', [otherAccountId]);

    const rows = await probes();
    expect(rows).toHaveLength(0);

    // Restore for the remaining tests in this file.
    const { rows: again } = await pool.query<{ id: string }>(
      `insert into social_accounts
         (product_id, platform, persona, handle, capability_state, access_token_enc,
          token_expires_at, identity_confirmed_at)
       values ('recipefix','threads','brand','@obs-threads','draft_only',$1,
               now() + interval '30 days', now())
       returning id`,
      [sealToken('token')],
    );
    otherAccountId = again[0]!.id;
  });
});

d('the comment collector as a probe', () => {
  const job = (publicationId: string): Job =>
    ({ id: '00000000-0000-0000-0000-000000000001', kind: 'collect_comments', payload: { publicationId } }) as unknown as Job;

  beforeEach(() => {
    logs.length = 0;
    enqueued.length = 0;
  });

  it('records a confirmed read, which is the only route to a verified engagement read', async () => {
    const p = await publication('ig-post-1');
    const spy = spyOnComments().mockResolvedValue([
      {
        platformCommentId: 'c1',
        body: 'looks great',
        authorHandle: 'someone',
        postedAt: new Date(),
      },
    ]);

    await HANDLERS.collect_comments!(job(p), ctx());
    spy.mockRestore();

    const [row] = await probes();
    expect(row!.outcome).toBe('confirmed');
    expect(row!.account_id).toBe(accountId);
    expect(row!.detail).toMatch(/returned 1 comment/);

    // And the comment itself still landed — the probe is a byproduct, not a
    // replacement for the work the job exists to do.
    const { rows: comments } = await pool.query('select id from comments');
    expect(comments).toHaveLength(1);
  });

  it('treats an empty read as confirmation, because a missing permission is an error', async () => {
    const p = await publication('ig-post-2');
    const spy = spyOnComments().mockResolvedValue([]);

    await HANDLERS.collect_comments!(job(p), ctx());
    spy.mockRestore();

    const [row] = await probes();
    expect(row!.outcome).toBe('confirmed');
    expect(row!.detail).toMatch(/returned 0 comment/);
  });

  it('records a failed read as inert, and still fails the job', async () => {
    /**
     * Two things at once, and both matter. The observation must not claim a
     * refutation, and the job must still fail so its retry policy applies —
     * an observation that swallowed the error would turn a broken collector
     * into a silently successful one.
     */
    const p = await publication('ig-post-3');
    const spy = spyOnComments().mockRejectedValue(new PublishError('token expired', 'auth', 401));

    await expect(HANDLERS.collect_comments!(job(p), ctx())).rejects.toThrow(/token expired/);
    spy.mockRestore();

    const [row] = await probes();
    expect(row!.outcome).toBe('unavailable');
    expect(row!.account_id).toBe(accountId);
  });

  it('does not promote the capability on a failed read', async () => {
    // End to end: the observation the failure wrote, fed back through the
    // resolver, must leave the verdict exactly where it was.
    const p = await publication('ig-post-4');
    const spy = spyOnComments().mockRejectedValue(new PublishError('boom', 'transient', 503));
    await expect(HANDLERS.collect_comments!(job(p), ctx())).rejects.toThrow();
    spy.mockRestore();

    const [row] = await probes();
    const observation: CapabilityObservation = {
      platform: 'instagram',
      action: 'read_comments',
      accountId,
      outcome: row!.outcome as CapabilityObservation['outcome'],
      observedAt: new Date(),
    };
    const verdict = resolveCapability({
      platform: 'instagram',
      action: 'read_comments',
      accountState: 'draft_only',
      accountId,
      observation,
    });
    expect(verdict.verdict).not.toBe('verified');
    expect(verdict.verdict).not.toBe('unsupported');
  });

  it('a confirmed read makes the resolver say verified, with the account as provenance', async () => {
    const p = await publication('ig-post-5');
    const spy = spyOnComments().mockResolvedValue([]);
    await HANDLERS.collect_comments!(job(p), ctx());
    spy.mockRestore();

    const [row] = await probes();
    const verdict = resolveCapability({
      platform: 'instagram',
      action: 'read_comments',
      accountState: 'draft_only',
      accountId,
      observation: {
        platform: 'instagram',
        action: 'read_comments',
        accountId,
        outcome: row!.outcome as CapabilityObservation['outcome'],
        observedAt: new Date(),
        detail: row!.detail,
      },
    });
    expect(verdict.verdict).toBe('verified');
    expect(verdict.provenance.decidedBy).toBe('account');
    expect(verdict.provenance.accountId).toBe(accountId);
  });
});

/**
 * An erased credential, everywhere it is used.
 *
 * `loadAccount` used to return `accessToken: ''` when nothing was stored, and
 * an empty string is a value: the request was built, sent, and refused by the
 * platform with an empty bearer. Every one of these tests asserts the *absence*
 * of a network call, because the failure mode is a real API call — and its
 * retries — spent to discover something the row already said.
 *
 * The path is ordinary, not exotic: Disconnect erases the credential and leaves
 * the account row, so any publication with collection jobs still queued arrives
 * here the moment an operator uses it.
 */
d('a job against an account with no stored credential', () => {
  const job = (publicationId: string): Job =>
    ({
      id: '00000000-0000-0000-0000-000000000002',
      kind: 'collect_comments',
      payload: { publicationId },
    }) as unknown as Job;

  beforeEach(async () => {
    logs.length = 0;
    enqueued.length = 0;
    await pool.query('update social_accounts set access_token_enc = null where id = $1', [
      accountId,
    ]);
  });

  afterAll(async () => {
    if (!available) return;
    await pool.query('update social_accounts set access_token_enc = $2 where id = $1', [
      accountId,
      sealToken('token'),
    ]);
  });

  it('does not call the platform to collect comments', async () => {
    const p = await publication('ig-nocred-1');
    const spy = spyOnComments();

    await HANDLERS.collect_comments!(job(p), ctx());

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not reschedule itself against an account that cannot answer', async () => {
    // The decay schedule would otherwise re-enqueue this every few hours
    // forever. A missing credential is not transient.
    const p = await publication('ig-nocred-2');
    const spy = spyOnComments();
    await HANDLERS.collect_comments!(job(p), ctx());
    spy.mockRestore();

    expect(enqueued).toHaveLength(0);
  });

  it('records the silence as unavailable, never as a refutation', async () => {
    const p = await publication('ig-nocred-3');
    const spy = spyOnComments();
    await HANDLERS.collect_comments!(job(p), ctx());
    spy.mockRestore();

    const [row] = await probes();
    expect(row!.outcome).toBe('unavailable');
    expect(row!.detail).toMatch(/no read was attempted/i);
  });

  it('does not demote a capability that was verified before the credential went', async () => {
    /**
     * The most important assertion in this block. An erased credential explains
     * why a read stopped happening; it is not evidence the account was never
     * permitted to read. Turning one into the other is how a reconnect gets
     * followed by a capability that reads "not supported" forever.
     */
    const p = await publication('ig-nocred-4');
    const spy = spyOnComments();
    await HANDLERS.collect_comments!(job(p), ctx());
    spy.mockRestore();

    const [row] = await probes();
    const verdict = resolveCapability({
      platform: 'instagram',
      action: 'read_comments',
      accountState: 'draft_only',
      accountId,
      observation: {
        platform: 'instagram',
        action: 'read_comments',
        accountId,
        outcome: row!.outcome as CapabilityObservation['outcome'],
        observedAt: new Date(),
      },
    });
    expect(verdict.verdict).not.toBe('unsupported');
  });

  it('does not call the platform to collect metrics either', async () => {
    const p = await publication('ig-nocred-5');
    const spy = vi.spyOn(getAdapter('instagram'), 'collectMetrics');

    await HANDLERS.collect_metrics!(
      { id: '00000000-0000-0000-0000-000000000003', kind: 'collect_metrics', payload: { publicationId: p } } as unknown as Job,
      ctx(),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(0);
    spy.mockRestore();
  });
});
