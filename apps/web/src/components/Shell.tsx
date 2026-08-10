/**
 * The application shell. v1 §8:
 *   Desktop — persistent left sidebar (240px), content area max 1280px.
 *   Mobile  — bottom tab bar: Queue · Calendar · Library · More.
 *
 * "The queue must be fully usable on a phone; approval happens in spare moments
 * or it doesn't happen."
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, cx } from '@halyard/ui';

export interface NavCounts {
  pendingApproval: number;
  inboxPending: number;
  failed: number;
  /** Stories waiting on an opinion. Input-gated work needs its own signal. */
  storiesWaiting?: number;
}

const NAV: Array<{ href: string; label: string; group: 'work' | 'plan' | 'config' }> = [
  { href: '/', label: 'Dashboard', group: 'work' },
  { href: '/queue', label: 'Queue', group: 'work' },
  { href: '/take', label: 'Daily Take', group: 'work' },
  { href: '/compose', label: 'Compose', group: 'work' },
  { href: '/inbox', label: 'Inbox', group: 'work' },
  { href: '/calendar', label: 'Calendar', group: 'plan' },
  { href: '/ideas', label: 'Ideas', group: 'plan' },
  { href: '/swipe', label: 'Swipe file', group: 'plan' },
  { href: '/hooks', label: 'Hooks', group: 'plan' },
  { href: '/series', label: 'Series', group: 'plan' },
  { href: '/social-proof', label: 'Social proof', group: 'plan' },
  { href: '/finds', label: 'Finds', group: 'plan' },
  { href: '/library', label: 'Library', group: 'plan' },
  { href: '/assets', label: 'Assets', group: 'plan' },
  { href: '/campaigns', label: 'Campaigns', group: 'plan' },
  { href: '/analytics', label: 'Analytics', group: 'plan' },
  { href: '/products', label: 'Products', group: 'config' },
  { href: '/accounts', label: 'Accounts', group: 'config' },
  { href: '/templates', label: 'Templates', group: 'config' },
  { href: '/submissions', label: 'Submissions', group: 'config' },
  { href: '/settings/readiness', label: 'Readiness', group: 'config' },
  { href: '/settings', label: 'Settings', group: 'config' },
];

const MOBILE_TABS = [
  { href: '/queue', label: 'Queue' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/library', label: 'Library' },
  { href: '/settings', label: 'More' },
];

export interface ShellProduct {
  id: string;
  name: string;
  kind: 'product' | 'personal';
}

export function Shell({
  children,
  pathname,
  counts,
  products = [],
  currentProductId,
  productName = 'RecipeFix',
  killSwitchOn,
}: {
  children: ReactNode;
  pathname: string;
  counts: NavCounts;
  products?: ShellProduct[];
  currentProductId?: string;
  productName?: string;
  killSwitchOn?: boolean;
}) {
  const badgeFor = (href: string): number => {
    if (href === '/queue') return counts.pendingApproval;
    if (href === '/inbox') return counts.inboxPending;
    if (href === '/take') return counts.storiesWaiting ?? 0;
    return 0;
  };

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="px-5 py-6">
            <Link href="/" className="font-serif text-2xl leading-none text-ink">
              Halyard
            </Link>

            {products.length > 1 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {products.map((product) => (
                  <Link
                    key={product.id}
                    href={`${pathname}?product=${product.id}`}
                    className={cx(
                      'rounded-md px-1.5 py-0.5 text-[11px]',
                      product.id === currentProductId
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted hover:bg-sunk hover:text-ink',
                    )}
                    title={product.kind === 'personal' ? 'A persona, not a product' : undefined}
                  >
                    {product.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">{productName}</p>
            )}
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
            {(['work', 'plan', 'config'] as const).map((group) => (
              <div key={group}>
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                  {group === 'work' ? 'Today' : group === 'plan' ? 'Plan' : 'Configure'}
                </p>
                {NAV.filter((item) => item.group === group).map((item) => {
                  const active =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  const count = badgeFor(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cx(
                        'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-ink/80 hover:bg-sunk hover:text-ink',
                      )}
                    >
                      <span>{item.label}</span>
                      {count > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {killSwitchOn ? (
            <div className="mx-3 mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
              <p className="text-xs font-semibold text-danger">Publishing paused</p>
              <p className="mt-0.5 text-[11px] leading-snug text-danger/80">
                The kill switch is on. Nothing will post.
              </p>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <Link href="/" className="font-serif text-xl text-ink">
            Halyard
          </Link>
          <div className="flex items-center gap-2">
            {killSwitchOn ? <Badge tone="bad">paused</Badge> : null}
            <span className="text-xs text-muted">{productName}</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 pb-tabbar md:px-8 md:py-10 md:pb-10">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface/95 backdrop-blur md:hidden">
          {MOBILE_TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            const count = badgeFor(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cx(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-3 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                {tab.label}
                {count > 0 ? (
                  <span className="absolute right-1/4 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
