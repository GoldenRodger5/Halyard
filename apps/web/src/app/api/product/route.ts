/**
 * Switching the product the dashboard is showing.
 *
 * §172. The sidebar has always written `?product=<id>` into the URL and
 * `getCurrentProduct` has always accepted a `requested` id — but the layout
 * called it with no argument, so nothing ever supplied one and clicking a
 * product did nothing. It is the same shape as every other orphaned parameter
 * this codebase has found: a supplier that was never written, and no error
 * because a query string nobody reads is not an error.
 *
 * A query string cannot fix it. In the App Router a **layout does not receive
 * `searchParams`** — only pages do — and the product chip lives in the shell,
 * which is rendered by the layout. So the selection has to survive in something
 * the layout can read, and that is a cookie.
 *
 * A GET that writes a cookie is a deliberate, narrow exception: this sets a view
 * preference, not product state, and keeping it a plain link is what lets the
 * shell stay a server component with no client JavaScript.
 */
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOperator } from '@/lib/auth';
import { getProducts } from '@/lib/queries';
import { PRODUCT_COOKIE } from '@/lib/product';

export async function GET(request: NextRequest) {
  await requireOperator();

  const id = request.nextUrl.searchParams.get('id');
  const next = request.nextUrl.searchParams.get('next') ?? '/';

  /*
   * Validated against the real product list rather than trusted. An id from a
   * URL is user input, and a cookie holding a product that does not exist would
   * silently fall back on every render — which looks exactly like the bug this
   * is fixing.
   */
  const products = await getProducts();
  if (id && products.some((p) => p.id === id)) {
    (await cookies()).set(PRODUCT_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  /*
   * Only same-origin paths. `next` comes from the URL, so echoing it into a
   * redirect without this is an open redirect.
   */
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(safeNext, request.nextUrl.origin));
}
