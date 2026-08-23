import { Badge, Card, EmptyState, PLATFORM_LABELS, PageHeader, PlatformDot } from '@halyard/ui';
import { getLibrary, getProducts } from '@/lib/queries';
import { formatInOperatorTz, formatNumber, truncate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const [rows, products] = await Promise.all([getLibrary(), getProducts()]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  return (
    <>
      <PageHeader
        title="Library"
        subtitle="Everything published, with the metric that actually matters last. Activated users, not impressions, is what decides strategy."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing published yet"
          body="Published posts land here with their metric time series. X is the platform with no review gate, so it is where the first real post usually happens."
        />
      ) : (
        <Card className="overflow-x-auto" scrollLabel="Library items">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-muted">
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 text-right font-medium">Impressions</th>
                <th className="px-4 py-3 text-right font-medium">Clicks</th>
                <th className="px-4 py-3 text-right font-medium">Activated</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-sunk/40">
                  <td className="max-w-md px-4 py-3">
                    <p className="leading-snug text-ink">{truncate(row.body, 110)}</p>
                    <div className="mt-1 flex gap-2">
                      <Badge tone="neutral">{row.category}</Badge>
                      <Badge tone="neutral">{row.format}</Badge>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <PlatformDot platform={row.platform} />
                      {PLATFORM_LABELS[row.platform] ?? row.platform}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatInOperatorTz(row.published_at, timeZone, 'd MMM HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {formatNumber(row.impressions)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {formatNumber(row.link_clicks)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                    {formatNumber(row.activated_users)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.score === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={row.low_confidence ? 'text-muted' : 'text-ink'}
                        title={row.low_confidence ? 'Under 1,000 impressions. Low confidence.' : undefined}
                      >
                        {Number(row.score).toFixed(2)}
                        {row.low_confidence ? ' ?' : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
