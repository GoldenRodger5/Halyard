/**
 * §388. Rundown ▸ Series — recurring shapes with their own cadence.
 *
 * A series is a promise to an audience: the same shape, on the same day, so it
 * becomes something people look for. `next_sequence` is the count of how many
 * have gone out, which is the only honest measure of whether the promise is
 * being kept.
 */
import Link from 'next/link';
import { Label, Sheet } from '@halyard/ui/studio';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SeriesRow {
  id: string;
  name: string;
  description: string | null;
  cadence: string | null;
  next_sequence: number;
  active: boolean;
  /** How many pieces actually carry this series. */
  made: number;
  /** How many are still ahead of the slot they are for. */
  ahead: number;
}

export default async function Series() {
  const product = await getCurrentProduct();

  const rows = await query<SeriesRow>(
    `select s.id, s.name, s.description, s.cadence, s.next_sequence, s.active,
            (select count(*)::int from content_items ci where ci.series_id = s.id) as made,
            (select count(*)::int from content_items ci
              where ci.series_id = s.id
                and ci.status in ('approved','scheduled')) as ahead
       from series s
      where ($1::text is null or s.product_id = $1)
      order by s.active desc, s.name`,
    [product?.id ?? null],
  );

  if (rows.length === 0) {
    return (
      <Sheet tone="cool">
        <Label>No series</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          A series is a recurring shape — the same kind of piece, on the same day, so it becomes
          something people look for. Nothing has one yet, which is fine: a series only earns its
          place once there is a shape worth repeating.
        </p>
      </Sheet>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet>
        <Label>Recurring shapes with their own cadence</Label>
        <ul className="flex flex-col">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-start gap-3 border-t border-rule2 py-3 first:border-t-0 first:pt-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{s.name}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-quiet">
                  {[s.cadence, s.description].filter(Boolean).join(' · ') || 'No cadence set'}
                </span>
              </span>
              <span className="shrink-0 text-right text-[12px] text-quiet">
                {/*
                  Made and ahead, not "on track". Whether a cadence is being kept
                  needs a slot calendar to compare against, and claiming it
                  without one would be an unmeasured judgement.
                */}
                {s.made} made
                {s.ahead > 0 ? `, ${s.ahead} ahead` : ''}
                {!s.active ? <span className="ml-2 text-parked">paused</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Sheet>
      <p className="text-xs leading-relaxed text-quiet">
        A series is a promise to an audience. Breaking it quietly is worse than never making it —{' '}
        <Link href="/floor" className="text-lit underline">the floor</Link> is where the next one
        gets briefed.
      </p>
    </div>
  );
}
