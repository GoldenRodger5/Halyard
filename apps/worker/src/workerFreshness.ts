/**
 * Is a deployed worker running the code this checkout expects? §243.
 *
 * The Railway worker was found to be missing three job kinds — it had been
 * deployed before those handlers existed, so those jobs sat `pending` forever
 * with no error and no failed job, and the features they belong to looked
 * broken for reasons nothing explained.
 *
 * The `kinds` list every worker already writes to `worker_heartbeats` is the
 * signal: derived from the code actually running, written every heartbeat, and
 * changing exactly when the handler map does.
 */
import { JOB_KINDS } from '@halyard/db';

/** How long without a heartbeat before a worker is presumed gone. */
export const HEARTBEAT_GRACE_MS = 10 * 60_000;

export interface WorkerHeartbeat {
  workerId: string;
  lastSeenAt: Date;
  kinds: string[];
  version: string | null;
}

export interface StaleWorker {
  workerId: string;
  version: string | null;
  /** Kinds this checkout knows about that the worker cannot claim. */
  missingKinds: string[];
  reason: string;
}

/**
 * Workers that cannot do what this checkout expects of them.
 *
 * A worker *ahead* of the checkout is not stale — that is a deploy landing —
 * so only kinds it is missing count.
 */
export function staleWorkers(
  heartbeats: WorkerHeartbeat[],
  now: Date = new Date(),
): StaleWorker[] {
  const out: StaleWorker[] = [];

  for (const worker of heartbeats) {
    const age = now.getTime() - worker.lastSeenAt.getTime();
    if (age > HEARTBEAT_GRACE_MS) {
      out.push({
        workerId: worker.workerId,
        version: worker.version,
        missingKinds: [],
        reason: `has not been seen for ${Math.round(age / 60_000)} minutes.`,
      });
      continue;
    }

    const known = new Set(worker.kinds);
    const missingKinds = JOB_KINDS.filter((k) => !known.has(k));
    if (missingKinds.length > 0) {
      out.push({
        workerId: worker.workerId,
        version: worker.version,
        missingKinds,
        reason:
          `is older than the handler map: it cannot claim ${missingKinds.length} job ` +
          `kind${missingKinds.length === 1 ? '' : 's'} (${missingKinds.join(', ')}), which will ` +
          'sit pending with no error until it is redeployed.',
      });
    }
  }

  return out;
}
