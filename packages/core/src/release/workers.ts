/**
 * §567. Is a deployed worker able to do what this release expects of it?
 *
 * The logic is §243's and unchanged; what is new is that something calls it.
 * `staleWorkers` was written, tested and never invoked from any runtime path —
 * the §562 shape, where a capability exists in full and no code reaches it — so
 * the failure it was built to catch could still happen in silence. It now backs
 * the System surface.
 *
 * It lives here rather than in `apps/worker` because the web tier is the thing
 * that has to *report* it, and duplicating the rule in two tiers is how the two
 * tiers come to disagree. The expected job kinds are a parameter rather than an
 * import: `@halyard/core` must not depend on `@halyard/db` (gotcha 10 — the
 * render package is webpacked for the browser through this barrel, and `pg`
 * would arrive with it), so each caller passes `JOB_KINDS`, which both of them
 * already have.
 */

/** How long without a heartbeat before a worker is presumed gone. */
export const HEARTBEAT_GRACE_MS = 10 * 60_000;

export interface WorkerHeartbeat {
  workerId: string;
  lastSeenAt: Date;
  kinds: string[];
  version: string | null;
  /** What the worker reported about itself, when it reported anything. */
  builtAt?: string | null;
  environment?: string | null;
  schemaVersion?: string | null;
}

export interface StaleWorker {
  workerId: string;
  version: string | null;
  /** Kinds this release knows about that the worker cannot claim. */
  missingKinds: string[];
  /** `gone` has stopped heartbeating; `behind` is alive and missing handlers. */
  kind: 'gone' | 'behind';
  reason: string;
}

/**
 * Workers that cannot do what this release expects of them.
 *
 * A worker *ahead* of the release is not stale — that is a deploy landing — so
 * only kinds it is missing count.
 */
export function staleWorkers(
  heartbeats: WorkerHeartbeat[],
  expectedKinds: readonly string[],
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
        kind: 'gone',
        reason: `has not been seen for ${Math.round(age / 60_000)} minutes.`,
      });
      continue;
    }

    const known = new Set(worker.kinds);
    const missingKinds = expectedKinds.filter((k) => !known.has(k));
    if (missingKinds.length > 0) {
      out.push({
        workerId: worker.workerId,
        version: worker.version,
        missingKinds: [...missingKinds],
        kind: 'behind',
        reason:
          `is older than the handler map: it cannot claim ${missingKinds.length} job ` +
          `kind${missingKinds.length === 1 ? '' : 's'} (${missingKinds.join(', ')}), which will ` +
          'sit pending with no error until it is redeployed.',
      });
    }
  }

  return out;
}

/**
 * Can a given job kind actually run right now?
 *
 * The rule H0 asks for in one function: **never show a green capability when
 * the worker that handles it is stale or missing the job kind.** A feature's
 * status surface asks this rather than assuming that a handler existing in the
 * checkout means a handler running in production.
 */
export function jobKindRunnable(
  kind: string,
  heartbeats: WorkerHeartbeat[],
  now: Date = new Date(),
): { runnable: boolean; reason: string } {
  const live = heartbeats.filter(
    (w) => now.getTime() - w.lastSeenAt.getTime() <= HEARTBEAT_GRACE_MS,
  );

  if (live.length === 0) {
    return { runnable: false, reason: 'no worker has sent a heartbeat recently' };
  }

  const capable = live.filter((w) => w.kinds.includes(kind));
  if (capable.length === 0) {
    return {
      runnable: false,
      reason: `no live worker registers '${kind}' — the job would sit pending with no error`,
    };
  }

  if (capable.length < live.length) {
    return {
      runnable: true,
      reason:
        `${capable.length} of ${live.length} live workers register '${kind}' — ` +
        'a job claimed by one of the others will sit pending',
    };
  }

  return { runnable: true, reason: `${capable.length} live worker(s) register '${kind}'` };
}
