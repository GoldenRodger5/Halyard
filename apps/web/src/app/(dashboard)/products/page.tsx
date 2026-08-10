import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { getProducts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Halyard serves RecipeFix now and Kinolog later without rework. A product is a brief, a voice, brand tokens, content rules, and a connector."
      />

      {products.length === 0 ? (
        <EmptyState title="No products" body="Apply the seed to configure RecipeFix." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <Card key={product.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl text-ink">{product.name}</h2>
                  <p className="mt-1 text-sm text-muted">{product.tagline ?? 'No tagline set.'}</p>
                </div>
                <Badge tone={product.connector_type === 'none' ? 'neutral' : 'good'}>
                  {product.connector_type}
                </Badge>
              </div>

              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Audience timezone</dt>
                  <dd className="text-ink">{product.audience_timezone}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Operator timezone</dt>
                  <dd className="text-ink">{product.operator_timezone}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Brief</dt>
                  <dd className="text-ink">
                    {product.brief_markdown ? 'ingested' : 'not ingested'}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {Object.entries(product.brand_tokens ?? {})
                  .filter(([key]) => key.includes('color') || ['primary', 'background', 'ink', 'muted', 'accent'].includes(key))
                  .map(([key, value]) => (
                    <span
                      key={key}
                      title={`${key}: ${value}`}
                      className="h-6 w-6 rounded border border-line"
                      style={{ backgroundColor: String(value) }}
                    />
                  ))}
              </div>

              <Link
                href={`/products/${product.id}`}
                className="mt-4 inline-flex rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-sunk"
              >
                Configure
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
