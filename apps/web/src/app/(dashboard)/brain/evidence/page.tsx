import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { getEvidence } from '@/lib/brainQueries';
import { getCurrentProduct } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { BrainNav } from '../BrainNav';

export const dynamic = 'force-dynamic';

/**
 * Everything that was observed, and what each observation is doing.
 *
 * The most important column is `cited by`. Evidence nobody cites was collected
 * and reasoned over to no effect — which is either a prompt that is not seeing
 * what is there, or a page with nothing on it. Both are worth knowing, and
 * neither is visible from the fact list alone.
 */
export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: requested } = await searchParams;
  const product = await getCurrentProduct(requested);
  if (!product) {
    return (
      <>
        <PageHeader title="Evidence" />
        <EmptyState title="No product connected" body="Add a product first." />
      </>
    );
  }

  const evidence = await getEvidence(product.id);
  const tz = product.operator_timezone ?? 'UTC';
  const current = evidence.filter((e) => !e.superseded);
  const uncited = current.filter((e) => e.citedBy === 0);

  return (
    <>
      <PageHeader
        title="Evidence"
        subtitle="What was actually observed, when, and from where. Facts cannot exist without it."
      />
      <BrainNav current="/brain/evidence" />

      {evidence.length === 0 ? (
        <EmptyState
          title="Nothing has been collected"
          body="The Brain refuses to hold a fact that cites no evidence — the database rejects the row — so an empty evidence store means an empty Brain, by construction rather than by coincidence."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-2xl font-semibold text-ink">{current.length}</p>
              <p className="text-sm text-muted">current observations</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-semibold text-ink">{evidence.length - current.length}</p>
              <p className="text-sm text-muted">superseded</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-semibold text-ink">{uncited.length}</p>
              <p className="text-sm text-muted">cited by nothing</p>
            </Card>
          </div>

          {uncited.length > 0 ? (
            <Card className="mb-6 border-l-2 border-l-warn p-4">
              <p className="text-sm text-ink">
                {uncited.length} observation{uncited.length === 1 ? '' : 's'} produced no fact.
              </p>
              <p className="mt-1 text-sm text-muted">
                Either the page says nothing about this product, or an agent is not seeing what is
                there. Collected-and-unused is a different problem from not-collected, and it is
                invisible from the fact list.
              </p>
            </Card>
          ) : null}

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Collected</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Cited by</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Badge tone={row.superseded ? 'neutral' : 'info'}>{row.kind}</Badge>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="truncate text-ink">{row.title ?? '—'}</p>
                      {row.sourceUrl ? (
                        <p className="truncate text-xs text-muted">{row.sourceUrl}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatInOperatorTz(row.collectedAt.toISOString(), tz)}
                      {row.superseded ? (
                        <span className="block text-xs text-warn">superseded</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {row.bodyChars.toLocaleString()} chars
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {row.citedBy === 0 ? (
                        <span className="text-warn">nothing</span>
                      ) : (
                        `${row.citedBy} fact${row.citedBy === 1 ? '' : 's'}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
