/**
 * §388. Room 6 ▸ Performance — what the platforms reported.
 *
 * The whole screen turns on one distinction, and it is the reason gotcha 9
 * exists: **a dash is unmeasured, a zero is measured and found to be zero.**
 * Those are different facts and this room says so out loud, because a
 * dashboard full of confident zeroes is the most persuasive lie a system like
 * this can tell about itself.
 *
 * `getAnalytics` sums with `coalesce(…, 0)`, which is right for a total — the
 * sum of no rows genuinely is zero. What it cannot express is *whether anything
 * was summed*, so this page asks that separately and leads with the answer.
 */
import Link from 'next/link';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Label, Sheet } from '@halyard/ui/studio';
import { getAnalytics } from '@/lib/queries';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** A measurement, or an honest absence. Never a fabricated zero. */
function figure(value: number, measured: boolean): string {
  return measured ? value.toLocaleString() : '—';
}

export default async function Numbers() {
  const [analytics, collected] = await Promise.all([
    getAnalytics(),
    /*
     * The question `getAnalytics` cannot answer: has anything ever been
     * measured? One row in `post_metrics` is the difference between "zero
     * impressions" and "nobody has looked".
     */
    query<{ n: string }>(`select count(*)::text as n from post_metrics`),
  ]);
  const measured = Number(collected[0]?.n ?? 0) > 0;

  const cards: Array<[string, number]> = [
    ['Impressions', analytics.funnel.impressions],
    ['Link clicks', analytics.funnel.clicks],
    ['Signups', analytics.funnel.signups],
    ['Activated users', analytics.funnel.activated],
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Sheet key={label}>
            <div className="text-xs text-quiet">{label}</div>
            <div
              className={cxNum(measured)}
              title={measured ? undefined : 'Unmeasured — nothing has collected metrics yet'}
            >
              {figure(value, measured)}
            </div>
          </Sheet>
        ))}
      </div>

      {!measured ? (
        <Sheet tone="cool">
          <div className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em]">
            Nothing has published yet, so there is nothing to measure.
          </div>
          <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
            These are <b className="text-sink">absent</b> numbers, not low ones. A dash means
            unmeasured; a zero would mean measured and found to be zero, and those are different
            facts. The distinction is enforced in the query, not in the wording —{' '}
            <Link href="/gallery/onair" className="text-lit underline">On air</Link> is where the
            first measured post will appear.
          </p>
        </Sheet>
      ) : null}

      <Sheet>
        <Label>By platform</Label>
        {analytics.byPlatform.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-quiet">
            No platform has published. The table appears when the first post is collected.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left font-data text-[9px] uppercase tracking-[0.1em] text-quiet">
                  <th className="px-1 pb-2 font-medium">Platform</th>
                  <th className="px-1 pb-2 text-right font-medium">Posts</th>
                  <th className="px-1 pb-2 text-right font-medium">Impressions</th>
                  <th className="px-1 pb-2 text-right font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byPlatform.map((row) => (
                  <tr key={row.platform} className="border-t border-rule2">
                    <td className="px-1 py-2">{PLATFORM_LABELS[row.platform] ?? row.platform}</td>
                    <td className="px-1 py-2 text-right font-data tabular-nums">{row.posts}</td>
                    <td className="px-1 py-2 text-right font-data tabular-nums">
                      {figure(row.impressions, measured)}
                    </td>
                    <td className="px-1 py-2 text-right font-data tabular-nums">
                      {figure(row.link_clicks, measured)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** The big figure. Muted when it is an absence rather than a number. */
function cxNum(measured: boolean): string {
  return `font-display text-[30px] font-extrabold tracking-[-0.03em] ${
    measured ? 'text-sink' : 'text-quiet'
  }`;
}
