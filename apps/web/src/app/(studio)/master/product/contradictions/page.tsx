import { CATEGORY_LABELS, type FactCategory } from '@halyard/core';
import { FactConfidence } from '../BrainNav';
import { Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getFacts } from '@/lib/brainQueries';
import { getCurrentProduct } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Where two sources disagree about the same thing.
 *
 * Nothing here is resolved, and that is the design. `findContradictions` — code,
 * not a model — decides *that* two facts conflict, because for two rows sharing
 * a slot that is an exact question. The reconciler explains *why* they might,
 * in prose, and picks no winner.
 *
 * A screen that showed a resolved answer would be presenting a judgement nothing
 * measured. Two values and an explanation is the honest state of the knowledge.
 */
export default async function ContradictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: requested } = await searchParams;
  const product = await getCurrentProduct(requested);
  if (!product) {
    return (
      <>
        <PageHeader title="Contradictions" />
        <EmptyState title="No product connected" body="Add a product first." />
      </>
    );
  }

  const facts = await getFacts(product.id);
  const conflicted = facts.filter((f) => f.contradicts !== null);
  const byId = new Map(facts.map((f) => [f.id, f]));

  /** One row per pair rather than two, since each side points at the other. */
  const pairs: Array<[typeof facts[number], typeof facts[number]]> = [];
  const seen = new Set<string>();
  for (const fact of conflicted) {
    if (seen.has(fact.id)) continue;
    const other = byId.get(fact.contradicts!);
    if (!other) continue;
    seen.add(fact.id);
    seen.add(other.id);
    pairs.push([fact, other]);
  }

  return (
    <>
      <PageHeader
        title="Contradictions"
        subtitle="Facts that disagree. Halyard does not pick a winner."
      />

      {pairs.length === 0 ? (
        <EmptyState
          title="Nothing disagrees"
          body={
            facts.length === 0
              ? 'There are no facts yet, so nothing can conflict. This is not a clean bill of health.'
              : 'Every fact currently occupies its slot alone. That means the sources Halyard has read are consistent with each other — not that they are right.'
          }
        />
      ) : (
        <div className="space-y-4">
          {pairs.map(([left, right]) => (
            <Card key={left.id} className="p-5">
              <SectionTitle hint={left.key}>
                {CATEGORY_LABELS[left.category as FactCategory]}
              </SectionTitle>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[left, right].map((fact) => (
                  <div key={fact.id} className="rounded-lg bg-sunk p-3">
                    <p className="text-sm text-ink">{fact.value}</p>
                    <p className="mt-1">
                      <FactConfidence
                        status={fact.status}
                        confidence={fact.confidence}
                        sourceCount={fact.sourceCount}
                        stale={fact.stale}
                      />
                    </p>
                    <p className="mt-1 text-xs text-muted">via {fact.agentId}</p>
                  </div>
                ))}
              </div>

              {left.reconciliation ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-xs font-medium text-muted">Why these might differ</p>
                  <p className="mt-1 text-sm text-ink">{left.reconciliation}</p>
                  <p className="mt-2 text-xs text-muted">
                    An explanation, not a decision. Neither fact has been demoted or dropped.
                  </p>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
