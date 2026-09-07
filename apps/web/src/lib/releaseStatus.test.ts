/**
 * §567. The release check, against a real database, in the states it exists for.
 *
 * The pure rules are tested in `@halyard/core`. What is tested here is the part
 * that actually decays: the SQL, and the mapping out of the `detail` jsonb the
 * worker writes. A release check that reads the wrong column reports agreement
 * it never verified, which is worse than having no check — so every state below
 * is produced by writing real rows to a real `worker_heartbeats` and reading
 * them back through the same query production uses.
 *
 * The adversarial cases are the point: a worker missing a job kind, a worker
 * that has stopped heartbeating, and a database behind the code. Each one is a
 * failure that is silent everywhere else in Halyard.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JOB_KINDS, EXPECTED_SCHEMA_VERSION } from '@halyard/db';
import { createIsolatedPool, databaseAvailable } from '../../../../packages/db/src/__tests__/testDb.js';
import { getReleaseStatus, type HeartbeatRow, type ReleaseSources } from './releaseStatus.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

const NOW = new Date('2026-09-07T12:00:00Z');

let pool: pg.Pool;

/** The same query the live sources run, against the isolated database. */
function sourcesFor(overrides: Partial<ReleaseSources> = {}): ReleaseSources {
  return {
    heartbeats: async () => {
      const { rows } = await pool.query<HeartbeatRow>(
        `select worker_id, last_seen_at, version, detail
           from worker_heartbeats
          order by last_seen_at desc`,
      );
      return rows;
    },
    schemaVersion: async () => {
      const { rows } = await pool.query<{ version: string }>(
        'select version from schema_version limit 1',
      );
      return rows[0]?.version ?? null;
    },
    identity: () => ({
      commit: 'webwebwebweb',
      builtAt: '2026-09-07T11:00:00.000Z',
      environment: 'production' as const,
      source: 'HALYARD_RELEASE',
    }),
    now: NOW,
    ...overrides,
  };
}

async function writeHeartbeat(
  workerId: string,
  opts: { secondsAgo: number; kinds: readonly string[]; version: string },
): Promise<void> {
  await pool.query(
    `insert into worker_heartbeats (worker_id, last_seen_at, version, detail)
     values ($1, $2, $3, $4)
     on conflict (worker_id) do update
       set last_seen_at = excluded.last_seen_at,
           version = excluded.version,
           detail = excluded.detail`,
    [
      workerId,
      new Date(NOW.getTime() - opts.secondsAgo * 1000).toISOString(),
      opts.version,
      JSON.stringify({
        kinds: opts.kinds,
        builtAt: '2026-09-07T11:00:00.000Z',
        environment: 'production',
        schemaVersion: EXPECTED_SCHEMA_VERSION,
      }),
    ],
  );
}

d('getReleaseStatus, against a real database', () => {
  beforeAll(async () => {
    pool = await createIsolatedPool('release_status');
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('delete from worker_heartbeats');
  });

  it('is quiet when the worker is current and the schema matches', async () => {
    await writeHeartbeat('w1', { secondsAgo: 30, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.stale).toEqual([]);
    expect(status.schema.state).toBe('ok');
    expect(status.schema.actual).toBe(EXPECTED_SCHEMA_VERSION);
    expect(status.revisions.state).toBe('ok');
    expect(status.workers[0]!.kindCount).toBe(JOB_KINDS.length);
  });

  it('reads the job kinds out of the detail jsonb the worker actually writes', async () => {
    await writeHeartbeat('w1', { secondsAgo: 5, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor());

    // The mapping, not the rule: a wrong column name here reads as zero kinds,
    // which would make every worker look stale rather than none.
    expect(status.workers[0]!.kinds).toEqual([...JOB_KINDS]);
    expect(status.workers[0]!.environment).toBe('production');
    expect(status.workers[0]!.schemaVersion).toBe(EXPECTED_SCHEMA_VERSION);
    expect(status.expectedKindCount).toBe(JOB_KINDS.length);
  });

  it('reports a worker that cannot claim a job kind this release expects', async () => {
    const missing = JOB_KINDS.filter((k) => k !== 'publish');
    await writeHeartbeat('w1', { secondsAgo: 20, kinds: missing, version: 'oldoldoldold' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.stale).toHaveLength(1);
    expect(status.stale[0]!.kind).toBe('behind');
    expect(status.stale[0]!.missingKinds).toContain('publish');
    // The consequence, said out loud — this is the failure that is otherwise silent.
    expect(status.stale[0]!.reason).toContain('sit pending');
  });

  it('reports a worker that has stopped heartbeating', async () => {
    await writeHeartbeat('w1', { secondsAgo: 45 * 60, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.stale[0]!.kind).toBe('gone');
    expect(status.stale[0]!.reason).toContain('45 minutes');
  });

  it('warns when the worker is on a different commit from the web tier', async () => {
    await writeHeartbeat('w1', { secondsAgo: 10, kinds: JOB_KINDS, version: 'otherotherxx' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.revisions.state).toBe('warn');
    expect(status.revisions.detail).toContain('otherotherxx');
  });

  it('fails when the database is behind the release', async () => {
    await writeHeartbeat('w1', { secondsAgo: 10, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor({ schemaVersion: async () => '0001' }));

    expect(status.schema.state).toBe('fail');
    expect(status.schema.actual).toBe('0001');
    expect(status.schema.expected).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('never reports ok when no worker has ever heartbeated', async () => {
    const status = await getReleaseStatus(sourcesFor());

    expect(status.workers).toEqual([]);
    // Unknown, not ok. A comparison with nothing is not agreement.
    expect(status.revisions.state).toBe('unknown');
  });

  it('treats the literal version "unknown" as no commit rather than as a commit', async () => {
    await writeHeartbeat('w1', { secondsAgo: 10, kinds: JOB_KINDS, version: 'unknown' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.workers[0]!.version).toBeNull();
    expect(status.revisions.state).toBe('unknown');
  });

  it('leaves a heartbeat row older than a day out of the fleet, and counts it', async () => {
    /*
     * Nothing prunes worker_heartbeats. The development database held 44 rows
     * from one-off scripts, and without this window the panel reported 44 dead
     * workers — which buries the one that actually died during a deploy.
     */
    await writeHeartbeat('ancient', {
      secondsAgo: 40 * 24 * 60 * 60,
      kinds: JOB_KINDS,
      version: 'ancientxxxxx',
    });
    await writeHeartbeat('current', { secondsAgo: 10, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.workers.map((w) => w.workerId)).toEqual(['current']);
    expect(status.retiredWorkers).toBe(1);
    // And it is not shouted about: a row from six weeks ago is not an incident.
    expect(status.stale).toEqual([]);
  });

  it('still reports a worker that died an hour ago — that one is an incident', async () => {
    await writeHeartbeat('w1', { secondsAgo: 60 * 60, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.stale[0]!.kind).toBe('gone');
    expect(status.retiredWorkers).toBe(0);
  });

  it('compares the web tier against the freshest worker, not a stray', async () => {
    // Gotcha 13: two workers poll the same table, and one is often a leftover.
    await writeHeartbeat('stray', { secondsAgo: 300, kinds: JOB_KINDS, version: 'strayxxxxxxx' });
    await writeHeartbeat('current', { secondsAgo: 10, kinds: JOB_KINDS, version: 'webwebwebweb' });

    const status = await getReleaseStatus(sourcesFor());

    expect(status.workers[0]!.workerId).toBe('current');
    expect(status.revisions.state).toBe('ok');
  });
});
