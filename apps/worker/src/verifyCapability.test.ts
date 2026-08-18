/**
 * The capability probe, against a real Postgres.
 *
 * The behaviour that matters most is what happens when the probe *cannot* run.
 * A missing credential must record an observation and change no belief — if an
 * absent API key could write capabilities, it would be indistinguishable
 * downstream from a thorough probe that found a limited provider.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { verifyCapabilityHandler, type ProbeRunner } from './handlers/verifyCapability.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('capability', 4);
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from provider_capabilities');
  await pool.query('delete from capability_probes');
});

function context(): HandlerContext {
  return { pool, workerId: 'test', log: () => undefined, enqueue: async () => undefined } as unknown as HandlerContext;
}

const job = (id = '22222222-2222-2222-2222-222222222222'): Job =>
  ({ id, kind: 'verify_provider_capability', payload: { provider: 'blotato' } }) as unknown as Job;

const confirming: ProbeRunner = async ({ provider }) => ({
  outcome: 'confirmed',
  detail: 'Reached the provider.',
  observed: { platforms: ['x'] },
  capabilities: {
    provider,
    verifiedAt: new Date().toISOString(),
    platforms: {
      x: {
        platform: 'x',
        publish: 'yes',
        publishesPublicly: 'unknown',
        carousel: 'unknown',
        video: 'unknown',
        shortVideo: 'unknown',
        altText: 'unknown',
        scheduling: 'unknown',
        metrics: [],
        notes: [],
      },
    },
  },
});

d('a probe that cannot run', () => {
  it('records an observation and writes no capability at all', async () => {
    await verifyCapabilityHandler(job(), context(), { apiKey: null });

    const probes = await pool.query<{ outcome: string; detail: string }>(
      'select outcome, detail from capability_probes',
    );
    expect(probes.rows).toHaveLength(1);
    expect(probes.rows[0]!.outcome).toBe('unavailable');
    expect(probes.rows[0]!.detail).toContain('unknown rather than unsupported');

    /**
     * The assertion this file exists for. An absent credential must not produce
     * a capability row — an all-`no` row would read exactly like a thorough
     * probe that found a limited provider.
     */
    const beliefs = await pool.query('select * from provider_capabilities');
    expect(beliefs.rows).toHaveLength(0);
  });

  it('does not throw, because an unavailable probe is a result', async () => {
    await expect(
      verifyCapabilityHandler(job(), context(), { apiKey: null }),
    ).resolves.toBeUndefined();
  });
});

d('a probe that runs', () => {
  it('records the observation and the belief, with provenance linking them', async () => {
    await verifyCapabilityHandler(job(), context(), { apiKey: 'k', probe: confirming });

    const { rows } = await pool.query<{
      provider: string;
      method: string;
      probe_id: string;
      verified_at: Date;
    }>('select provider, method, probe_id, verified_at from provider_capabilities');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.method).toBe('live_api');
    // The belief cites the observation behind it — the question "why does
    // Halyard believe this" has to have an answer that resolves.
    const probe = await pool.query('select id from capability_probes where id = $1', [
      rows[0]!.probe_id,
    ]);
    expect(probe.rows).toHaveLength(1);
  });

  it('is idempotent: two runs leave one belief and two observations', async () => {
    await verifyCapabilityHandler(job(), context(), { apiKey: 'k', probe: confirming });
    await verifyCapabilityHandler(job('33333333-3333-3333-3333-333333333333'), context(), {
      apiKey: 'k',
      probe: confirming,
    });

    const beliefs = await pool.query<{ n: string }>(
      'select count(*) as n from provider_capabilities',
    );
    const probes = await pool.query<{ n: string }>('select count(*) as n from capability_probes');

    // One belief, because the capability did not change. Two observations,
    // because both checks really happened.
    expect(Number(beliefs.rows[0]!.n)).toBe(1);
    expect(Number(probes.rows[0]!.n)).toBe(2);
  });

  it('leaves an earlier belief untouched when a later probe errors', async () => {
    await verifyCapabilityHandler(job(), context(), { apiKey: 'k', probe: confirming });

    const failing: ProbeRunner = async () => ({
      outcome: 'error',
      detail: 'connection reset',
      observed: {},
    });
    await verifyCapabilityHandler(job('44444444-4444-4444-4444-444444444444'), context(), {
      apiKey: 'k',
      probe: failing,
    });

    // A failed probe proves nothing, so it must not downgrade what an earlier
    // successful probe established.
    const { rows } = await pool.query<{ method: string }>(
      'select method from provider_capabilities',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.method).toBe('live_api');

    const outcomes = await pool.query<{ outcome: string }>(
      'select outcome from capability_probes order by started_at',
    );
    expect(outcomes.rows.map((r) => r.outcome)).toEqual(['confirmed', 'error']);
  });

  it('keeps a refuted probe distinct from an unavailable one', async () => {
    const refuting: ProbeRunner = async () => ({
      outcome: 'refuted',
      detail: 'The provider reported no such capability.',
      observed: {},
    });
    await verifyCapabilityHandler(job(), context(), { apiKey: 'k', probe: refuting });

    const { rows } = await pool.query<{ outcome: string }>('select outcome from capability_probes');
    expect(rows[0]!.outcome).toBe('refuted');
    // Refuted is a finding; unavailable is an absence. Conflating them is how a
    // missing key becomes a permanent "not supported".
    expect(rows[0]!.outcome).not.toBe('unavailable');
  });
});
