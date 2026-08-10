import { NextResponse, type NextRequest } from 'next/server';
import { PROFILE_SPECS, type PlatformId } from '@halyard/core';
import { avatarElement, bannerElement, renderElement } from '@halyard/render/image';
import { one } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Profile artwork, rendered on demand. Milestone 50.
 *
 * Not stored as assets. These are derived entirely from brand tokens and the
 * product name, so caching them would mean holding a stale avatar every time the
 * operator adjusts a colour — and the render is fast enough that regenerating is
 * cheaper than invalidating.
 *
 * The size comes from `PROFILE_SPECS`, never from the query string. A caller
 * asking for an arbitrary size would be asking for an image the platform
 * rejects, and there is no reason to offer that.
 */
export async function GET(request: NextRequest) {
  await requireOperator();

  const params = request.nextUrl.searchParams;
  const productId = params.get('product') ?? '';
  const platform = params.get('platform') as PlatformId | null;
  const kind = params.get('kind') ?? 'avatar';

  if (!platform || !PROFILE_SPECS[platform]) {
    return NextResponse.json({ error: `Unknown platform '${platform}'.` }, { status: 400 });
  }

  const product = await one<{ name: string; tagline: string | null; brand_tokens: Record<string, unknown> }>(
    'select name, tagline, brand_tokens from products where id = $1',
    [productId],
  );
  if (!product) {
    return NextResponse.json({ error: 'Unknown product.' }, { status: 404 });
  }

  const spec = PROFILE_SPECS[platform];
  const input = {
    productName: product.name,
    tagline: product.tagline,
    brandTokens: product.brand_tokens,
  };

  let element;
  let size: { width: number; height: number };

  if (kind === 'banner') {
    if (!spec.banner) {
      return NextResponse.json(
        { error: `${platform} has no header image.` },
        { status: 404 },
      );
    }
    size = { width: spec.banner.width, height: spec.banner.height };
    element = bannerElement(input, size.width, size.height, spec.banner.safeAreaFraction);
  } else {
    size = { width: spec.avatar.width, height: spec.avatar.height };
    element = avatarElement(input, size.width);
  }

  const rendered = await renderElement(element, { aspectRatio: '1:1', size });

  return new Response(new Uint8Array(rendered.png), {
    headers: {
      'content-type': 'image/png',
      'content-disposition': `inline; filename="${productId}-${platform}-${kind}-${size.width}x${size.height}.png"`,
      // Private: this is behind the operator gate, so no shared cache should
      // hold it.
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
}
