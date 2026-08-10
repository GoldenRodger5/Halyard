/**
 * What happens when a scheduled time passes and the item is not ready.
 * Build pack §3 — every one of these needs a decided answer or it becomes an
 * outage at 3am.
 */
import type { ResolvedSlot } from './timezone.js';

export type RescheduleOutcome =
  | { action: 'publish_now'; reason: string }
  | { action: 'reschedule'; to: Date; slotName: string; reason: string }
  | { action: 'wait'; untilMs: number; reason: string }
  | { action: 'expire'; reason: string };

export interface RescheduleInput {
  status: string;
  scheduledAt: Date;
  now: Date;
  rescheduleCount: number;
  /** True once every render for the item has status 'done'. */
  rendersComplete: boolean;
  /** Upcoming slot occurrences for this item's platform, soonest first. */
  nextSlots: ResolvedSlot[];
}

/** v1 §3 policy: never publish something approved four days ago as if it were fresh. */
export const MAX_RESCHEDULES = 3;
/** How long to wait for a render that is still running at publish time. */
export const RENDER_GRACE_MINUTES = 20;

export function decideReschedule(input: RescheduleInput): RescheduleOutcome {
  const { status, scheduledAt, now, rescheduleCount, rendersComplete, nextSlots } = input;

  if (now < scheduledAt) {
    return { action: 'wait', untilMs: scheduledAt.getTime() - now.getTime(), reason: 'Not due yet.' };
  }

  // Approved, rendered, due: go.
  if (status === 'approved' || status === 'scheduled') {
    if (rendersComplete) {
      return { action: 'publish_now', reason: 'Approved, rendered, and due.' };
    }
    const graceEnds = new Date(scheduledAt.getTime() + RENDER_GRACE_MINUTES * 60_000);
    if (now < graceEnds) {
      return {
        action: 'wait',
        untilMs: graceEnds.getTime() - now.getTime(),
        reason: `Render still running. Waiting up to ${RENDER_GRACE_MINUTES} minutes.`,
      };
    }
    return nextSlotOrExpire(
      nextSlots,
      rescheduleCount,
      now,
      `Render did not finish within ${RENDER_GRACE_MINUTES} minutes.`,
    );
  }

  // Still waiting on a human. Move it along rather than publishing stale approval.
  if (status === 'pending_approval' || status === 'draft') {
    return nextSlotOrExpire(
      nextSlots,
      rescheduleCount,
      now,
      'Slot passed while the item was still waiting for approval.',
    );
  }

  return { action: 'wait', untilMs: 60_000, reason: `Status '${status}' is not schedulable.` };
}

function nextSlotOrExpire(
  nextSlots: ResolvedSlot[],
  rescheduleCount: number,
  now: Date,
  why: string,
): RescheduleOutcome {
  if (rescheduleCount >= MAX_RESCHEDULES) {
    return {
      action: 'expire',
      reason: `${why} Already rescheduled ${rescheduleCount} times; expiring rather than posting something stale.`,
    };
  }
  const next = nextSlots.find((s) => s.startUtc > now);
  if (!next) {
    return { action: 'expire', reason: `${why} No slot available inside the horizon.` };
  }
  const target = new Date(
    next.startUtc.getTime() + (next.endUtc.getTime() - next.startUtc.getTime()) / 2,
  );
  target.setUTCSeconds(0, 0);
  return {
    action: 'reschedule',
    to: target,
    slotName: next.name,
    reason: `${why} Moved to the next ${next.name} slot (${rescheduleCount + 1} of ${MAX_RESCHEDULES}).`,
  };
}

/**
 * v1 §3 publish-failure policy, kept next to the reschedule rules because they
 * are the same decision surface.
 */
export type PublishFailureKind = 'auth' | 'rate_limit' | 'malformed_response' | 'transient' | 'duplicate';

export interface PublishFailurePolicy {
  retry: boolean;
  backoffSeconds?: number;
  setAccountState?: 'error';
  pauseAccountQueue?: boolean;
  notify?: 'auth_failure' | 'duplicate_publish_abort';
  markReconciliation?: boolean;
  note: string;
}

export function publishFailurePolicy(
  kind: PublishFailureKind,
  attempt: number,
  retryAfterSeconds?: number,
): PublishFailurePolicy {
  switch (kind) {
    case 'auth':
      return {
        retry: false,
        setAccountState: 'error',
        pauseAccountQueue: true,
        notify: 'auth_failure',
        note: 'Do not retry blindly against a dead token. Queue paused for this account.',
      };
    case 'rate_limit':
      return {
        retry: attempt < 3,
        backoffSeconds: retryAfterSeconds ?? Math.min(3600, 60 * 2 ** attempt),
        note: 'Exponential backoff, respecting Retry-After. Reschedule after three attempts.',
      };
    case 'malformed_response':
      // The single most dangerous case: the post may well be live.
      return {
        retry: false,
        markReconciliation: true,
        note: 'Treated as success with unknown id. Never retried — that double-posts.',
      };
    case 'duplicate':
      return {
        retry: false,
        notify: 'duplicate_publish_abort',
        note: 'Hard abort, written to audit_log. This is the failure that must never happen.',
      };
    case 'transient':
    default:
      return {
        retry: attempt < 3,
        backoffSeconds: Math.min(600, 60 * 2 ** attempt),
        note: 'Transient. Retry with backoff.',
      };
  }
}
