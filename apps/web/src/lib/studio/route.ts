/**
 * §386. How a piece got here, as six stops on a line.
 *
 * The Gallery's piece view answers "why is this the way it is", and the first
 * thing an operator wants is the shape of the run: what happened, where it was
 * refused, how far it got. A chronological event feed does not answer that —
 * you have to read all of it to find out that one thing was refused once.
 *
 * ## Why six stops and not eleven
 *
 * A production has eleven stages (`STAGE_ORDER`). Eleven dots is a diagram, not
 * a glance. These six are the ones an operator recognises as *different kinds
 * of work* — finding out, writing, making, checking, deciding, airing — and the
 * eleven map onto them without remainder. The condensation is the decision this
 * module exists to hold, and `CONDENSE` is asserted total against `STAGE_ORDER`
 * so a twelfth stage cannot be added and silently vanish from the strip.
 *
 * ## Why it reads the item and not `job_events`
 *
 * Because there is no link. `job_events.job_id` points at a job; nothing on
 * `content_items` points back at the job that made it, and no job payload
 * carries a content id. The strip would therefore be empty for every row that
 * exists today.
 *
 * What the item itself records is real evidence and enough for all six stops:
 * sourced claims mean research ran, a finished render means it was made, a gate
 * result means it was checked, the status means what the human and the platform
 * did. Per gotcha 9 this is measurement, not inference — each stop below cites
 * the column it reads, and a stop with nothing behind it reports `ahead` rather
 * than guessing.
 */
import { STAGE_ORDER } from '@halyard/core';
import type { QueueItem } from '@/lib/queries';

/**
 * `done` it happened · `refused` something was turned back here ·
 * `now` it is happening · `ahead` not reached.
 *
 * `refused` is deliberately not `failed`. Most refusals in this system are
 * followed by another attempt that passed, and a red dot that means "stopped
 * forever" would misread the common case — §386.
 */
export type StopState = 'done' | 'refused' | 'now' | 'ahead';

export interface RouteStop {
  key: string;
  /** Three or four characters. The strip is 300px wide. */
  label: string;
  /** What this stop covers, for the title attribute. */
  means: string;
  state: StopState;
}

export interface Route {
  stops: RouteStop[];
  /**
   * One sentence on the run's shape, or null when there is nothing to say.
   *
   * Null rather than "it went fine": a note under every strip is noise, and the
   * strip already shows a clean run as six green dots.
   */
  note: string | null;
}

/** Which stop each production stage belongs to. Total over `STAGE_ORDER`. */
const CONDENSE: Record<string, string> = {
  brief: 'res',
  research: 'res',
  write: 'write',
  screenplay: 'write',
  caption: 'write',
  assets: 'art',
  voice: 'art',
  music: 'art',
  marks: 'art',
  render: 'art',
  qc: 'gate',
};

/** Exported so the test can assert the map is total without importing the map. */
export function stopForStage(stage: string): string | null {
  return CONDENSE[stage] ?? null;
}

const MEANS: Record<string, string> = {
  res: 'Finding facts, and reading the page each one claims to come from',
  write: 'Filling the format, staging the scenes, writing the captions',
  art: 'Choosing what to show, reading it aloud, turning it into frames',
  gate: 'Watching it back, and refusing what does not hold up',
  ok: 'Your decision',
  air: 'At the platform',
};

/** Statuses in which a human has already said yes. */
const APPROVED = new Set(['approved', 'scheduled', 'publishing', 'published', 'awaiting_manual_publish']);
/** Statuses in which it reached a platform. */
const AIRED = new Set(['published', 'awaiting_manual_publish']);

export function routeFor(item: QueueItem): Route {
  const gates = item.qc_results?.gates ?? [];
  const failedGates = gates.filter((g) => g.status === 'failed');
  const rendering = item.render_total > 0 && item.render_done < item.render_total;
  const renderFailed = item.render_failed > 0;

  /* ── res ── sourced claims are the only evidence research ran. */
  const res: StopState = item.claims.length > 0 ? 'done' : item.body ? 'done' : 'ahead';

  /* ── write ── the piece has words. An empty body means it never got here. */
  const write: StopState = item.body || item.title ? 'done' : 'ahead';

  /* ── art ── renders. No renders planned is not a failure: a text-only post
     on X has nothing to make, and `ahead` would be wrong. It is `done`. */
  const art: StopState = renderFailed
    ? 'refused'
    : rendering
      ? 'now'
      : item.render_total === 0
        ? item.body
          ? 'done'
          : 'ahead'
        : 'done';

  /*
   * ── gate ── Gotcha 6, exactly: a gate that did not run is not a gate that
   * passed. `skipped` is a real status the gates emit for work that had nothing
   * to examine, so a piece whose gates *all* skipped has not been checked and
   * reads `ahead` — the same as one that never reached the gate at all, which
   * is the truth about it. A `warning` did run and did clear.
   */
  const ran = gates.filter((g) => g.status !== 'skipped');
  const gate: StopState =
    failedGates.length > 0 ? 'refused' : ran.length === 0 ? 'ahead' : 'done';

  /* ── ok ── the human. Rejected is a refusal here, not a failure upstream. */
  const ok: StopState =
    item.status === 'rejected'
      ? 'refused'
      : APPROVED.has(item.status)
        ? 'done'
        : 'ahead';

  /* ── air ── the platform. `failed` after approval was refused at the door. */
  const air: StopState = AIRED.has(item.status)
    ? 'done'
    : item.status === 'failed'
      ? 'refused'
      : item.status === 'publishing'
        ? 'now'
        : 'ahead';

  const stops: RouteStop[] = [
    { key: 'res', label: 'res', means: MEANS.res!, state: res },
    { key: 'write', label: 'write', means: MEANS.write!, state: write },
    { key: 'art', label: 'art', means: MEANS.art!, state: art },
    { key: 'gate', label: 'gate', means: MEANS.gate!, state: gate },
    { key: 'ok', label: 'ok', means: MEANS.ok!, state: ok },
    { key: 'air', label: 'air', means: MEANS.air!, state: air },
  ];

  return { stops, note: noteFor(item, failedGates) };
}

/**
 * The sentence under the strip.
 *
 * Ordered by what an operator most needs to know. The recorded reason beats a
 * derived one every time — §362 found `failed_because` written by the generator
 * and read by nothing, and a strip that recomputes a worse version of a
 * sentence already on the row would be the same mistake.
 */
function noteFor(
  item: QueueItem,
  failedGates: Array<{ gate: string; summary: string }>,
): string | null {
  if (item.failed_because) return item.failed_because;
  if (item.reject_reason) return `You sent it back — ${item.reject_reason}`;
  if (item.render_failed > 0) {
    return item.render_error
      ? `A render failed — ${item.render_error.slice(0, 120)}`
      : 'A render failed, and nothing recorded why.';
  }
  if (failedGates.length > 0) {
    const g = failedGates[0]!;
    return `Refused at the gate — ${g.gate}: ${g.summary}`;
  }
  if (item.render_total > 0 && item.render_done < item.render_total) {
    return `Still making it — ${item.render_done} of ${item.render_total} rendered.`;
  }
  if (item.status === 'failed') {
    return 'Failed, and nothing recorded why. That is a bug worth finding.';
  }
  return null;
}

/** Every stage this system runs, for the test that keeps `CONDENSE` total. */
export const ALL_STAGES: readonly string[] = STAGE_ORDER;
