/**
 * §387. Room 2 ▸ Live — watch the team work.
 *
 * Rendered on the server so the room is populated on first paint, then handed
 * to a client component that polls. An empty room that fills in a second later
 * is a worse first impression than a room that is simply already there.
 */
import Link from 'next/link';
import { Sheet } from '@halyard/ui/studio';
import { FloorRoom } from '@/components/studio/FloorRoom';
import { readLive, readRundown } from '@/lib/studio/live';

export const dynamic = 'force-dynamic';

export default async function FloorLive() {
  const [live, rundown] = await Promise.all([readLive(), readRundown()]);

  return (
    <div className="flex flex-col gap-3.5">
      <FloorRoom initial={live} rundown={rundown} />

      {!live.running ? (
        <Sheet tone="cool">
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            The room is idle, which is the normal state most of the day — Halyard works in
            bursts. <Link href="/floor" className="text-lit underline">Brief the floor</Link> to
            start something now, or wait for the daily run.
          </p>
        </Sheet>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
