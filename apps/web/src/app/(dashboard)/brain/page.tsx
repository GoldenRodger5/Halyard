import Link from 'next/link';
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getBrainJobs, getCategorySummary, getFacts } from '@/lib/brainQueries';
import { getCurrentProduct } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { BrainNav, FactConfidence } from './BrainNav';
import { collectEvidence, rebuildBrain } from './actions';

export const dynamic = 'force-dynamic';

export default async function BrainPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: requested } = await searchParams;
  const product = await getCurrentProduct(requested);

  if (!product) {
    return (
      <>
        <PageHeader title="Product Brain" />
        <EmptyState
          title="No product connected"
          body="A Product Brain is an understanding of a specific product. Add one first."
          action={
            <Link href="/products/new" className="text-sm underline">
              Add a product
            </Link>
          }
        />
      </>
    );
  }

  const [summary, facts, jobs] = await Promise.all([
    getCategorySummary(product.id),
    getFacts(product.id),
    getBrainJobs(product.id),
  ]);

  const tz = product.operator_timezone ?? 'UTC';
  const verified = facts.filter((f) => f.status === 'verified' && !f.stale).length;
  const contradicted = facts.filter((f) => f.contradicts !== null).length;
  const populated = summary.filter((s) => s.total > 0);
  const unreachable = summary.filter((s) => !s.reachable);
  const running = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const failed = jobs.filter((j) => j.status === 'failed');

  return (
    <>
      <PageHeader
        title={`${product.name} Brain`}
        subtitle="What Halyard knows about this product, and what each thing rests on."
        actions={
          <div className="flex gap-2">
            <form action={collectEvidence}>
              <input type="hidden" name="productId" value={product.id} />
              <Button type="submit" variant="secondary">
                Collect evidence
              </Button>
            </form>
            <form action={rebuildBrain}>
              <input type="hidden" name="productId" value={product.id} />
              <Button type="submit" variant="secondary">
                Rebuild from evidence
              </Button>
            </form>
          </div>
        }
      />
      <BrainNav current="/brain" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-2xl font-semibold text-ink">{facts.length}</p>
          <p className="text-sm text-muted">facts</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold text-ink">{verified}</p>
          <p className="text-sm text-muted">verified and current</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold text-ink">{contradicted}</p>
          <p className="text-sm text-muted">in contradiction</p>
        </Card>
      </div>

      {running.length > 0 ? (
        <Card className="mb-6 border-l-2 border-l-info p-4">
          <p className="text-sm text-ink">
            {running.length} Brain job{running.length === 1 ? '' : 's'} in flight.
          </p>
          <p className="mt-1 text-sm text-muted">
            The worker collects and reasons; this page is server-rendered, so reload to see the
            result.
          </p>
        </Card>
      ) : null}

      {failed.length > 0 ? (
        <Card className="mb-6 border-l-2 border-l-bad p-4">
          <SectionTitle>A Brain job failed</SectionTitle>
          <p className="mt-1 text-sm text-muted">
            Shown because an empty Brain and a failed collection look identical otherwise, and only
            one of them needs you.
          </p>
          <ul className="mt-2 space-y-1">
            {failed.slice(0, 3).map((job, i) => (
              <li key={i} className="text-sm text-ink">
                <code className="rounded bg-sunk px-1">{job.kind}</code>{' '}
                <span className="text-muted">{job.lastError ?? 'no error recorded'}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {facts.length === 0 ? (
        <EmptyState
          title="Halyard knows nothing about this product yet"
          body={
            <>
              <p>
                Nothing has been collected, so there is nothing to reason over. This is an empty
                Brain rather than a broken one — and it is deliberately not filled in with
                plausible defaults.
              </p>
              <p className="mt-2">
                <strong>Collect evidence</strong> fetches the public website, the App Store listing
                and the product&rsquo;s own API surface. Reasoning runs after it, automatically.
              </p>
            </>
          }
          action={
            <form action={collectEvidence}>
              <input type="hidden" name="productId" value={product.id} />
              <Button type="submit">Collect evidence</Button>
            </form>
          }
        />
      ) : (
        <div className="space-y-6">
          {populated.map((category) => {
            const inCategory = facts.filter((f) => f.category === category.category);
            return (
              <Card key={category.category} className="p-5">
                <div className="flex items-baseline justify-between">
                  <SectionTitle hint={`${category.verified} of ${category.total} verified`}>
                    {category.label}
                  </SectionTitle>
                  <Link
                    href={`/brain/${category.category}`}
                    className="text-sm text-muted underline hover:text-ink"
                  >
                    All {category.total}
                  </Link>
                </div>
                <ul className="mt-3 space-y-3">
                  {inCategory.slice(0, 4).map((fact) => (
                    <li key={fact.id}>
                      <p className="text-sm text-ink">{fact.value}</p>
                      <p className="mt-0.5">
                        <FactConfidence
                          status={fact.status}
                          confidence={fact.confidence}
                          sourceCount={fact.sourceCount}
                          stale={fact.stale}
                        />
                        <span className="ml-2 text-xs text-muted">
                          via {fact.agentId} ·{' '}
                          {fact.lastVerifiedAt
                            ? `verified ${formatInOperatorTz(fact.lastVerifiedAt.toISOString(), tz)}`
                            : 'never verified'}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {/*
        * Categories nothing can ever fill.
        *
        * Shown rather than hidden, and named as a gap rather than a coming
        * feature. A heading over a category with no producing agent is a
        * promise the system cannot keep, and hiding it would make the Brain
        * look complete at exactly the point it is not.
        */}
      {unreachable.length > 0 ? (
        <Card className="mt-6 p-5">
          <SectionTitle hint="no registered agent produces these">Not yet reachable</SectionTitle>
          <p className="mt-1 text-sm text-muted">
            The architecture names these categories and no agent in the registry can currently
            produce one. They are listed so the gap is visible rather than implied by an empty
            section.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unreachable.map((category) => (
              <Badge key={category.category} tone="neutral">
                {category.label}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
