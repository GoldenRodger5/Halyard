/**
 * The application shell.
 *
 * §361. Seven sections, and every tool lives *inside* one of them.
 *
 * §172 cut twenty-nine sidebar links to seven plus a collapsed More. That was
 * the right move and it stopped half way: More still held twenty-one links in
 * four groups, so the sidebar was a short list with a long list folded under
 * it, and the operator's report a fortnight later was that the navigation is
 * "hard to use and see and confusing, tabs are scattered and too many".
 *
 * Two things were wrong, and neither was the count.
 *
 * **Three of the seven were the same job.** Make, Create and Co-pilot are a
 * wizard, a concept picker and a conversation — three ways to begin one task,
 * presented as three destinations. Choosing between them requires knowing how
 * Halyard is built before you can ask it for anything.
 *
 * **More was a second sidebar.** A list you open to find a list is not
 * progressive disclosure; the items in it were no longer related to where you
 * were standing, so finding one still meant reading all twenty-one.
 *
 * So: a **section** is a job, and its tools are *tabs within it*, shown only
 * while you are in it. Seven sidebar entries, never more than eight tabs, and
 * nothing hidden behind a disclosure. The operator sees the whole of where they
 * are and none of where they are not.
 *
 * ## Every route is still reachable, and it is asserted
 *
 * No route changed. `/studio` is still `/studio`; it is now labelled *Concepts*
 * and sits under Make, because the label is what an operator reads and the URL
 * is what a bookmark keeps. `navigation.test.ts` holds a frozen list of every
 * destination that has ever been in the sidebar and fails if one stops being
 * reachable — which is the only reason a reorganisation like this is safe to
 * make twice.
 *
 * Desktop — persistent left sidebar (240px), content area max 1280px.
 * Mobile  — bottom tab bar. "The queue must be fully usable on a phone;
 * approval happens in spare moments or it doesn't happen."
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

export interface NavTab {
  href: string;
  label: string;
  /** One line, shown on hover. What this tab is for, not what it is called. */
  hint?: string;
}

export interface NavSection {
  href: string;
  label: string;
  /**
   * The question this section answers, in the operator's words.
   *
   * Rendered under the tab row rather than kept in a document. A section that
   * cannot be described as one question is two sections, and writing the line
   * is how that gets noticed.
   */
  question: string;
  tabs: NavTab[];
  /**
   * A third level, shown only inside the tab it belongs to.
   *
   * Settings has readiness and pronunciation under it. Those are real screens
   * and they are not peers of Accounts, so putting them in the tab row would
   * make the row longer and the hierarchy flatter than it is.
   */
  deeper?: Record<string, NavTab[]>;
}

export const SECTIONS: NavSection[] = [
  {
    href: '/',
    label: 'Home',
    question: 'What needs me?',
    tabs: [],
  },
  {
    /**
     * §361. One place to begin, with three ways to begin.
     *
     * The wizard when you know what you want, concepts when you want to be
     * offered something, and the conversation when it is easier to say it than
     * to click it. Same job, same section — the choice is a tab, not a
     * destination, because "which of these three screens is the one that makes
     * a video" is not a question an operator should have to hold.
     */
    href: '/make',
    label: 'Make',
    question: 'What do I want to publish?',
    tabs: [
      { href: '/make', label: 'Wizard', hint: 'Pick where it goes and what shape it takes' },
      { href: '/studio', label: 'Concepts', hint: 'Be offered several directions and choose one' },
      { href: '/compose', label: 'Chat', hint: 'Talk it out with the co-pilot' },
      { href: '/ideas', label: 'Ideas', hint: 'The pool everything is drawn from' },
      { href: '/hooks', label: 'Hooks', hint: 'Openings that have worked' },
      { href: '/swipe', label: 'Swipe file', hint: 'Other people’s work, kept on purpose' },
    ],
  },
  {
    href: '/queue',
    label: 'Review',
    question: 'What have I made that needs a decision?',
    tabs: [
      { href: '/queue', label: 'Waiting', hint: 'Everything holding for approval' },
      { href: '/library', label: 'Published', hint: 'What has already gone out' },
      { href: '/assets', label: 'Assets', hint: 'Images, video and sound Halyard holds' },
      { href: '/submissions', label: 'Submissions', hint: 'What people sent in' },
    ],
    deeper: {
      '/assets': [
        { href: '/assets', label: 'Media' },
        { href: '/assets/audio', label: 'Sound' },
      ],
    },
  },
  {
    href: '/calendar',
    label: 'Plan',
    question: 'What goes out, and when?',
    tabs: [
      { href: '/calendar', label: 'Calendar', hint: 'The schedule itself' },
      { href: '/launch', label: 'First two weeks', hint: 'The opening run for a new account' },
      { href: '/series', label: 'Series', hint: 'Recurring shapes with their own cadence' },
      { href: '/campaigns', label: 'Campaigns', hint: 'A window where the mix is allowed to change' },
      { href: '/first-30-days', label: 'First 30 days', hint: 'The plan for a new product' },
    ],
  },
  {
    href: '/inbox',
    label: 'Inbox',
    question: 'Who is talking to us?',
    tabs: [
      { href: '/inbox', label: 'Replies', hint: 'Comments and mentions waiting on an answer' },
      { href: '/finds', label: 'Finds', hint: 'Conversations worth joining' },
      { href: '/take', label: 'Daily Take', hint: 'Your opinion, which nothing writes without' },
      { href: '/social-proof', label: 'Social proof', hint: 'What people said that is worth quoting' },
    ],
  },
  {
    href: '/analytics',
    label: 'Analytics',
    question: 'How is it doing, and what has it learned?',
    tabs: [
      { href: '/analytics', label: 'Performance', hint: 'What the platforms reported' },
      {
        href: '/analytics/learning',
        label: 'Learned',
        hint: 'Beliefs computed from measured performance, and the decisions they informed',
      },
    ],
  },
  {
    href: '/accounts',
    label: 'Setup',
    question: 'Is everything wired up, and does Halyard know the product?',
    tabs: [
      { href: '/accounts', label: 'Accounts', hint: 'What is connected, and what is stopping the rest' },
      { href: '/brain', label: 'Product Brain', hint: 'What Halyard believes, and what backs it' },
      { href: '/products', label: 'Products', hint: 'Add, configure and switch product' },
      { href: '/templates', label: 'Templates', hint: 'Every card and composition, previewable' },
      { href: '/setup-kit', label: 'Setup kit', hint: 'Everything a platform review asks for' },
      { href: '/settings', label: 'Settings', hint: 'Publishing, the kill switch, the model' },
      { href: '/agents', label: 'Agents', hint: 'Who does what, and how they are doing' },
      { href: '/system', label: 'System', hint: 'Jobs, integrations and the audit' },
    ],
    deeper: {
      '/accounts': [
        { href: '/accounts', label: 'Connections' },
        { href: '/accounts/platforms', label: 'Platform rules' },
      ],
      '/settings': [
        { href: '/settings', label: 'General' },
        { href: '/settings/readiness', label: 'Readiness' },
        { href: '/settings/pronunciation', label: 'Pronunciation' },
      ],
    },
  },
];

/**
 * Kept for the navigation test, which holds a frozen list of every destination
 * the sidebar has ever offered. Derived rather than written twice — a second
 * hand-maintained list is exactly the drift the test exists to catch.
 */
export const NAV = SECTIONS.map((s) => ({ href: s.href, label: s.label }));
export const MORE = SECTIONS.filter((s) => s.tabs.length > 0).map((s) => {
  /*
   * Deduped, because a tab's third level repeats the tab itself as its
   * "General" entry — `/settings` is both the Settings tab and the first page
   * inside it, which is one destination reached two ways rather than two
   * destinations.
   */
  const seen = new Set([s.href]);
  const items: Array<{ href: string; label: string }> = [];
  for (const tab of [...s.tabs, ...Object.values(s.deeper ?? {}).flat()]) {
    if (seen.has(tab.href)) continue;
    seen.add(tab.href);
    items.push({ href: tab.href, label: tab.label });
  }
  return { heading: s.label, items };
});

const MOBILE_TABS = [
  { href: '/', label: 'Home' },
  { href: '/make', label: 'Make' },
  { href: '/queue', label: 'Review' },
  { href: '/inbox', label: 'Inbox' },
];

export interface ShellProduct {
  id: string;
  name: string;
  kind: 'product' | 'personal';
}

/**
 * Which section a path belongs to.
 *
 * Longest match wins, so `/settings/readiness` finds Setup through `/settings`
 * rather than falling to Home. Exported because the tab row needs the same
 * answer the sidebar highlight does, and two implementations of "where am I"
 * disagree eventually.
 */
export function sectionFor(pathname: string): NavSection | null {
  let best: NavSection | null = null;
  let bestLength = -1;
  for (const section of SECTIONS) {
    const candidates = [section.href, ...section.tabs.map((t) => t.href)];
    for (const href of candidates) {
      const matches = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
      if (matches && href.length > bestLength) {
        best = section;
        bestLength = href.length;
      }
    }
  }
  return best;
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

  const section = sectionFor(pathname);
  /* The tab whose own deeper list should be showing, if any. */
  const activeTab = section?.tabs.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
  const deeper = activeTab && section?.deeper?.[activeTab.href];

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
              no way to reach products from here at all.

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
            §174. Named landmarks. The shell renders two <nav> elements and
            neither had a name, so a screen reader announced two identical
            "navigation" landmarks with no way to tell them apart.
          */}
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-6">
            {SECTIONS.map((item) => {
              const active = section?.href === item.href;
              const count =
                badgeFor(item.href) ||
                item.tabs.reduce((sum, tab) => sum + badgeFor(tab.href), 0);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    'flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors',
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

        {/*
          §361. The section's own tools, in the section.

          Rendered here rather than by each page, so a new tab appears without
          touching a screen and no two screens can disagree about what section
          they are in.
        */}
        {section && section.tabs.length > 0 ? (
          <div className="border-b border-line bg-surface/60">
            <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 md:px-8">
              <p className="text-xs text-muted">{section.question}</p>
              <nav
                aria-label={`${section.label} tools`}
                className="-mb-px mt-2 flex flex-wrap gap-x-1 gap-y-1 overflow-x-auto"
              >
                {section.tabs.map((tab) => {
                  const active = tab.href === activeTab?.href;
                  const count = badgeFor(tab.href);
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      title={tab.hint}
                      className={cx(
                        'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary font-medium text-primary'
                          : 'border-transparent text-muted hover:text-ink',
                      )}
                    >
                      {tab.label}
                      {count > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : null}

        {deeper ? (
          <div className="border-b border-line bg-sunk/40">
            <nav
              aria-label={`${activeTab?.label} pages`}
              className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-1 px-4 py-2 md:px-8"
            >
              {deeper.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cx(
                    'rounded-md px-2.5 py-1 text-[13px] transition-colors',
                    pathname === tab.href
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted hover:bg-sunk hover:text-ink',
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 pb-tabbar md:px-8 md:py-8 md:pb-10">
          {children}
        </main>

        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface/95 backdrop-blur md:hidden"
        >
          {MOBILE_TABS.map((tab) => {
            const active = section?.href === tab.href;
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
