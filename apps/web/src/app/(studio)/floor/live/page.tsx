/**
 * §387. Room 2 ▸ Live — watch the team work.
 *
 * Rendered on the server so the room is populated on first paint, then handed
 * to a client component that polls. An empty room that fills in a second later
 * is a worse first impression than a room that is simply already there.
 */
import Link from 'next/link';
import { Label, Sheet } from '@halyard/ui/studio';
import { FloorRoom } from '@/components/studio/FloorRoom';
import { readLive, readRundown } from '@/lib/studio/live';

export const dynamic = 'force-dynamic';

export default async function FloorLive() {
  const [live, rundown] = await Promise.all([readLive(), readRundown()]);

  return (
    <div className="flex flex-col gap-3.5">
      <FloorRoom initial={live} rundown={rundown} />

      {/*
        §397. Waiting is not idle, and saying "idle" while a brief sits in the
        queue is what makes the floor look like it started and stopped. The
        worker's heartbeat is the only thing that can say why nothing is
        happening, so it is said here rather than left to be discovered.
      */}
      {live.waiting ? (
        <Sheet tone="lit">
          <Label>Briefed, and nothing has picked it up</Label>
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            {live.waiting.queued} {live.waiting.queued === 1 ? 'brief is' : 'briefs are'} queued.{' '}
            {live.waiting.workerSeenSecondsAgo === null ? (
              <>
                <b className="text-sink">No worker has ever checked in</b>, so nothing is going to
                claim them. The worker is the process that does the making — the web app only ever
                writes the job.
              </>
            ) : live.waiting.workerSeenSecondsAgo > 300 ? (
              <>
                The worker was last seen{' '}
                <b className="text-sink">{describeAgo(live.waiting.workerSeenSecondsAgo)}</b> ago,
                so it is not running and nothing will claim them. Start it with{' '}
                <code className="font-data text-[12px]">./scripts/halyard --worker</code>.
              </>
            ) : (
              <>The worker is alive and should claim them within a few seconds.</>
            )}
          </p>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-quiet">
            Nothing is lost. A queued job waits, and starting the worker picks it up where it is.
          </p>
        </Sheet>
      ) : !live.running ? (
        <Sheet tone="cool">
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            The room is idle, which is the normal state most of the day — Halyard works in
            bursts. <Link href="/floor" className="text-lit underline">Brief the floor</Link> to
            start something now, or wait for the daily run.
          </p>
        </Sheet>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/*
          The run's own page: every event in order, rather than the newest
          twenty-four the rail holds. Shown only while there is a run, because
          a link to a job that does not exist is worse than no link.
        */}
        {live.jobId ? (
          <Link
            href={`/floor/live/run/${live.jobId}`}
            className="rounded-lg border border-rule2 px-3.5 py-[7px] text-xs text-quiet transition-colors hover:border-sink hover:text-sink"
          >
            The whole run →
          </Link>
        ) : null}
        <Link
          href="/floor"
          className="rounded-lg border border-rule2 px-3.5 py-[7px] text-xs text-quiet transition-colors hover:border-sink hover:text-sink"
        >
          ← Brief another
        </Link>
        <Link
          href="/gallery"
          className="rounded-lg bg-sink px-3.5 py-[7px] text-xs text-white shadow-[0_5px_12px_-5px_rgba(15,23,22,0.65)]"
        >
          See it in the Gallery →
        </Link>
      </div>
    </div>
  );
}

/** How long ago, in the largest unit that is still true. */
function describeAgo(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86_400)} days`;
}
