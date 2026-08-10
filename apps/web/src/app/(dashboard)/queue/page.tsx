import Link from 'next/link';
import { Badge, EmptyState, PageHeader, cx } from '@halyard/ui';
import { QueueCard } from '@/components/QueueCard';
import { QueueKeyboard } from '@/components/QueueKeyboard';
import { getProducts, getQueue } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = [
  { key: 'open', label: 'Needs you', statuses: ['pending_approval', 'failed'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['approved', 'scheduled'] },
  { key: 'failed', label: 'Failed', statuses: ['failed'] },
  { key: 'all', label: 'Everything', statuses: ['pending_approval', 'approved', 'scheduled', 'failed', 'awaiting_manual_publish'] },
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
        title="Queue"
        subtitle="Nothing reaches this screen without passing all four QC gates. Approving a description of an asset is not approval, so every preview here is the real rendered file."
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
              <ul className="space-y-4">
                {dayItems.map((item) => (
                  <QueueCard key={item.id} item={item} timeZone={timeZone} />
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
