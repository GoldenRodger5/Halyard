/**
 * §384. The studio's layout.
 *
 * Reads the same things the old dashboard layout reads — the operator, the
 * product list, the counts — plus one new thing: what the floor is doing right
 * now, for the corridor light.
 *
 * Built beside `(dashboard)` rather than replacing it. Every room here has a
 * new path, so nothing collides and the old console keeps working untouched
 * until step 9 of `docs/STUDIO_BUILD_PLAN.md` deletes it.
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PRODUCT_COOKIE } from '@/lib/product';
import { databaseReachable } from '@/lib/db';
import { getCurrentProduct, getNavCounts, getProducts } from '@/lib/queries';
import { getOperator, supabaseConfigured } from '@/lib/auth';
import { StudioShell } from '@/components/studio/StudioShell';
import { readFloor } from '@/lib/studio/floor';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-halyard-pathname') ?? '/';

  const reachable = await databaseReachable();
  if (!reachable.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="font-display text-3xl font-extrabold">Halyard cannot reach its database</h1>
        <p className="mt-3 text-sm leading-relaxed text-quiet">
          Set <code className="font-data">DATABASE_URL</code> in{' '}
          <code className="font-data">apps/web/.env.local</code>.
        </p>
      </main>
    );
  }

  const operator = await getOperator();
  if (!operator) {
    if (supabaseConfigured()) redirect('/signin');
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="font-display text-3xl font-extrabold">Sign in</h1>
        <p className="mt-3 text-sm leading-relaxed text-quiet">
          Supabase Auth is not configured. For local work, set
          HALYARD_DEV_UNAUTHENTICATED=1 — it is refused when NODE_ENV is production.
        </p>
      </main>
    );
  }

  const [counts, products, current, floor] = await Promise.all([
    getNavCounts(),
    getProducts(),
    getCurrentProduct((await cookies()).get(PRODUCT_COOKIE)?.value),
    readFloor(),
  ]);

  return (
    <StudioShell
      pathname={pathname}
      floor={floor}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        /*
         * The product's own accent, read from its brand tokens. The only place
         * a product's colour appears in the chrome, because this is the control
         * that says which product you are looking at.
         */
        tint: (p.brand_tokens as { primary?: string } | null)?.primary ?? null,
      }))}
      currentProductId={current?.id}
      counts={{ '/gallery': counts.pendingApproval, '/wires': counts.inboxPending }}
    >
      {children}
    </StudioShell>
  );
}
