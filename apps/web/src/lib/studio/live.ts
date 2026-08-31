/**
 * §387. What the floor is doing, desk by desk.
 *
 * Reads one production's `job_events` and returns the state of every desk plus
 * the feed. Everything here is derived from the event sequence — nothing new is
 * stored, and the handoff between two desks is simply two consecutive events in
 * different stages, which a sequence already encodes.
 *
 * The build plan proposed a `from_stage` column for this. It is not needed, and
 * a stored copy of something the order already tells you is a second source of
 * truth that can disagree with the first.
 */
import 'server-only';
import { DESKS, deskForStage, type Desk } from '@/components/studio/desks';
import type { RundownLine } from '@/components/studio/RoomFurniture';
import { crewLine, type CrewLine } from './crewVoice';
import { formatInOperatorTz } from '@/lib/format';
import { query } from '@/lib/db';

/** `working` is the desk with the newest event; `done` has been past. */
export type DeskState = 'waiting' | 'working' | 'done' | 'skipped';

export interface DeskLive {
  desk: Desk;
  state: DeskState;
  /** The line above this desk, when it is the one talking. */
  says: CrewLine | null;
  /** How many events this desk has produced. */
  events: number;
}

export interface FeedEvent {
  id: string;
  deskId: string | null;
  /** The desk's name, or 'The run' for anything no stage claimed. */
  who: string;
  says: CrewLine;
  at: string;
}

export interface FloorLive {
  /** Null when nothing is in production. */
  running: boolean;
  /**
   * §397. Why the room is not working, when it is not.
   *
   * "Idle" and "briefed, and nothing will pick it up" are different facts and
   * looked identical: a brief redirects here, the job sits `queued` because no
   * worker is running, and the room says *"Nothing in production"* — which is
   * indistinguishable from never having briefed at all. Somebody watching that
   * reasonably concludes it started and stopped.
   *
   * Null when the room is genuinely idle with nothing waiting.
   */
  waiting: { queued: number; workerSeenSecondsAgo: number | null } | null;
  /** What is being made, in one line. */
  making: string | null;
  jobId: string | null;
  startedAt: string | null;
  desks: DeskLive[];
  feed: FeedEvent[];
  /** The wire that is hot right now, as a pair of desk ids. */
  handoff: [string, string] | null;
}

interface Row {
  id: string;
  job_id: string;
  stage: string | null;
  message: string;
  detail: Record<string, unknown> | null;
  at: string;
  kind: string;
  payload: Record<string, unknown> | null;
  locked_at: string | null;
}

/** The idle room. A real state, and it says so rather than reading as broken. */
function idle(waiting: FloorLive['waiting'] = null): FloorLive {
  return {
    running: false,
    waiting,
    making: null,
    jobId: null,
    startedAt: null,
    desks: DESKS.map((desk) => ({ desk, state: 'waiting', says: null, events: 0 })),
    feed: [],
    handoff: null,
  };
}

export async function readLive(): Promise<FloorLive> {
  /*
   * The newest running production. `generate` is the job that owns a run; its
   * render and tts children are separate jobs whose events belong to the same
   * production, so they are pulled in by content item below.
   *
   * ## §397. A job held by a worker that died is not running
   *
   * `reap_stale_jobs()` releases a lock older than thirty minutes — but it runs
   * *inside a worker*, so when the worker is the thing that died, nothing reaps
   * anything and the job stays `running` forever. The floor then says "on the
   * floor" while nothing is happening at all: the same lie as saying "idle"
   * over a queued brief, told from the other side.
   *
   * The query uses the reaper's own thirty minutes, so the screen and the
   * reaper cannot disagree about what is alive.
   */
  const rows = await query<Row>(
    `select e.id::text, e.job_id::text, e.stage, e.message, e.detail, e.at,
            j.kind, j.payload, j.locked_at
       from job_events e
       join jobs j on j.id = e.job_id
      where j.id = (
        select id from jobs
         where status = 'running' and kind = 'generate'
           -- §397. A lock older than the reaper's timeout is a dead worker.
           and j.locked_at > now() - interval '30 minutes'
         order by locked_at desc nulls last
         limit 1
      )
      order by e.id`,
  );

  if (rows.length === 0) {
    /*
     * Nothing is running — but is anything *waiting*? A queued generate job
     * with no worker to claim it is the state that reads as "it stopped", and
     * the worker's heartbeat is the only thing that can say why.
     */
    const [pending] = await query<{ queued: string; seconds_ago: number | null }>(
      `select
         (select count(*) from jobs
           where kind = 'generate'
             and (status = 'queued'
                  or (status = 'running' and locked_at <= now() - interval '30 minutes')))::text
           as queued,
         (select extract(epoch from now() - max(last_seen_at))::int
            from worker_heartbeats) as seconds_ago`,
    );
    const queued = Number(pending?.queued ?? 0);
    if (queued > 0) {
      return idle({ queued, workerSeenSecondsAgo: pending?.seconds_ago ?? null });
    }
    return idle();
  }

  const first = rows[0]!;

  /* Which desks have produced events, and which produced the newest one. */
  const counts = new Map<string, number>();
  let latestDeskId: string | null = null;
  let latestLine: CrewLine | null = null;
  const order: string[] = [];

  for (const row of rows) {
    const desk = row.stage ? deskForStage(row.stage) : null;
    if (!desk) continue;
    counts.set(desk.id, (counts.get(desk.id) ?? 0) + 1);
    if (order[order.length - 1] !== desk.id) order.push(desk.id);
    latestDeskId = desk.id;
    latestLine = crewLine(row.message, row.detail);
  }

  /*
   * The hot wire: the last two *distinct* desks in the order they spoke. Two
   * consecutive events at the same desk are not a handoff.
   */
  const handoff: [string, string] | null =
    order.length >= 2 ? [order[order.length - 2]!, order[order.length - 1]!] : null;

  const seen = new Set(order);
  const desks: DeskLive[] = DESKS.map((desk) => {
    const events = counts.get(desk.id) ?? 0;
    const state: DeskState =
      desk.id === latestDeskId ? 'working' : seen.has(desk.id) ? 'done' : 'waiting';
    return {
      desk,
      state,
      says: desk.id === latestDeskId ? latestLine : null,
      events,
    };
  });

  /*
   * The rail. Newest first and capped — a run can log a hundred lines and the
   * rail is a thing you glance at, not a log viewer.
   */
  const feed: FeedEvent[] = rows
    /*
     * `stage opened` is structural — it exists so a desk can light up, and the
     * desk lighting up already says it. Leaving it in the rail put six near
     * identical lines in a feed of twenty-four, crowding out what was actually
     * said.
     */
    .filter((row) => row.message !== 'stage opened')
    .slice(-24)
    .reverse()
    .map((row) => {
      const desk = row.stage ? deskForStage(row.stage) : null;
      return {
        id: row.id,
        deskId: desk?.id ?? null,
        /* Unattributed lines are the run's own bookkeeping, named as such. */
        who: desk?.name ?? 'The run',
        says: crewLine(row.message, row.detail),
        at: row.at,
      };
    });

  return {
    running: true,
    waiting: null,
    making: makingFrom(first),
    jobId: first.job_id,
    startedAt: first.locked_at,
    desks,
    feed,
    handoff,
  };
}

/**
 * Today's running order, for the board on the wall.
 *
 * Its own read rather than a join onto the events, because it is about the day
 * rather than about this run — the board says the same thing whether or not
 * anything is in production, which is what makes it furniture.
 */
export async function readRundown(): Promise<RundownLine[]> {
  const rows = await query<{
    scheduled_at: string | null;
    platform: string;
    status: string;
    tz: string | null;
  }>(
    `select ci.scheduled_at, ci.platform, ci.status,
            (select operator_timezone from products order by (kind = 'product') desc limit 1) as tz
       from content_items ci
      where ci.status in ('approved','scheduled','publishing','published','awaiting_manual_publish')
        and ci.scheduled_at is not null
        and ci.scheduled_at::date = (now() at time zone 'utc')::date
      order by ci.scheduled_at
      limit 6`,
  );

  return rows.map((row) => ({
    at: row.scheduled_at
      ? formatInOperatorTz(row.scheduled_at, row.tz ?? 'UTC', 'HH:mm')
      : '—',
    platform: row.platform,
    state: row.status.replace(/_/g, ' '),
    tone:
      row.status === 'published' || row.status === 'awaiting_manual_publish'
        ? 'onair'
        : row.status === 'publishing'
          ? 'working'
          : 'ready',
  }));
}

/** What this run is making, from the job's own payload. */
function makingFrom(row: Row): string | null {
  const p = row.payload ?? {};
  const parts = [p.platform, p.format, p.subject].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}
