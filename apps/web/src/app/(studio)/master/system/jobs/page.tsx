import { Badge, Card, PageHeader } from '@halyard/ui';
import { JOB_KINDS } from '@halyard/db';
import { getJobKinds } from '@/lib/agentQueries';
import { getProducts } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Every declared job kind against what has actually run.
 *
 * Listing from `JOB_KINDS` rather than from the jobs table is deliberate: a
 * kind that has never been enqueued would be invisible in a table-driven list,
 * and a declared kind that never runs is precisely the thing worth seeing.
 */
export default async function SystemJobsPage() {
  const [rows, products] = await Promise.all([getJobKinds(), getProducts()]);
  const tz = products[0]?.operator_timezone ?? 'UTC';
  const byKind = new Map(rows.map((r) => [r.kind, r]));

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Every declared job kind, and whether anything has run it."
      />

      <Card className="divide-y divide-line">
          {JOB_KINDS.map((kind) => {
            const row = byKind.get(kind);
            const ran = row && row.runs24h > 0;
            return (
              <div key={kind} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <div>
                  <p className="font-medium text-ink">{kind}</p>
                  <p className="text-sm text-muted">
                    {row
                      ? `${row.runs24h} run(s) in 24h${row.failed24h > 0 ? `, ${row.failed24h} failed` : ''}`
                      : 'never enqueued'}
                    {row?.lastRunAt ? ` · last ${formatInOperatorTz(row.lastRunAt, tz)}` : ''}
                  </p>
                </div>
                <Badge tone={ran ? 'good' : row ? 'neutral' : 'warn'}>
                  {ran ? 'active' : row ? 'idle' : 'never run'}
                </Badge>
              </div>
            );
          })}
      </Card>
    </>
  );
}
