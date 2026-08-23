import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { databaseReachable } from '@/lib/db';
import { getCurrentProduct, getNavCounts, getProducts, getSettings } from '@/lib/queries';
import { getOperator, devBypassAllowed, supabaseConfigured } from '@/lib/auth';
import { Banner, Card } from '@halyard/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-halyard-pathname') ?? '/';

  const reachable = await databaseReachable();
  if (!reachable.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <Card className="p-8">
          <h1 className="font-serif text-3xl">Halyard cannot reach its database</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Set <code className="rounded bg-sunk px-1">DATABASE_URL</code> in{' '}
            <code className="rounded bg-sunk px-1">apps/web/.env.local</code> and apply the
            migrations with <code className="rounded bg-sunk px-1">pnpm db:reset -- --fresh --seed</code>.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-sunk p-3 text-xs text-muted">
            {reachable.detail}
          </pre>
        </Card>
      </main>
    );
  }

  const operator = await getOperator();
  if (!operator) {
    // Configured means there is somewhere to go. Unconfigured means there is
    // not, and a redirect would loop, so that case explains itself here.
    if (supabaseConfigured()) redirect('/signin');

    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <Card className="p-8">
          <h1 className="font-serif text-3xl">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Supabase Auth is not configured. For local work, set
            HALYARD_DEV_UNAUTHENTICATED=1 — it is refused when NODE_ENV is production.
          </p>
        </Card>
      </main>
    );
  }

  const [counts, settings, products, current] = await Promise.all([
    getNavCounts(),
    getSettings(),
    getProducts(),
    getCurrentProduct(),
  ]);

  return (
    <Shell
      pathname={pathname}
      counts={counts}
      products={products.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
      currentProductId={current?.id}
      productName={current?.name ?? 'No product'}
      killSwitchOn={!settings.publishing_enabled}
    >
      {operator.isDevBypass && devBypassAllowed() ? (
        <Banner tone="warn" title="Running without authentication">
          HALYARD_DEV_UNAUTHENTICATED is set. This is refused in production, but do not leave it on
          anywhere reachable.
        </Banner>
      ) : null}
      {children}
    </Shell>
  );
}
