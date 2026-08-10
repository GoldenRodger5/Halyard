import { headers } from 'next/headers';
import { Shell } from '@/components/Shell';
import { databaseReachable } from '@/lib/db';
import { getNavCounts, getProducts, getSettings } from '@/lib/queries';
import { getOperator, devBypassAllowed, supabaseConfigured } from '@/lib/auth';
import { Banner, Card } from '@halyard/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-halyard-pathname') ?? '/';

  const reachable = await databaseReachable();
  if (!reachable.ok) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
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
      </div>
    );
  }

  const operator = await getOperator();
  if (!operator) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <Card className="p-8">
          <h1 className="font-serif text-3xl">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {supabaseConfigured()
              ? 'This Halyard instance is protected by Supabase Auth, and the signed-in user must appear in admin_users.'
              : 'Supabase Auth is not configured. For local work, set HALYARD_DEV_UNAUTHENTICATED=1 — it is refused when NODE_ENV is production.'}
          </p>
        </Card>
      </div>
    );
  }

  const [counts, settings, products] = await Promise.all([
    getNavCounts(),
    getSettings(),
    getProducts(),
  ]);

  return (
    <Shell
      pathname={pathname}
      counts={counts}
      productName={products[0]?.name ?? 'No product'}
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
