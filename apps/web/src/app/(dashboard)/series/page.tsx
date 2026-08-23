import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz, truncate } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface SeriesRow {
  id: string;
  name: string;
  description: string | null;
  cadence: string | null;
  next_sequence: number;
  active: boolean;
  published: string;
  pending: string;
  last_published_at: string | null;
}

interface EntryRow {
  id: string;
  series_id: string;
  sequence_number: number | null;
  body: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
}

/**
 * Series. Milestone 43, item 3.
 *
 * A series is a promise to keep going — "part 4 of 6" tells a reader there will
 * be a part 5. The thing worth seeing here is therefore not the list but the
 * gap: which series have stalled, and what number comes next.
 */
export default async function SeriesPage() {
  const product = await getCurrentProduct();
  const timeZone = product?.operator_timezone ?? 'UTC';

  const [series, entries] = await Promise.all([
    query<SeriesRow>(
      `select s.*,
              (select count(*) from content_items ci
                where ci.series_id = s.id and ci.status = 'published') as published,
              (select count(*) from content_items ci
                where ci.series_id = s.id and ci.status not in ('published','rejected','archived'))
                as pending,
              (select max(published_at) from content_items ci where ci.series_id = s.id)
                as last_published_at
         from series s
        where s.product_id = $1
        order by s.active desc, s.created_at desc`,
      [product?.id ?? 'recipefix'],
    ),
    query<EntryRow>(
      `select ci.id, ci.series_id, ci.sequence_number, ci.body, ci.status,
              ci.scheduled_at, ci.published_at
         from content_items ci
         join series s on s.id = ci.series_id
        where s.product_id = $1
        order by ci.series_id, ci.sequence_number nulls last`,
      [product?.id ?? 'recipefix'],
    ),
  ]);

  const stalledAfterDays = 21;

  return (
    <>
      <PageHeader
        title="Series"
        subtitle="A numbered series is a promise. The number tells a reader there is a next one, so an abandoned series costs more than never starting it."
      />

      {/*
        Honest about what this screen can and cannot do.

        `series` has a detailed schema — cadence, next_sequence, template — a
        page that reads it, and a `utm_term` in attribution built from the
        series name. It has no producer: nothing creates a series and nothing
        sets `content_items.series_id`, so every row visible here came from
        `supabase/seed.sql`.

        Campaigns are the built version of the same idea and are not going to be
        duplicated here — see `DECISIONS.md` §128.
      */}
      <Card className="mb-6 border-l-2 border-l-warn p-4">
        <p className="text-sm leading-relaxed text-ink">
          Series cannot be created yet. Anything listed below came with the
          starter data, and nothing assigns a post to a series.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A <a className="text-primary underline" href="/campaigns">campaign</a> does
          the same job today: a named run over a window, with slots that generate
          and publish on a schedule. Series would add open-ended numbering on top
          of that, and whether it is worth having is an open decision rather than
          missing work.
        </p>
      </Card>

      {series.length === 0 ? (
        <EmptyState
          title="No series yet"
          body="A series groups posts that share a shape and a sequence — a six-part carousel run, a weekly teardown. Ideas become series when the same structure keeps earning."
        />
      ) : (
        <div className="space-y-4">
          {series.map((row) => {
            const mine = entries.filter((e) => e.series_id === row.id);
            const stalled =
              row.active &&
              row.last_published_at !== null &&
              Date.now() - new Date(row.last_published_at).getTime() >
                stalledAfterDays * 86_400_000 &&
              Number(row.pending) === 0;

            return (
              <Card key={row.id} className={`p-4 ${stalled ? 'border-warn/40 bg-warn/5' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{row.name}</span>
                      <Badge tone={row.active ? 'good' : 'neutral'}>
                        {row.active ? 'active' : 'ended'}
                      </Badge>
                      {row.cadence ? <Badge tone="neutral">{row.cadence}</Badge> : null}
                      {stalled ? <Badge tone="warn">stalled</Badge> : null}
                    </div>
                    {row.description ? (
                      <p className="mt-1 text-sm text-muted">{row.description}</p>
                    ) : null}
                    <p className="mt-1.5 text-xs text-muted">
                      {row.published} published · {row.pending} in the queue · next number is{' '}
                      {row.next_sequence}
                      {row.last_published_at
                        ? ` · last out ${formatInOperatorTz(row.last_published_at, timeZone, 'd MMM')}`
                        : ''}
                    </p>
                    {stalled ? (
                      <p className="mt-2 text-sm text-ink">
                        Nothing published for over {stalledAfterDays} days and nothing queued.
                        Readers who saw part {Number(row.published)} are still waiting for the next
                        one — either continue it or mark it ended.
                      </p>
                    ) : null}
                  </div>
                </div>

                {mine.length > 0 ? (
                  <ol className="mt-3 space-y-1 border-t border-line pt-3">
                    {mine.map((entry) => (
                      <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                        <span className="w-10 shrink-0 tabular-nums text-muted">
                          {entry.sequence_number ?? '—'}
                        </span>
                        <Link
                          href={`/queue/${entry.id}`}
                          className="min-w-0 flex-1 truncate text-ink hover:underline"
                        >
                          {truncate(entry.body || 'not written yet', 90)}
                        </Link>
                        <Badge tone={entry.status === 'published' ? 'good' : 'neutral'}>
                          {entry.status.replace(/_/g, ' ')}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
