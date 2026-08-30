import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getFeatures } from '@/lib/brainQueries';
import { getCurrentProduct } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { exploreProduct } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  verified: 'good',
  unverified: 'neutral',
  unverifiable: 'warn',
  refuted: 'bad',
};

/**
 * Features, read from `feature_claims` rather than from `product_facts`.
 *
 * The Brain does not restate them, and this screen is where that decision is
 * visible: a feature here is `verified` because a browser **replayed the steps
 * and observed the result**, which is a far stronger claim than two pages
 * agreeing. Copying features into the fact table would have produced a second,
 * weaker answer to the same question.
 */
export default async function BrainFeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: requested } = await searchParams;
  const product = await getCurrentProduct(requested);
  if (!product) {
    return (
      <>
        <PageHeader title="Features" />
        <EmptyState title="No product connected" body="Add a product first." />
      </>
    );
  }

  const features = await getFeatures(product.id);
  const tz = product.operator_timezone ?? 'UTC';
  const verified = features.filter((f) => f.status === 'verified' && !f.stale).length;

  return (
    <>
      <PageHeader
        title="Features"
        subtitle="What the product actually does — each one proved by replaying it, or not claimed."
        actions={
          <form action={exploreProduct}>
            <input type="hidden" name="productId" value={product.id} />
            <Button type="submit" variant="secondary">
              Explore the product
            </Button>
          </form>
        }
      />

      <Card className="mb-6 p-4">
        <p className="text-sm text-muted">
          These come from <code className="rounded bg-sunk px-1">feature_claims</code>, not from the
          fact table. A feature is <strong>verified</strong> only when its steps were replayed in a
          real browser and the expected result was observed — never because a model listed it.
        </p>
      </Card>

      {features.length === 0 ? (
        <EmptyState
          title="No feature has been claimed yet"
          body={
            <>
              <p>
                Exploration walks the product, proposes what each page lets a user do, and stores
                each proposal with the steps that would prove it. Verification replays those steps
                on a schedule.
              </p>
              <p className="mt-2">
                It is a deliberate act rather than a scheduled one: it spends model calls and drives
                a browser through your live product.
              </p>
            </>
          }
          action={
            <form action={exploreProduct}>
              <input type="hidden" name="productId" value={product.id} />
              <Button type="submit">Explore the product</Button>
            </form>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-2xl font-semibold text-ink">{features.length}</p>
              <p className="text-sm text-muted">claimed</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-semibold text-ink">{verified}</p>
              <p className="text-sm text-muted">verified and current</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-semibold text-ink">
                {features.filter((f) => f.status === 'refuted').length}
              </p>
              <p className="text-sm text-muted">refuted on replay</p>
            </Card>
          </div>

          <div className="space-y-3">
            {features.map((feature) => (
              <Card key={feature.id} className="p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <SectionTitle hint={`from ${feature.source}`}>{feature.name}</SectionTitle>
                  <Badge tone={STATUS_TONE[feature.status] ?? 'neutral'}>
                    {feature.stale ? 'verified, now stale' : feature.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{feature.summary}</p>
                <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
                  {feature.verifiedAt
                    ? `Replayed successfully ${formatInOperatorTz(feature.verifiedAt.toISOString(), tz)}`
                    : 'Never successfully replayed'}
                  {feature.lastAttemptAt
                    ? ` · last attempt ${formatInOperatorTz(feature.lastAttemptAt.toISOString(), tz)}`
                    : null}
                  {feature.attempts > 0 ? ` · ${feature.attempts} attempt${feature.attempts === 1 ? '' : 's'}` : null}
                  {feature.lastVerdict ? ` · ${feature.lastVerdict}` : null}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
