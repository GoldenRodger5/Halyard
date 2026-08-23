/**
 * Recording what a job actually observed one account being able to do.
 *
 * ## Why the collection job is the probe
 *
 * An engagement read cannot be verified by a background probe the way a
 * provider can. It needs a real connected account, a real publication belonging
 * to it, and a real call — which is precisely what `collect_comments` already
 * does, fifteen times in a publication's first day. Adding a separate probe job
 * would spend API calls to learn something the existing job learns as a
 * byproduct.
 *
 * So the observation is a byproduct, not an extra request. Nothing here calls a
 * platform; it records the outcome of a call that had to happen anyway.
 *
 * ## Why this never records `refuted`
 *
 * A failed comment read has too many innocent explanations — the post was
 * deleted, the token expired, the platform rate-limited us — for any of them to
 * constitute proof that the account *cannot* read comments. Refutation is a
 * strong claim and needs a probe designed to discriminate; this is not one.
 *
 * Failures are therefore recorded as `unavailable` (the credential or the
 * subject was not usable) or `error` (it broke in a way that proves nothing).
 * Neither participates in the verdict, which is exactly what those two words
 * mean in `capability_probes.outcome`. The alternative — letting an expired
 * token harden into "this platform cannot read comments" — is the failure the
 * whole capability model exists to prevent.
 *
 * ## Why it is rate-limited
 *
 * Append-only evidence is only useful while it can still be read. Fifteen polls
 * a day per publication would bury a genuine change under hundreds of identical
 * rows, so an unchanged outcome is re-recorded at most every
 * `OBSERVATION_INTERVAL_HOURS`. A *changed* outcome is always recorded
 * immediately: the transition is the alert.
 */
import {
  PublishError,
  shouldRecordObservation,
  type CapabilityAction,
  type CapabilityObservation,
  type PlatformId,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';

export type ObservationOutcome = CapabilityObservation['outcome'];

/**
 * Classify a thrown error into a probe outcome that proves nothing.
 *
 * Every branch returns a non-informative outcome by design. The distinction
 * between them is for the operator reading the probe list, not for the
 * resolver — neither can promote or demote a capability.
 */
export function classifyObservationFailure(error: unknown): {
  outcome: Extract<ObservationOutcome, 'unavailable' | 'error'>;
  detail: string;
} {
  if (error instanceof PublishError) {
    if (error.kind === 'auth') {
      return {
        outcome: 'unavailable',
        detail: `The credential was refused (${error.status ?? 'no status'}), so nothing could be observed. This says nothing about what the account is permitted to do.`,
      };
    }
    if (error.kind === 'rate_limit') {
      return { outcome: 'error', detail: 'Rate limited before anything could be observed.' };
    }
    return {
      outcome: 'error',
      detail: `The read failed (${error.kind}${error.status ? ` ${error.status}` : ''}) in a way that proves nothing about the capability.`,
    };
  }
  return {
    outcome: 'error',
    detail: `The read failed before anything could be observed: ${(error as Error).message}`.slice(
      0,
      400,
    ),
  };
}

export interface RecordObservationInput {
  accountId: string;
  platform: PlatformId;
  action: CapabilityAction;
  outcome: ObservationOutcome;
  detail: string;
  observed?: Record<string, unknown>;
  jobId?: string;
}

/**
 * Append an account-scoped observation, unless an identical one is recent.
 *
 * Returns the probe id when a row was written, and null when it was skipped as
 * an unchanged repeat — which callers may log but must not treat as a failure.
 */
export async function recordAccountObservation(
  ctx: HandlerContext,
  input: RecordObservationInput,
): Promise<string | null> {
  const { rows: previous } = await ctx.pool.query<{ outcome: ObservationOutcome; started_at: Date }>(
    `select outcome, started_at from capability_probes
      where account_id = $1 and action = $2
      order by started_at desc limit 1`,
    [input.accountId, input.action],
  );

  const last = previous[0]
    ? { outcome: previous[0].outcome, observedAt: new Date(previous[0].started_at) }
    : null;

  if (!shouldRecordObservation(last, { outcome: input.outcome })) return null;

  /**
   * `provider` is `direct` rather than null: this observation was made through
   * Halyard's own adapter, and the column is not nullable. Saying which
   * transport saw it is the point — the same read through a unified provider is
   * a different observation and must not be confused with this one.
   */
  const { rows } = await ctx.pool.query<{ id: string }>(
    `insert into capability_probes
       (provider, platform, action, account_id, method, outcome, detail, observed,
        started_at, completed_at, duration_ms, triggered_by, job_id)
     values ('direct', $1, $2, $3, 'live_api', $4, $5, $6, now(), now(), 0, 'job', $7)
     returning id`,
    [
      input.platform,
      input.action,
      input.accountId,
      input.outcome,
      input.detail.slice(0, 1000),
      JSON.stringify(input.observed ?? {}),
      input.jobId ?? null,
    ],
  );

  return rows[0]?.id ?? null;
}
