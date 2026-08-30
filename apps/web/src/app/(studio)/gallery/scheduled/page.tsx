/**
 * §386. Gallery ▸ Scheduled — approved, waiting for a slot.
 *
 * A separate tab rather than a filter on the wall, because these need a
 * different question answered. On the wall the question is "which of these do I
 * want"; here it is "when is this going out, and is that right" — which is a
 * question about *order*, so this is a list by time and not a grid.
 *
 * The Rundown answers the same question across a week. This is the subset that
 * has already been approved, which is the one an operator second-guesses.
 */
import Link from 'next/link';
import { Label, Sheet, Tally } from '@halyard/ui/studio';
import { PLATFORM_LABELS } from '@halyard/ui';
import { lampFor, opening } from '@/components/studio/MonitorWall';
import { getProducts, getQueue } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function GalleryScheduled() {
  const [products, items] = await Promise.all([
    getProducts(),
    getQueue({ status: ['approved', 'scheduled', 'publishing'] }),
  ]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  if (items.length === 0) {
    return (
      <Sheet tone="cool">
        <Label>Nothing scheduled</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          Nothing has been approved and is waiting for a slot.{' '}
          <Link href="/gallery" className="text-lit underline">The wall</Link> is where things
          get approved.
        </p>
      </Sheet>
    );
  }

  /* Grouped by the day it goes out, in the operator's timezone. */
  const days = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.scheduled_at
      ? formatInOperatorTz(item.scheduled_at, timeZone, 'EEEE d MMMM')
      : 'No slot yet';
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(item);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...days.entries()].map(([day, list]) => (
        <Sheet key={day}>
          <Label>
            {day} · {list.length}
          </Label>
          <ul className="flex flex-col">
            {list.map((item) => (
              <li key={item.id} className="border-t border-rule2 first:border-t-0">
                <Link
                  href={`/gallery/${item.id}`}
                  className="flex items-start gap-2.5 py-2.5 transition-colors hover:text-lit"
                >
                  <Tally state={lampFor(item)} on="light" size={7} />
                  <span className="w-[52px] shrink-0 font-data text-[10px] text-quiet">
                    {item.scheduled_at
                      ? formatInOperatorTz(item.scheduled_at, timeZone, 'HH:mm')
                      : '—'}
                  </span>
                  <span className="w-[68px] shrink-0 font-data text-[9px] uppercase tracking-[0.07em] text-quiet">
                    {PLATFORM_LABELS[item.platform] ?? item.platform}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">{opening(item)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      ))}
    </div>
  );
}
