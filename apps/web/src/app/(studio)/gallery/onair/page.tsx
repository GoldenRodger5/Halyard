/**
 * §386. Gallery ▸ On air — what published, and how it did.
 *
 * §156's finding, kept: `published` had no tab anywhere, so the only way to see
 * what Halyard had actually done with a post was the database. A queue that
 * cannot show you what it published is a review screen with the review missing.
 *
 * ## A dash is not a zero
 *
 * Every number here is nullable to the pixel. `—` means nobody has collected
 * metrics for this post; `0` means a platform was asked and reported nothing.
 * Gotcha 9 — and the reason `getOnAir` refuses to coalesce.
 */
import Link from 'next/link';
import { Label, Sheet, Tally, tallyFor } from '@halyard/ui/studio';
import { PLATFORM_LABELS } from '@halyard/ui';
import { getOnAir, getProducts } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** A measurement, or an honest absence. Never a fabricated zero. */
function metric(n: number | null): string {
  return n === null ? '—' : n.toLocaleString();
}

export default async function GalleryOnAir() {
  const [products, items] = await Promise.all([getProducts(), getOnAir()]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  if (items.length === 0) {
    return (
      <Sheet tone="cool">
        <Label>Nothing has published</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          Halyard has not published anything yet. That is the expected state until an account is
          connected and something has been approved —{' '}
          <Link href="/master" className="text-lit underline">the rig</Link> shows what is
          connected.
        </p>
      </Sheet>
    );
  }

  const unmeasured = items.filter((i) => i.collected_at === null).length;

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet>
        <Label>{items.length} published</Label>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left font-data text-[9px] uppercase tracking-[0.1em] text-quiet">
                <th className="px-1 pb-2 font-medium">Piece</th>
                <th className="px-1 pb-2 font-medium">Where</th>
                <th className="px-1 pb-2 font-medium">When</th>
                <th className="px-1 pb-2 text-right font-medium tabular-nums">Impressions</th>
                <th className="px-1 pb-2 text-right font-medium tabular-nums">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-rule2 align-top">
                  <td className="px-1 py-2">
                    <Link href={`/gallery/${item.id}`} className="flex items-start gap-2 hover:text-lit">
                      <Tally state={tallyFor(item.status)} on="light" size={7} />
                      <span className="line-clamp-2 min-w-0 leading-snug">
                        {(item.title || item.artifact_headline || item.body || '').slice(0, 110)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-1 py-2 font-data text-[10px] uppercase tracking-[0.06em] text-quiet">
                    {item.permalink ? (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline decoration-rule2 hover:text-lit"
                      >
                        {PLATFORM_LABELS[item.platform] ?? item.platform}
                      </a>
                    ) : (
                      (PLATFORM_LABELS[item.platform] ?? item.platform)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-1 py-2 font-data text-[10px] text-quiet">
                    {item.published_at
                      ? formatInOperatorTz(item.published_at, timeZone, 'd MMM, HH:mm')
                      : '—'}
                  </td>
                  <td className="px-1 py-2 text-right font-data text-[11px] tabular-nums">
                    {metric(item.impressions)}
                  </td>
                  <td className="px-1 py-2 text-right font-data text-[11px] tabular-nums">
                    {metric(item.link_clicks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>

      {unmeasured > 0 ? (
        <p className="text-xs leading-relaxed text-quiet">
          A dash is not a zero. {unmeasured} of these have never been measured — nothing has
          collected metrics for them yet, which is different from a platform reporting nothing.
        </p>
      ) : null}
    </div>
  );
}
