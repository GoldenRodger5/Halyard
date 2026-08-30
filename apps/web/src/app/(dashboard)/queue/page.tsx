import Link from 'next/link';
import { Badge, EmptyState, PageHeader, cx } from '@halyard/ui';
import { QueueRow } from '@/components/QueueRow';
import { QueueKeyboard } from '@/components/QueueKeyboard';
import { getProducts, getQueue } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * §156. Every lifecycle state is reachable from here.
 *
 * `published` and `rejected` had no tab and were absent from "Everything", so
 * the only way to see what Halyard had actually done with a post was the
 * database. A queue that cannot show you what it published is a review screen
 * with the review missing.
 */
const ALL_STATUSES = [
  'pending_approval',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'awaiting_manual_publish',
  'failed',
  'rejected',
];

const STATUS_FILTERS = [
  { key: 'open', label: 'Needs you', statuses: ['pending_approval', 'failed'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['approved', 'scheduled'] },
  { key: 'delivered', label: 'At the platform', statuses: ['awaiting_manual_publish'] },
  { key: 'published', label: 'Published', statuses: ['published'] },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'] },
  { key: 'failed', label: 'Failed', statuses: ['failed'] },
  { key: 'all', label: 'Everything', statuses: ALL_STATUSES },
];

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const filterKey = params.status ?? 'open';
  const filter = STATUS_FILTERS.find((f) => f.key === filterKey) ?? STATUS_FILTERS[0]!;

  const products = await getProducts();
  const timeZone = products[0]?.operator_timezone ?? 'UTC';
  const items = await getQueue({ status: filter.statuses, platform: params.platform });

  /*
   * The platform list is drawn from what is actually in this view rather than
   * from the seven adapters, so the filter never offers a platform with nothing
   * behind it.
   */
  const platformsHere = [...new Set(items.map((i) => i.platform))].sort();
  const allInView = await getQueue({ status: filter.statuses });
  const platformOptions = [...new Set(allInView.map((i) => i.platform))].sort();
  void platformsHere;

  // Grouped by scheduled day, then platform (v1 §8).
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.scheduled_at
      ? formatInOperatorTz(item.scheduled_at, timeZone, 'EEEE d MMMM')
      : 'Unscheduled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <>
      <PageHeader
        title="Review"
        subtitle="Nothing reaches this screen without passing all four QC gates. Approving a description of an asset is not approval, so every preview here is the real rendered file. Open a piece to edit, reschedule or regenerate it."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={`/queue?status=${option.key}`}
            className={cx(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              option.key === filterKey
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-line text-muted hover:bg-sunk hover:text-ink',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {platformOptions.length > 1 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Platform</span>
          <Link
            href={`/queue?status=${filterKey}`}
            className={cx(
              'rounded-lg border px-2.5 py-1 text-sm transition-colors',
              !params.platform
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-line text-muted hover:bg-sunk hover:text-ink',
            )}
          >
            All
          </Link>
          {platformOptions.map((platform) => (
            <Link
              key={platform}
              href={`/queue?status=${filterKey}&platform=${platform}`}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-sm transition-colors',
                params.platform === platform
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-line text-muted hover:bg-sunk hover:text-ink',
              )}
            >
              {platform}
            </Link>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={filterKey === 'open' ? 'Nothing waiting on you' : 'Nothing here'}
          body={
            filterKey === 'open' ? (
              <>
                The daily generation job produces drafts and holds them here. If you expected
                something, check that the first-run wizard is complete and that the worker is
                running — the health page shows both.
              </>
            ) : (
              <>No items match this filter.</>
            )
          }
          action={
            <Link href="/settings/health" className="text-sm text-primary underline">
              Health
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([day, dayItems]) => (
            <section key={day}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="font-serif text-2xl text-ink">{day}</h2>
                <Badge tone="neutral">{dayItems.length}</Badge>
              </div>
              {/*
                §362. Rows, not cards. Seventeen expanded cards made this page
                twenty-five thousand pixels tall, which is not a review screen.
                The full card lives on `/queue/[id]`, which already renders it.
              */}
              <ul className="border-t border-line">
                {dayItems.map((item) => (
                  <QueueRow key={item.id} item={item} timeZone={timeZone} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <QueueKeyboard ids={items.map((item) => item.id)} />
    </>
  );
}
