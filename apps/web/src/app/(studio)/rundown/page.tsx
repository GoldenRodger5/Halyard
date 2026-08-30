/**
 * §388. Room 4 ▸ This week — the running order, by the clock.
 *
 * The gaps are the point. A calendar that only shows what exists cannot tell
 * you Friday morning has nothing in it, and an operator finding that out on
 * Friday morning is finding out too late.
 *
 * An empty slot is *offered*, never filled quietly — the same rule as
 * everywhere else in this system. Filling it is a brief, and a brief is a
 * decision a person makes.
 */
import Link from 'next/link';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Label, Sheet, Tally, cx, tallyFor } from '@halyard/ui/studio';
import { readRundown } from '@/lib/studio/rundown';

export const dynamic = 'force-dynamic';

export default async function Rundown() {
  const { days, timeZone } = await readRundown();

  if (days.length === 0) {
    return (
      <Sheet tone="cool">
        <Label>Nothing in the week</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          Nothing is scheduled and no slot is configured, so there is nothing to run. Slots come
          from the scheduler; a platform with no account has none.{' '}
          <Link href="/master" className="text-lit underline">The rig</Link> shows what is
          connected.
        </p>
      </Sheet>
    );
  }

  const scheduled = days.reduce((n, d) => n + d.entries.length, 0);

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.label}>
          <Label>{day.label}</Label>
          <Sheet className="!px-4 !py-1">
            {day.entries.map((entry, i) => (
              <div
                key={`${entry.atIso}-${i}`}
                className="flex items-center gap-3 border-b border-rule2 py-2.5 last:border-b-0"
              >
                <span className="w-[46px] shrink-0 font-data text-xs text-quiet">{entry.at}</span>
                <span
                  aria-hidden
                  className={cx(
                    'h-8 w-[3px] shrink-0 rounded-sm',
                    entry.status === 'publishing' || entry.status === 'failed'
                      ? 'bg-lit'
                      : 'bg-passed',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/gallery/${entry.id}`}
                    className="line-clamp-1 block text-[13px] hover:text-lit"
                  >
                    {entry.title || <span className="text-quiet">No text yet.</span>}
                  </Link>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-quiet">
                    <Tally state={tallyFor(entry.status ?? '')} on="light" size={6} />
                    {PLATFORM_LABELS[entry.platform] ?? entry.platform} ·{' '}
                    {entry.detail?.split(' · ').slice(1).join(' · ')}
                  </span>
                </span>
              </div>
            ))}

            {/*
              The gaps, as one line. Twenty-eight openings a day listed
              individually is a page of one repeated sentence; what an operator
              needs is how much of the day is uncommissioned and where.
            */}
            {day.open.count > 0 ? (
              <div className="flex items-center gap-3 border-t border-rule2 py-2.5">
                <span className="w-[46px] shrink-0 font-data text-xs text-quiet">—</span>
                <span
                  aria-hidden
                  className="h-8 w-[3px] shrink-0 rounded-sm bg-[repeating-linear-gradient(180deg,var(--color-rule2),var(--color-rule2)_3px,transparent_3px,transparent_6px)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-quiet">
                    {day.open.count} {day.open.count === 1 ? 'slot' : 'slots'} open
                    {day.entries.length === 0 ? ' — nothing commissioned today' : ''}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-quiet">
                    {day.open.platforms
                      .map((p) => PLATFORM_LABELS[p] ?? p)
                      .join(' · ')}
                  </span>
                </span>
                <Link
                  href="/floor"
                  className="shrink-0 rounded-lg border border-rule2 px-2.5 py-1.5 text-[11px] text-quiet transition-colors hover:border-sink hover:text-sink"
                >
                  Fill one
                </Link>
              </div>
            ) : null}
          </Sheet>
        </section>
      ))}

      <p className="text-xs leading-relaxed text-quiet">
        Times are {timeZone}. A slot is a window the scheduler jitters inside, so nothing posts on
        the exact hour — the time shown is the middle of the window, not a promise.{' '}
        {scheduled === 0
          ? 'Nothing is scheduled this week. That is what an empty rundown looks like, and it is not the same as nothing being made — the Gallery holds what is waiting on you.'
          : 'An empty slot is offered, never filled quietly.'}
      </p>
    </div>
  );
}
