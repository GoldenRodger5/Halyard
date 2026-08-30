/**
 * §386. The wall.
 *
 * A gallery reads a dozen sources at once off a bank of monitors, and that is
 * the job this screen has: seventeen pieces are waiting and the operator needs
 * to see all of them, not scroll a list of them. §362 replaced a stack of
 * 25,000px cards with rows, which fixed the height; the wall fixes the
 * *comparison*, which rows still do badly — a row shows you a piece, a wall
 * shows you the batch.
 *
 * ## A dark monitor is information
 *
 * A piece that could not be made stays on the wall with an unlit picture and a
 * red lamp. Filtering failures out of the default view is how a system quietly
 * stops producing and nobody notices for a week. Clicking one says why.
 *
 * ## The picture is the real render
 *
 * v1's rule, unchanged: approving a description of an asset is not approval.
 * `preview_urls[0]` is the rendered file. Where there is none the monitor shows
 * the piece's own opening words over an unlit ground rather than a placeholder,
 * because "no render yet" and "this is what it says" are both true and the
 * second is more useful.
 */
import Link from 'next/link';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Tally, cx, tallyFor } from '@halyard/ui/studio';
import { MonitorPicture } from './MonitorPicture';
import type { QueueItem } from '@/lib/queries';

/** What the operator recognises the piece by, in the order it is worth showing. */
export function opening(item: QueueItem): string {
  return (item.title || item.artifact_headline || item.body || '').replace(/\s+/g, ' ').trim();
}

/**
 * The lamp, including the two states the row derives rather than stores.
 *
 * A piece whose render failed reads on air (red) even though its status is
 * still `pending_approval` — because red means "the thing stopping it", and
 * that is the thing stopping it.
 */
export function lampFor(item: QueueItem) {
  if (item.render_failed > 0) return tallyFor('render_failed');
  if (item.render_total > 0 && item.render_done < item.render_total) return tallyFor('rendering');
  return tallyFor(item.status);
}

export function Monitor({ item, selected }: { item: QueueItem; selected?: boolean }) {
  const picture = item.preview_urls[0];
  const lamp = lampFor(item);
  const words = opening(item);
  const failed = item.render_failed > 0 || item.status === 'failed';

  return (
    <Link
      href={`/gallery/${item.id}`}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        'group overflow-hidden rounded-[9px] border bg-[#0D1413] shadow-[0_5px_13px_-7px_rgba(0,0,0,0.4)]',
        'transition-transform duration-150 hover:-translate-y-0.5 hover:border-sink',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit',
        selected ? 'border-sink shadow-[0_0_0_2px_rgba(15,23,22,0.18),0_8px_18px_-8px_rgba(0,0,0,0.5)]' : 'border-rule2',
      )}
    >
      <div
        className={cx(
          'relative h-[78px]',
          /*
            Diagonal hatching, not flat black. An unlit monitor and a monitor
            showing black are different things, and the hatch is what a gallery
            actually shows on a dead source.
          */
          failed
            ? 'bg-[repeating-linear-gradient(45deg,#1A2422,#1A2422_5px,#141D1C_5px,#141D1C_10px)]'
            : 'bg-[#141D1C]',
        )}
      >
        <MonitorPicture
          src={picture}
          absent={failed ? 'not made' : item.render_total > 0 ? 'rendering' : 'no render'}
        />
        {words ? (
          <span
            className={cx(
              'absolute inset-x-2 bottom-[7px] font-display text-[10px] font-extrabold leading-[1.2]',
              'tracking-[-0.02em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]',
              'line-clamp-2',
            )}
          >
            {words}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 bg-[#101817] px-2 py-1.5">
        <Tally state={lamp} size={6} />
        <span className="truncate font-data text-[8px] uppercase tracking-[0.08em] text-[#7C918C]">
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </span>
      </div>
    </Link>
  );
}

export function MonitorWall({ items, selectedId }: { items: QueueItem[]; selectedId?: string }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <Monitor key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </div>
  );
}
