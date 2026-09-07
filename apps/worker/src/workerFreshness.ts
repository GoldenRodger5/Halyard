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
 *
 * §567 moved the rule itself into `@halyard/core` so the web tier can report it
 * — for four hundred commits this function had no caller at all, which is the
 * §562 shape: the detection existed and the failure it catches could still
 * happen in silence. This file is now the worker's binding of that rule to
 * `JOB_KINDS`, so the two tiers cannot come to disagree about what "stale"
 * means.
 */
import { JOB_KINDS } from '@halyard/db';
import { staleWorkers as staleAgainst, type StaleWorker, type WorkerHeartbeat } from '@halyard/core';

export { HEARTBEAT_GRACE_MS } from '@halyard/core';
export type { StaleWorker, WorkerHeartbeat };

/** Workers that cannot claim every kind this checkout knows how to handle. */
export function staleWorkers(heartbeats: WorkerHeartbeat[], now: Date = new Date()): StaleWorker[] {
  return staleAgainst(heartbeats, JOB_KINDS, now);
}
