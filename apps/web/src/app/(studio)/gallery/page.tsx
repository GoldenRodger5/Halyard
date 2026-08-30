/**
 * §386. Room 3 — the Gallery, Holding.
 *
 * Everything waiting on a decision, shown as a wall rather than a list. The
 * reasoning for the wall is in `MonitorWall.tsx`; the reasoning for what is on
 * it is here.
 *
 * ## Failed pieces are on the wall by default
 *
 * The old queue defaulted to "Needs you", which included `failed` — correct,
 * and kept. What is new is that a failure is *visible as a failure* from across
 * the room rather than as a red word in a row, because twenty of them is a
 * signal about the system and not about twenty pieces.
 */
import Link from 'next/link';
import { Label, Sheet, cx } from '@halyard/ui/studio';
import { PLATFORM_LABELS } from '@halyard/ui';
import { MonitorWall } from '@/components/studio/MonitorWall';
import { getProducts, getQueue } from '@/lib/queries';
import { whenMs } from '@/lib/format';
import { GalleryKeys } from '@/components/studio/GalleryKeys';

export const dynamic = 'force-dynamic';

/**
 * The three views, and what each one is *for*.
 *
 * Deliberately fewer than the old queue's seven. Scheduled and On air have
 * their own tabs now, so the filters here are only about the holding room:
 * what needs you, what broke, and everything so nothing is unreachable.
 */
const VIEWS = [
  { key: 'holding', label: 'Holding', statuses: ['pending_approval'] },
  { key: 'failed', label: 'Failed', statuses: ['failed'] },
  {
    key: 'all',
    label: 'Everything',
    statuses: ['pending_approval', 'failed', 'approved', 'scheduled', 'publishing',
               'published', 'awaiting_manual_publish', 'rejected'],
  },
];

export default async function GalleryHolding({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const view = VIEWS.find((v) => v.key === params.view) ?? VIEWS[0]!;

  const [products, items, unfiltered] = await Promise.all([
    getProducts(),
    getQueue({ status: view.statuses, platform: params.platform }),
    getQueue({ status: view.statuses }),
  ]);
  void products;

  /*
   * Counts come from their own query rather than from `items`, so the chip for
   * a view you are not looking at still says how many are behind it. A chip
   * that reads 0 because of the current filter would be a lie about the room.
   */
  const [holdingAll, failedAll] = await Promise.all([
    getQueue({ status: ['pending_approval'] }),
    getQueue({ status: ['failed'] }),
  ]);
  const counts: Record<string, number> = {
    holding: holdingAll.length,
    failed: failedAll.length,
    /* Everything had no count and read as an empty option. */
    all: unfiltered.length,
  };

  /*
   * §393. Oldest first while triaging.
   *
   * `getQueue` sorts newest-first, which is right for a feed and wrong for a
   * queue: the oldest piece can sit for a fortnight while every new one lands
   * above it. Sorted here rather than in the shared query, because the other
   * callers genuinely do want newest-first.
   */
  const wall =
    view.key === 'holding'
      ? [...items].sort((a, b) => whenMs(a.created_at) - whenMs(b.created_at))
      : items;

  /* Only platforms actually present, so no chip leads to an empty wall. */
  const platforms = [...new Set(unfiltered.map((i) => i.platform))].sort();
  const href = (v: string, p?: string) =>
    `/gallery?view=${v}${p ? `&platform=${p}` : ''}`;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key, params.platform)}
            className={cx(
              'rounded-[7px] border px-2.5 py-[5px] text-xs transition-colors',
              v.key === view.key
                ? 'border-sink bg-sink text-white'
                : 'border-rule2 bg-sheet text-quiet hover:border-sink hover:text-sink',
            )}
          >
            {v.label}
            {counts[v.key] ? (
              <b className="ml-1.5 font-data text-[10px] font-medium">{counts[v.key]}</b>
            ) : null}
          </Link>
        ))}

        <span className="flex-1" />

        {platforms.length > 1
          ? [undefined, ...platforms].map((p) => (
              <Link
                key={p ?? 'all'}
                href={href(view.key, p)}
                className={cx(
                  'rounded-[7px] border px-2.5 py-[5px] text-xs transition-colors',
                  params.platform === p
                    ? 'border-sink bg-sink text-white'
                    : 'border-rule2 bg-sheet text-quiet hover:border-sink hover:text-sink',
                )}
              >
                {p ? (PLATFORM_LABELS[p] ?? p) : 'All'}
              </Link>
            ))
          : null}
      </div>

      {items.length === 0 ? (
        <Sheet tone="cool">
          <Label>Nothing on the wall</Label>
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            {view.key === 'holding' ? (
              <>
                Nothing is waiting on you. The daily generation job fills this room; if you
                expected something, the first run may not be finished, or the worker may not be
                up. <Link href="/master/system" className="text-lit underline">Master Control</Link>{' '}
                shows both.
              </>
            ) : (
              <>Nothing matches this view.</>
            )}
          </p>
        </Sheet>
      ) : (
        <>
          <MonitorWall items={wall} />
          <p className="text-xs leading-relaxed text-quiet">
            A dark monitor with a red lamp is a piece that could not be made. It stays on the
            wall — opening it says why in a sentence.
          </p>
        </>
      )}

      <GalleryKeys ids={wall.map((i) => i.id)} />
    </div>
  );
}
