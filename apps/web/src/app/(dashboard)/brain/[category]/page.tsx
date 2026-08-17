import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CATEGORY_LABELS, FACT_CATEGORIES, REACHABLE_CATEGORIES, type FactCategory } from '@halyard/core';
import { Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getEvidenceForFact, getFacts } from '@/lib/brainQueries';
import { getCurrentProduct } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { BrainNav, FactConfidence } from '../BrainNav';

export const dynamic = 'force-dynamic';

/**
 * One fact category, with every fact's provenance.
 *
 * A single route rendering eighteen categories from data, rather than eighteen
 * hand-written screens. The architecture lists the categories as UI sections;
 * building them as pages would mean eighteen files that differ only in a
 * `where` clause, and the seventeen with no data would each need remembering to
 * write an honest empty state for.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const { category } = await params;
  const { product: requested } = await searchParams;

  if (!(FACT_CATEGORIES as readonly string[]).includes(category)) notFound();
  const factCategory = category as FactCategory;

  const product = await getCurrentProduct(requested);
  if (!product) notFound();

  const facts = await getFacts(product.id, factCategory);
  const tz = product.operator_timezone ?? 'UTC';
  const reachable = REACHABLE_CATEGORIES.has(factCategory);

  // The evidence behind each fact, so a claim can be followed to a source URL
  // and a collection time without leaving the page.
  const evidence = await Promise.all(facts.map((fact) => getEvidenceForFact(fact.id)));

  return (
    <>
      <PageHeader
        title={CATEGORY_LABELS[factCategory]}
        subtitle={`${product.name} · what Halyard believes, and what each belief rests on`}
      />
      <BrainNav current="/brain" />

      <Link href="/brain" className="mb-4 inline-block text-sm text-muted underline hover:text-ink">
        ← Back to the Brain
      </Link>

      {facts.length === 0 ? (
        <EmptyState
          title={reachable ? `Nothing observed for ${CATEGORY_LABELS[factCategory].toLowerCase()}` : 'Nothing can fill this yet'}
          body={
            reachable ? (
              <p>
                An agent can produce facts in this category and none have been proposed from the
                evidence collected so far. Collect more evidence, or accept that the product does
                not say anything about this.
              </p>
            ) : (
              <p>
                No agent in the registry produces facts in this category. It is listed because the
                architecture names it, and shown as empty rather than hidden so the gap is visible
                — a section that quietly disappeared would make the Brain look complete.
              </p>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {facts.map((fact, i) => (
            <Card key={fact.id} className="p-5">
              <div className="flex items-baseline justify-between gap-4">
                <SectionTitle hint={fact.key}>{fact.value}</SectionTitle>
                <FactConfidence
                  status={fact.status}
                  confidence={fact.confidence}
                  sourceCount={fact.sourceCount}
                  stale={fact.stale}
                />
              </div>

              {fact.detail ? <p className="mt-2 text-sm text-muted">{fact.detail}</p> : null}

              {fact.reconciliation ? (
                <div className="mt-3 border-l-2 border-l-warn pl-3">
                  <p className="text-xs font-medium text-warn">Another source disagrees</p>
                  <p className="mt-1 text-sm text-muted">{fact.reconciliation}</p>
                </div>
              ) : null}

              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs text-muted">
                  Proposed by <code className="rounded bg-sunk px-1">{fact.agentId}</code> ·{' '}
                  {fact.lastVerifiedAt
                    ? `verified ${formatInOperatorTz(fact.lastVerifiedAt.toISOString(), tz)}`
                    : 'never verified'}{' '}
                  · updated {formatInOperatorTz(fact.updatedAt.toISOString(), tz)}
                </p>
                <ul className="mt-2 space-y-1">
                  {evidence[i]!.map((source) => (
                    <li key={source.id} className="text-xs text-muted">
                      <span className="text-ink">{source.kind}</span>
                      {source.sourceUrl ? (
                        <>
                          {' · '}
                          <span className="break-all">{source.sourceUrl}</span>
                        </>
                      ) : null}
                      {' · collected '}
                      {formatInOperatorTz(source.collectedAt.toISOString(), tz)}
                      {source.superseded ? ' · superseded since' : null}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
