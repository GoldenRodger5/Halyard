/**
 * §567. What is actually running, and does it agree with itself?
 *
 * Halyard deploys as two components — Vercel for the web tier, Railway for the
 * worker — against one database, released independently. Until now neither
 * could say what it was, and the failure that costs the most is silent by
 * construction: a worker deployed before a handler existed leaves those jobs
 * `pending` forever, with no error, no failed job, and a UI that looks fine
 * (§243). The detection for that has existed and been tested since §243 and had
 * no caller. This is the caller.
 *
 * Everything here is measured rather than asserted, and `unknown` is a
 * first-class answer — the same discipline `getSystemHealth` already applies.
 * A check that cannot run must not report `ok`.
 */
import { EXPECTED_SCHEMA_VERSION, JOB_KINDS } from '@halyard/db';
import {
  compareRevisions,
  compareSchema,
  staleWorkers,
  type CompatibilityFinding,
  type ReleaseIdentity,
  type StaleWorker,
  type WorkerHeartbeat,
} from '@halyard/core';
import { query } from '@/lib/db';
import { webReleaseIdentity } from '@/lib/webRelease';

export interface WorkerReport extends WorkerHeartbeat {
  secondsAgo: number;
  /** Kinds this worker registers, counted against what the release expects. */
  kindCount: number;
}

export interface ReleaseStatus {
  web: ReleaseIdentity;
  /** Workers seen recently enough to be part of the running fleet. */
  workers: WorkerReport[];
  stale: StaleWorker[];
  /**
   * Heartbeat rows too old to be a running worker. Nothing prunes this table,
   * so a long-lived database accumulates one row per worker id it has ever
   * seen — 44 of them on the development database when this was written.
   */
  retiredWorkers: number;
  /** What the release expects of the database, and what the database says. */
  schema: { expected: string; actual: string | null } & CompatibilityFinding;
  revisions: CompatibilityFinding;
  expectedKindCount: number;
}

export interface HeartbeatRow {
  worker_id: string;
  last_seen_at: string;
  version: string | null;
  detail: {
    kinds?: string[];
    builtAt?: string | null;
    environment?: string | null;
    schemaVersion?: string | null;
  } | null;
}

/**
 * The database's own answer to "which migration was I built to".
 *
 * Absent on any database migrated before 0082, which is `null` rather than an
 * error — a marker that is not there yet is not a disagreement.
 */
async function schemaVersion(): Promise<string | null> {
  try {
    const rows = await query<{ version: string }>('select version from schema_version limit 1');
    return rows[0]?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * How the status reads rows. Injectable so the assembly can be tested against a
 * real database rather than only its pure parts — the SQL and the mapping from
 * `detail` jsonb are exactly where a release check quietly stops being true,
 * and a check nobody tests is the thing this whole module exists to prevent.
 */
export interface ReleaseSources {
  heartbeats: () => Promise<HeartbeatRow[]>;
  schemaVersion: () => Promise<string | null>;
  identity: () => ReleaseIdentity;
  now?: Date;
}

/**
 * How long a heartbeat row still describes a *worker* rather than a memory.
 *
 * `staleWorkers` calls anything past a ten-minute grace `gone`, which is the
 * right alarm for a worker that died during a deploy and pure noise for a row
 * left by a one-off script three weeks ago. Nothing prunes `worker_heartbeats`,
 * so without a window the release panel reports forty-four dead workers and
 * buries the one that matters. A day is the line: within it, silence is a
 * failure worth naming; beyond it, the row is history.
 */
const FLEET_WINDOW_MS = 24 * 60 * 60_000;

const liveSources: ReleaseSources = {
  heartbeats: () =>
    query<HeartbeatRow>(
      `select worker_id, last_seen_at, version, detail
         from worker_heartbeats
        order by last_seen_at desc`,
    ),
  schemaVersion,
  identity: webReleaseIdentity,
};

export async function getReleaseStatus(
  sources: ReleaseSources = liveSources,
): Promise<ReleaseStatus> {
  const now = sources.now ?? new Date();
  const web = sources.identity();

  const [rows, actualSchema] = await Promise.all([
    sources.heartbeats(),
    sources.schemaVersion(),
  ]);

  const all: WorkerReport[] = rows.map((r) => {
    const lastSeenAt = new Date(r.last_seen_at);
    const kinds = r.detail?.kinds ?? [];
    return {
      workerId: r.worker_id,
      lastSeenAt,
      kinds,
      version: r.version && r.version !== 'unknown' ? r.version : null,
      builtAt: r.detail?.builtAt ?? null,
      environment: r.detail?.environment ?? null,
      schemaVersion: r.detail?.schemaVersion ?? null,
      secondsAgo: Math.max(0, Math.round((now.getTime() - lastSeenAt.getTime()) / 1000)),
      kindCount: kinds.length,
    };
  });

  const workers = all.filter((w) => w.secondsAgo * 1000 <= FLEET_WINDOW_MS);

  /*
   * The freshest worker is the one to compare the web tier against. Comparing
   * against a stray from three deploys ago (gotcha 13 — two workers will
   * happily race each other) would report a mismatch that is real but not the
   * one the operator is looking at; the stray shows up in `stale` instead,
   * which is where it belongs.
   */
  const freshest = workers[0] ?? null;

  return {
    web,
    workers,
    stale: staleWorkers(workers, JOB_KINDS, now),
    retiredWorkers: all.length - workers.length,
    schema: {
      expected: EXPECTED_SCHEMA_VERSION,
      actual: actualSchema,
      ...compareSchema(EXPECTED_SCHEMA_VERSION, actualSchema),
    },
    revisions: compareRevisions(web.commit, freshest?.version ?? null),
    expectedKindCount: JOB_KINDS.length,
  };
}
