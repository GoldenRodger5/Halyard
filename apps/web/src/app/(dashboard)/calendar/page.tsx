import Link from 'next/link';
import { Badge, Card, EmptyState, PLATFORM_LABELS, PageHeader, PlatformDot } from '@halyard/ui';
import { densityWarnings } from '@halyard/core';
import { getCalendar, getProducts } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const products = await getProducts();
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  const from = new Date(Date.now() - 2 * 86_400_000);
  const to = new Date(Date.now() + 12 * 86_400_000);
  const items = await getCalendar(from.toISOString(), to.toISOString());

  const warnings = densityWarnings(
    items.map((i) => ({
      id: i.id,
      platform: i.platform,
      persona: i.persona as 'founder' | 'brand',
      scheduledAt: new Date(i.scheduled_at),
    })),
  );

  const days = new Map<string, typeof items>();
  for (let offset = -2; offset <= 12; offset++) {
    const day = new Date(Date.now() + offset * 86_400_000);
    days.set(formatInOperatorTz(day.toISOString(), timeZone, 'yyyy-MM-dd'), []);
  }
  for (const item of items) {
    const key = formatInOperatorTz(item.scheduled_at, timeZone, 'yyyy-MM-dd');
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(item);
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`Two weeks, in ${timeZone}. Slots resolve against the audience timezone (${products[0]?.audience_timezone ?? 'unset'}), so an 18:00 evening slot stays 18:00 across a DST change.`}
      />

      {warnings.length > 0 ? (
        <Card className="mb-6 border-warn/40 bg-warn/10 p-4">
          <p className="text-sm font-semibold text-ink">Density warnings</p>
          <ul className="mt-2 space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-muted">
                {w.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="Approved items get a slot inside their window, jittered by up to seven minutes so nothing posts on the exact hour."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...days.entries()].map(([day, dayItems]) => {
            const isToday = day === formatInOperatorTz(new Date().toISOString(), timeZone, 'yyyy-MM-dd');
            return (
              <Card
                key={day}
                className={`min-h-[9rem] p-3 ${isToday ? 'border-primary/50 bg-primary/5' : ''}`}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  {formatInOperatorTz(`${day}T12:00:00Z`, 'UTC', 'EEE d MMM')}
                  {isToday ? ' · today' : ''}
                </p>
                <ul className="space-y-1.5">
                  {dayItems.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/queue/${item.id}`}
                        className="flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-sunk"
                      >
                        <PlatformDot platform={item.platform} className="mt-1.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] text-muted">
                            {formatInOperatorTz(item.scheduled_at, timeZone, 'HH:mm')} ·{' '}
                            {PLATFORM_LABELS[item.platform] ?? item.platform}
                          </span>
                          <span className="line-clamp-2 text-xs leading-snug text-ink">
                            {item.body.slice(0, 70)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                  {dayItems.length === 0 ? (
                    <li className="text-xs text-muted">nothing</li>
                  ) : null}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {Object.entries(PLATFORM_LABELS).map(([platform, label]) => (
          <Badge key={platform} tone="neutral">
            <PlatformDot platform={platform} /> {label}
          </Badge>
        ))}
      </div>
    </>
  );
}
