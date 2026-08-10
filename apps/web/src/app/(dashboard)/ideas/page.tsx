import { Badge, Card, EmptyState, MiniBar, PageHeader, SectionTitle } from '@halyard/ui';
import { COLD_START_WEIGHTS, learningStatus } from '@halyard/core';
import { getIdeas, getMix, getMixTargets, getProducts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const FACTOR_LABELS: Record<string, string> = {
  mixDebt: 'mix debt',
  novelty: 'novelty',
  seasonal: 'seasonal',
  productSignal: 'product signal',
  formatAvailability: 'renderable',
  historical: 'past performance',
};

export default async function IdeasPage() {
  const products = await getProducts();
  const product = products[0];
  const [ideas, mix, targets] = await Promise.all([
    getIdeas(),
    product ? getMix(product.id) : Promise.resolve([]),
    product ? getMixTargets(product.id) : Promise.resolve({}),
  ]);

  const learning = learningStatus({
    targets: targets as never,
    actual: Object.fromEntries(mix.map((m) => [m.category, Number(m.share)])) as never,
    productShare14d: 0,
    postsPerCategory: Object.fromEntries(mix.map((m) => [m.category, m.published])) as never,
  });

  return (
    <>
      <PageHeader
        title="Ideas"
        subtitle="Scored on six factors, with content-mix debt weighted highest. The weights below are hand-set, not learned, and the system says so rather than dressing a guess as learning."
      />

      <Card className="mb-6 p-4">
        <SectionTitle hint={learning.active ? 'learning active' : 'cold start'}>
          Scoring weights
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(COLD_START_WEIGHTS).map(([key, weight]) => (
            <div key={key}>
              <p className="text-xs text-muted">{FACTOR_LABELS[key] ?? key}</p>
              <p className="font-serif text-xl text-ink">{(weight * 100).toFixed(0)}%</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          {learning.message}
        </p>
      </Card>

      {ideas.length === 0 ? (
        <EmptyState
          title="No ideas in the backlog"
          body="The daily idea job reads unconsumed signals, the trailing content mix, and the last sixty days of titles, then proposes ten to twenty scored angles."
        />
      ) : (
        <ul className="space-y-3">
          {ideas.map((idea) => (
            <Card as="li" key={idea.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone="info">{idea.category}</Badge>
                    <Badge tone="neutral">{idea.status}</Badge>
                  </div>
                  <h3 className="font-serif text-xl leading-snug text-ink">{idea.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{idea.angle}</p>
                  {idea.rationale ? (
                    <p className="mt-2 text-xs italic text-muted">{idea.rationale}</p>
                  ) : null}
                </div>
                <div className="w-full shrink-0 sm:w-56">
                  <p className="mb-2 text-right font-serif text-2xl text-ink">
                    {Number(idea.score).toFixed(2)}
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(idea.score_breakdown ?? {}).map(([key, value]) => (
                      <div key={key}>
                        <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] text-muted">
                          <span>{FACTOR_LABELS[key] ?? key}</span>
                          <span>{Number(value).toFixed(2)}</span>
                        </div>
                        <MiniBar value={Number(value)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
