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

/**
 * Seven destinations, then everything else.
 *
 * §172. The sidebar carried twenty-nine links across three groups named after
 * Halyard's internals — Swipe file, Hooks, Series, Social proof, Finds,
 * Readiness, Pronunciation, Agents, System. Each is a real capability and none
 * of them is a question a person arrives with.
 *
 * The primary list is organised around what the operator wants to know, one
 * question per destination:
 *
 *   Home       what needs me?
 *   Create     what do I want to publish?
 *   Content    what am I working on?
 *   Calendar   what goes out, and when?
 *   Inbox      who needs a reply?
 *   Analytics  how is it doing?
 *   Accounts   what is connected?
 *
 * **Nothing was removed.** Every previous destination is still one click away
 * under More, grouped by what it is for. Progressive disclosure, not feature
 * reduction — the capability matrix in `docs/PRODUCT_UX.md` maps old location to
 * new for all of them.
 */
export const NAV: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Home' },
  /*
   * §235. Studio is where a piece is *decided*; Compose is where one is talked
   * out with the co-pilot. Both are "creating", and they are different jobs —
   * one picks a concept and a direction, the other is a conversation.
   */
  { href: '/studio', label: 'Create' },
  { href: '/compose', label: 'Co-pilot' },
  { href: '/queue', label: 'Content' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/accounts', label: 'Accounts' },
];

/**
 * The specialised tools, kept and grouped rather than hidden.
 *
 * Collapsed by default because none of them answers a first-visit question; a
 * heading says what each group is for, so finding one is a guess about purpose
 * rather than a memory of a name.
 */
export const MORE: Array<{ heading: string; items: Array<{ href: string; label: string }> }> = [
  {
    heading: 'Planning',
    items: [
      { href: '/launch', label: 'First two weeks' },
      { href: '/ideas', label: 'Ideas' },
      { href: '/hooks', label: 'Hooks' },
      { href: '/swipe', label: 'Swipe file' },
      { href: '/series', label: 'Series' },
      { href: '/campaigns', label: 'Campaigns' },
      { href: '/finds', label: 'Finds' },
      { href: '/take', label: 'Daily Take' },
    ],
  },
  {
    heading: 'Library',
    items: [
      { href: '/library', label: 'Library' },
      { href: '/assets', label: 'Assets' },
      { href: '/templates', label: 'Templates' },
      { href: '/social-proof', label: 'Social proof' },
      { href: '/submissions', label: 'Submissions' },
    ],
  },
  {
    heading: 'Your product',
    items: [
      { href: '/brain', label: 'Product Brain' },
      { href: '/products', label: 'Products' },
      { href: '/setup-kit', label: 'Setup kit' },
      { href: '/first-30-days', label: 'First 30 days' },
    ],
  },
  {
    heading: 'Advanced',
    items: [
      { href: '/settings', label: 'Settings' },
      { href: '/settings/readiness', label: 'Readiness' },
      { href: '/settings/pronunciation', label: 'Pronunciation' },
      { href: '/agents', label: 'Agents' },
      { href: '/system', label: 'System' },
    ],
  },
];

const MOBILE_TABS = [
  { href: '/', label: 'Home' },
  { href: '/queue', label: 'Content' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/inbox', label: 'Inbox' },
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

  /* Whether the current page lives under More, so the disclosure opens itself. */
  const inMore = MORE.some((section) =>
    section.items.some((item) => pathname === item.href),
  );

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="px-5 py-6">
            <Link href="/" className="font-serif text-2xl leading-none text-ink">
              Halyard
            </Link>

            {/*
              The product switcher, and the way to manage products.

              §172. Two reported problems, one cause. Clicking a product did
              nothing, because the chip wrote `?product=` into the URL and the
              layout never read it — see `app/api/product/route.ts`. And there was
              no way to reach products from here at all: `/products`, `/products/new`
              and `/products/[id]` all existed, buried in a sidebar group called
              "Plan", while the operator was clicking the product name looking for
              them. Capability is not the same as reachability.

              The list renders even with one product, because "add another" is a
              thing you want precisely when you only have one.
            */}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {products.map((product) => (
                <Link
                  key={product.id}
                  href={`/api/product?id=${product.id}&next=${encodeURIComponent(pathname)}`}
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
              {products.length === 0 ? (
                <span className="px-1.5 py-0.5 text-[11px] text-muted">{productName}</span>
              ) : null}
              <Link
                href="/products"
                className="rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-sunk hover:text-ink"
                title="View, add and configure products"
              >
                + Manage
              </Link>
            </div>
          </div>

          {/*
            §174. Named landmarks.

            The shell renders two <nav> elements — the sidebar and the phone tab
            bar — and neither had a name, so a screen reader announced two
            identical "navigation" landmarks and gave no way to tell them apart.
            It also made them indistinguishable to a test, which is how a mobile
            spec ended up matching the desktop sidebar.
          */}
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-6">
            {NAV.map((item) => {
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

            {/*
              A native <details>, not a client component. The shell renders on the
              server, and a disclosure triangle is one of the few interactions the
              platform already has — reaching for `useState` here would make the
              whole sidebar client-side to animate a caret.

              It opens itself when the current page lives inside it, so arriving by
              link or reload never shows the active page as collapsed away.
            */}
            <details className="group mt-4" open={inMore}>
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-sunk hover:text-ink">
                <span>More</span>
                <span className="text-[10px] text-muted transition-transform group-open:rotate-90">
                  &#9654;
                </span>
              </summary>

              <div className="mt-1 space-y-3 border-l border-line pl-2">
                {MORE.map((section) => (
                  <div key={section.heading}>
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {section.heading}
                    </p>
                    {section.items.map((item) => {
                      const active = pathname === item.href;
                      const count = badgeFor(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cx(
                            'flex items-center justify-between rounded-lg px-2.5 py-1 text-[13px] transition-colors',
                            active
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-ink/70 hover:bg-sunk hover:text-ink',
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
              </div>
            </details>
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

        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface/95 backdrop-blur md:hidden"
        >
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
