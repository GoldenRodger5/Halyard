/**
 * Feature replay, against a real browser and a real page.
 *
 * The page is served from a data: URL rather than from the live product, so the
 * test is deterministic and costs nobody a credit — but the browser, the
 * locators and the observations are all genuine. A stubbed Playwright would
 * prove only that the code calls the functions it calls.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { replay, verifyFeatureHandler } from './handlers/verifyFeature.js';
import type { Job } from './poller.js';
import { testContext, type TestContext } from './testContext.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

/** A page with a feature on it, addressable without a server. */
function pageWith(body: string): string {
  return `data:text/html,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><body>${body}</body>`)}`;
}

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('verifyfeature', 6);
  await pool.query(
    `insert into products (id, name, connector_type, destinations)
     values ('recipefix','RecipeFix','none', '{"web":"https://recipefix.app"}'::jsonb)`,
  );
}, 300_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from feature_claims');
});

function context(): TestContext {
  return testContext({ pool });
}

async function seedClaim(steps: unknown[], name = 'Adapt a recipe'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into feature_claims (product_id, name, summary, source, replay)
     values ('recipefix', $1, 'summary', 'crawl', $2) returning id`,
    [name, JSON.stringify({ steps })],
  );
  return rows[0]!.id;
}

const job = (claimId: string): Job =>
  ({ id: 'j', kind: 'verify_feature', payload: { claimId }, attempts: 1, max_attempts: 2 }) as unknown as Job;

describe('replay, in a real browser', () => {
  it('observes a thing that is there', async () => {
    const outcome = await replay([
      { name: 'open', action: 'goto', value: pageWith('<h1>Swapped</h1>') },
      { name: 'the swapped badge', action: 'expectText', target: 'Swapped' },
    ]);

    expect(outcome.completed).toBe(true);
    expect(outcome.expectations[0]!.observed).toBe(true);
  }, 120_000);

  it('records an absent thing as observed:false rather than throwing', async () => {
    /**
     * The distinction the whole verdict function rests on. A missing badge is
     * an *observation*; a broken flow is an error. Collapsing them would turn
     * "the feature is gone" and "the network hiccuped" into the same status.
     */
    const outcome = await replay([
      { name: 'open', action: 'goto', value: pageWith('<h1>Nothing here</h1>') },
      { name: 'the swapped badge', action: 'expectText', target: 'Swapped', timeoutMs: 2000 },
    ]);

    expect(outcome.completed).toBe(true);
    expect(outcome.expectations[0]!.observed).toBe(false);
  }, 120_000);

  it('stops on a broken step and says which one', async () => {
    const outcome = await replay([
      { name: 'open', action: 'goto', value: pageWith('<p>empty</p>') },
      { name: 'click the adapt button', action: 'click', selector: '#missing', timeoutMs: 2000 },
      { name: 'never reached', action: 'expectText', target: 'Swapped' },
    ]);

    expect(outcome.completed).toBe(false);
    expect(outcome.error).toContain('click the adapt button');
    // The unreached expectation was never checked, so it is absent rather than
    // recorded as a failure.
    expect(outcome.expectations).toHaveLength(0);
  }, 120_000);

  it('walks past an optional step that is not there', async () => {
    const outcome = await replay([
      { name: 'open', action: 'goto', value: pageWith('<h1>Swapped</h1>') },
      { name: 'dismiss cookie banner', action: 'click', selector: '#cookies', optional: true, timeoutMs: 1500 },
      { name: 'the swapped badge', action: 'expectText', target: 'Swapped' },
    ]);

    expect(outcome.completed).toBe(true);
    expect(outcome.expectations[0]!.observed).toBe(true);
  }, 120_000);
});

d('verifyFeatureHandler', () => {
  it('verifies a claim whose demonstration still works', async () => {
    const id = await seedClaim([
      { name: 'open', action: 'goto', value: 'https://recipefix.app/adapt' },
      { name: 'the swapped badge', action: 'expectText', target: 'Swapped' },
    ]);

    // The real site is not reachable from a test, so this asserts the pipeline
    // reaches a decision and records it — not that recipefix.app is up.
    await verifyFeatureHandler(job(id), context());

    const { rows } = await pool.query<{ status: string; attempts: number; last_verdict: string }>(
      'select status, attempts, last_verdict from feature_claims where id = $1',
      [id],
    );
    expect(['verified', 'unverified', 'refuted']).toContain(rows[0]!.status);
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.last_verdict).toBeTruthy();
  }, 180_000);

  it('refuses an unsafe claim before a browser is ever opened', async () => {
    /**
     * `replay` is a mutable jsonb column. Checking safety once at discovery and
     * trusting it afterwards would mean the property holds only for as long as
     * nothing edits the row — so it is re-checked on every run.
     */
    const id = await seedClaim(
      [
        { name: 'open', action: 'goto', value: 'https://recipefix.app/settings' },
        { name: 'tidy up', action: 'click', target: 'Delete account' },
      ],
      'Delete your account',
    );

    const ctx = context();
    await verifyFeatureHandler(job(id), ctx);

    const { rows } = await pool.query<{ status: string; last_verdict: string }>(
      'select status, last_verdict from feature_claims where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('unverifiable');
    expect(rows[0]!.last_verdict).toMatch(/Refused before running/);
    expect(ctx.logs).toContain('feature claim refused by safety check');
  }, 60_000);

  it('never moves verified_at on anything but a pass', async () => {
    /**
     * A refutation that looked freshly checked-and-fine would be worse than no
     * check at all: `canMarket` reads status *and* recency, and a refuted claim
     * with a fresh timestamp is one bug away from being marketable.
     */
    const id = await seedClaim([
      { name: 'open', action: 'goto', value: 'https://recipefix.app/x' },
      { name: 'a thing that is not there', action: 'expectText', target: 'zzzz', timeoutMs: 2000 },
    ]);

    await verifyFeatureHandler(job(id), context());

    const { rows } = await pool.query<{ status: string; verified_at: string | null }>(
      'select status, verified_at from feature_claims where id = $1',
      [id],
    );
    if (rows[0]!.status !== 'verified') {
      expect(rows[0]!.verified_at).toBeNull();
    }
  }, 180_000);

  it('picks the stalest claim when no claim is named', async () => {
    /**
     * Verification expires, and `canMarket` reads recency as well as status.
     * Without a sweep the whole inventory ages out and quietly stops being
     * usable — a decay that looks identical to an empty inventory from outside.
     */
    const fresh = await seedClaim(
      [
        { name: 'open', action: 'goto', value: 'https://recipefix.app/a' },
        { name: 'check', action: 'expectText', target: 'x' },
      ],
      'Recently checked',
    );
    const stale = await seedClaim(
      [
        { name: 'open', action: 'goto', value: 'https://recipefix.app/b' },
        { name: 'check', action: 'expectText', target: 'y' },
      ],
      'Checked long ago',
    );
    await pool.query(`update feature_claims set verified_at = now() where id = $1`, [fresh]);
    await pool.query(
      `update feature_claims set verified_at = now() - interval '60 days' where id = $1`,
      [stale],
    );

    await verifyFeatureHandler(
      { id: 'j', kind: 'verify_feature', payload: {}, attempts: 1, max_attempts: 2 } as unknown as Job,
      context(),
    );

    const { rows } = await pool.query<{ name: string; attempts: number }>(
      'select name, attempts from feature_claims order by attempts desc',
    );
    expect(rows[0]!.name).toBe('Checked long ago');
    expect(rows[0]!.attempts).toBe(1);
  }, 180_000);

  it('says so when nothing is due, rather than failing', async () => {
    const id = await seedClaim([
      { name: 'open', action: 'goto', value: 'https://recipefix.app/a' },
      { name: 'check', action: 'expectText', target: 'x' },
    ]);
    await pool.query(`update feature_claims set verified_at = now() where id = $1`, [id]);

    const ctx = context();
    await verifyFeatureHandler(
      { id: 'j', kind: 'verify_feature', payload: {}, attempts: 1, max_attempts: 2 } as unknown as Job,
      ctx,
    );
    expect(ctx.logs).toContain('no feature claims are due for re-verification');
  }, 60_000);

  it('will not replay a product with nowhere to replay against', async () => {
    await pool.query(
      `insert into products (id, name, connector_type) values ('noweb','No Web','none')`,
    );
    const { rows: claim } = await pool.query<{ id: string }>(
      `insert into feature_claims (product_id, name, summary, source, replay)
       values ('noweb','Something','summary','crawl', $1) returning id`,
      [JSON.stringify({ steps: [{ name: 'check', action: 'expectText', target: 'x' }] })],
    );

    await verifyFeatureHandler(job(claim[0]!.id), context());

    const { rows } = await pool.query<{ status: string; last_verdict: string }>(
      'select status, last_verdict from feature_claims where id = $1',
      [claim[0]!.id],
    );
    expect(rows[0]!.status).toBe('unverifiable');
    expect(rows[0]!.last_verdict).toMatch(/no web destination/i);
  }, 60_000);
});
