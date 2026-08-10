import { notFound } from 'next/navigation';
import { query, one } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Link in bio. Milestone 31, Part C.
 *
 * Instagram and TikTok captions cannot carry a clickable link, which makes this
 * the actual conversion path on both. Public, brand-themed per product, and
 * every outbound link carries the same UTM scheme as everything else so the
 * clicks land in the same attribution join.
 */
export default async function LinkInBioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const product = await one<{
    id: string;
    name: string;
    tagline: string | null;
    brand_tokens: Record<string, string>;
  }>('select id, name, tagline, brand_tokens from products where id = $1', [slug]);

  if (!product) notFound();

  const accounts = await query<{ platform: string; handle: string; bio_link_url: string | null }>(
    `select platform, handle, bio_link_url from social_accounts
      where product_id = $1 and persona = 'brand' and capability_state in ('live','draft_only')
      order by platform`,
    [product.id],
  );

  const links = await query<{ id: string; body: string; final_link_url: string; published_at: string }>(
    `select id, body, final_link_url, published_at
       from content_items
      where product_id = $1 and status = 'published' and final_link_url is not null
      order by published_at desc limit 6`,
    [product.id],
  );

  const brand = {
    primary: product.brand_tokens.primary ?? '#C4714A',
    background: product.brand_tokens.background ?? '#FAF8F3',
    ink: product.brand_tokens.ink ?? '#2A2320',
    muted: product.brand_tokens.muted ?? '#7A6E66',
  };

  const withUtm = (url: string): string => {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('utm_source', 'link_in_bio');
      parsed.searchParams.set('utm_medium', 'social');
      return parsed.toString();
    } catch {
      return url;
    }
  };

  return (
    <main
      style={{ backgroundColor: brand.background, color: brand.ink }}
      className="min-h-dvh px-5 py-14"
    >
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-serif text-4xl leading-tight">{product.name}</h1>
        {product.tagline ? (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: brand.muted }}>
            {product.tagline}
          </p>
        ) : null}

        <div className="mt-8 space-y-3">
          {links.length === 0 ? (
            <p className="text-sm" style={{ color: brand.muted }}>
              Nothing published yet.
            </p>
          ) : (
            links.map((link) => (
              <a
                key={link.id}
                href={withUtm(link.final_link_url)}
                className="block rounded-xl border px-4 py-3.5 text-sm leading-snug transition-transform hover:-translate-y-0.5"
                style={{ borderColor: `${brand.primary}44`, backgroundColor: '#ffffff88' }}
              >
                {link.body.split(/[.!?]/)[0]?.slice(0, 90)}
              </a>
            ))
          )}
        </div>

        {accounts.length > 0 ? (
          <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: brand.muted }}>
            {accounts.map((account) => (
              <span key={account.platform}>
                {account.platform} {account.handle}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
