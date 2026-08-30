import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  MiniBar,
  PLATFORM_LABELS,
  PageHeader,
  PlatformDot,
  SectionTitle,
  StatChip,
} from '@halyard/ui';
import { accountBadge } from '@/lib/accountBadge';
import { findOpportunities, learningStatus, whatNeedsMe } from '@halyard/core';
import {
  getAccounts,
  getAnalytics,
  getMix,
  getMixTargets,
  getNavCounts,
  getOnboarding,
  getProducts,
  getSettings,
} from '@/lib/queries';
import { formatRelative } from '@/lib/format';
import { query } from '@/lib/db';
import { acceptCluster, dismissCluster } from './clusterActions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const products = await getProducts();
  const product = products[0];

  if (!product) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          title="No product configured"
          body="Halyard markets a product, so it needs one before it can do anything. Apply the seed, or add a product on the Products screen."
        />
      </>
    );
  }

  const [counts, settings, accounts, mix, targets, analytics, onboarding, clusters, tempo] = await Promise.all([
    getNavCounts(),
    getSettings(),
    getAccounts(product.id),
    getMix(product.id),
    getMixTargets(product.id),
    getAnalytics(),
    getOnboarding(product.id),
    // Milestone 43: the pattern across recent rejections, surfaced once it
    // crosses the threshold. Dismissed clusters stay suppressed for 30 days.
    query<{
      id: string;
      pattern: string;
      category: string | null;
      occurrences: number;
      suggested_rule: string | null;
    }>(
      `select id, pattern, category, occurrences, suggested_rule
         from rejection_clusters
        where product_id = $1
          and status = 'surfaced'
          and (dismissed_until is null or dismissed_until < now())
        order by occurrences desc limit 3`,
      [product.id],
    ),
    /*
      §365. The two facts the next-action ladder needs that nothing else on this
      page reads: how long the oldest waiting piece has waited, and whether the
      next seven days have anything in them. Both asked here rather than derived
      from the counters, because "pending > 0" cannot tell a fresh queue from
      one that has been ignored for a week.
    */
    query<{ oldest_days: string | null; scheduled_next7: string; ever_published: string }>(
      `select
         (select floor(extract(epoch from (now() - min(created_at))) / 86400)::text
            from content_items
           where product_id = $1 and status = 'pending_approval')            as oldest_days,
         (select count(*)::text from content_items
           where product_id = $1
             and status in ('approved','scheduled')
             and scheduled_at between now() and now() + interval '7 days')   as scheduled_next7,
         (select count(*)::text from content_items
           where product_id = $1 and status = 'published')                   as ever_published`,
      [product.id],
    ),
  ]);

  /**
   * §365. What to do next, resolved in code and displayed here.
   *
   * The badge helper is the same one the accounts screen and the health screen
   * use, so "connected" means here exactly what it means there — gotcha 5's
   * whole point is that `capability_state` is a record of a decision rather
   * than a statement that the account works.
   */
  const badges = accounts.map((account) => accountBadge(account));
  const action = whatNeedsMe({
    hasProduct: true,
    setupIncomplete: [
      !onboarding?.step_ingest_done && 'the brief',
      !onboarding?.step_voice_done && 'the voice',
      !onboarding?.step_calibration_done && 'the calibration batch',
      !onboarding?.step_templates_done && 'the template review',
      !onboarding?.step_accounts_done && 'connecting accounts',
    ].filter((s): s is string => typeof s === 'string'),
    publishingEnabled: settings.publishing_enabled,
    connectedAccounts: badges.filter((b) => b.tone === 'good').length,
    brokenAccounts: badges.filter((b) => b.tone === 'bad').length,
    failed: counts.failed,
    pendingApproval: counts.pendingApproval,
    oldestPendingDays:
      tempo[0]?.oldest_days === null || tempo[0]?.oldest_days === undefined
        ? null
        : Number(tempo[0].oldest_days),
    inboxWaiting: counts.inboxPending,
    scheduledNext7: Number(tempo[0]?.scheduled_next7 ?? 0),
    hasEverPublished: Number(tempo[0]?.ever_published ?? 0) > 0,
  });

  const wizardSteps = [
    ['Ingest brief', onboarding?.step_ingest_done],
    ['Voice bootstrap', onboarding?.step_voice_done],
    ['Calibration batch', onboarding?.step_calibration_done],
    ['Template preview', onboarding?.step_templates_done],
    ['Connect accounts', onboarding?.step_accounts_done],
  ] as const;

  const actualByCategory = Object.fromEntries(mix.map((m) => [m.category, Number(m.share)]));
  const postsByCategory = Object.fromEntries(mix.map((m) => [m.category, m.published]));

  const learning = learningStatus({
    targets: targets as never,
    actual: actualByCategory as never,
    productShare14d: actualByCategory.product ?? 0,
    postsPerCategory: postsByCategory as never,
  });

  const opportunities = findOpportunities({
    byCategory: analytics.postsPerCategory.map((c) => ({
      category: c.category,
      posts: c.posts,
      activatedPer1k: c.impressions > 0 ? (c.activated / c.impressions) * 1000 : 0,
    })),
    byPlatform: analytics.byPlatform.map((p) => ({
      platform: p.platform,
      posts: p.posts,
      activatedPer1k: p.impressions > 0 ? (p.activated / p.impressions) * 1000 : 0,
      linkClicks: p.link_clicks,
    })),
    minPostsForClaim: settings.learning_min_posts_per_category,
  });

  return (
    <>
      {/*
        The product, not the word "Dashboard". A title that names the screen
        type tells an operator with one product nothing they did not know from
        clicking Home; the product and its line are what orient somebody who
        runs two.
      */}
      <PageHeader
        title={product.name}
        subtitle={
          <>
            {product.tagline ? `${product.tagline}. ` : ''}Times shown in{' '}
            {product.operator_timezone}; slots resolve against {product.audience_timezone}.
          </>
        }
      />

      {/*
        §365. One thing, at the top, before anything that has to be interpreted.
        The panels below are all still here and all still true; this says which
        of them is today's.
      */}
      <Card
        className={`mb-6 p-5 ${
          action.tone === 'blocked'
            ? 'border-warn/40 bg-warn/10'
            : action.tone === 'waiting'
              ? 'border-primary/30 bg-primary/5'
              : ''
        }`}
      >
        <p className="font-serif text-2xl leading-tight text-ink">{action.title}</p>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{action.because}</p>

        {/*
          The checklist belongs to the band rather than beside it. It lived in a
          second card that repeated the same sentence in different words, so the
          first thing on the screen was two paragraphs arguing about which of
          them was the announcement.
        */}
        {action.rung === 'setup' ? (
          <ol className="mt-4 space-y-1.5">
            {wizardSteps.map(([label, done]) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span className={done ? 'text-good' : 'text-muted/50'}>{done ? '✓' : '○'}</span>
                <span className={done ? 'text-muted line-through' : 'text-ink'}>{label}</span>
              </li>
            ))}
          </ol>
        ) : null}

        <Link
          href={action.href}
          className={`mt-4 inline-flex rounded-lg px-3.5 py-2 text-sm font-medium ${
            action.tone === 'calm'
              ? 'border border-line text-ink hover:bg-sunk'
              : 'bg-primary text-white hover:bg-primary-dark'
          }`}
        >
          {action.cta}
        </Link>
      </Card>

      {/* Action strip — v1 §8, each one a link */}
      <div className="mb-8 flex flex-wrap gap-3">
        <StatChip label="pending approval" value={counts.pendingApproval} href="/queue" tone={counts.pendingApproval > 0 ? 'info' : 'neutral'} />
        <StatChip label="scheduled today" value={counts.scheduledToday} href="/calendar" />
        <StatChip label="failed" value={counts.failed} href="/queue?status=failed" tone={counts.failed > 0 ? 'bad' : 'neutral'} />
        <StatChip label="comments waiting" value={counts.inboxPending} href="/inbox" tone={counts.inboxPending > 0 ? 'warn' : 'neutral'} />
      </div>

      {/* ── What my rejections have in common ─────────────────────────────
          The operating model's promise that taste becomes legible to the
          operator, not only to the system. */}
      {clusters.length > 0 ? (
        <section className="mb-8">
          <SectionTitle hint="what your last rejections had in common">
            A pattern in what you reject
          </SectionTitle>
          <div className="space-y-3">
            {clusters.map((cluster) => (
              <Card key={cluster.id} className="border-warn/40 bg-warn/5 p-4">
                <p className="text-sm text-ink">
                  {cluster.occurrences} of your recent rejections were{' '}
                  <strong>{cluster.pattern}</strong>
                  {cluster.category ? ` in ${cluster.category}` : ''}.
                </p>
                {cluster.suggested_rule ? (
                  <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm text-muted">
                    Proposed rule: “{cluster.suggested_rule}”
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    No rule fits this cleanly yet — the reasons do not share enough vocabulary to
                    turn into a filter.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {cluster.suggested_rule ? (
                    <form action={acceptCluster}>
                      <input type="hidden" name="id" value={cluster.id} />
                      <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                        Make it a rule
                      </button>
                    </form>
                  ) : null}
                  <form action={dismissCluster}>
                    <input type="hidden" name="id" value={cluster.id} />
                    <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                      Not a pattern — hide for 30 days
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionTitle hint="one chip per platform">Account health</SectionTitle>
          <Card className="divide-y divide-line">
            {accounts.length === 0 ? (
              <div className="p-5 text-sm text-muted">
                No accounts connected. Register the six developer apps and run OAuth on{' '}
                <Link href="/accounts" className="text-primary underline">
                  Accounts
                </Link>
                . Reviews are wall-clock time you cannot compress, so start them on day two.
              </div>
            ) : (
              accounts.map((account) => {
                const badge = accountBadge(account);
                return (
                /*
                 * §172. A row that reports a problem is the row a person clicks to
                 * fix it. These were plain divs: the badge said NOT CONNECTED, the
                 * cursor stayed an arrow, and clicking did nothing — the connect
                 * button was on another page that the row never mentioned.
                 *
                 * The anchor lands on that platform's own card, not the top of a
                 * page holding seven of them.
                 */
                <Link
                  key={account.id}
                  href={`/accounts#${account.persona}-${account.platform}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-sunk"
                >
                  <PlatformDot platform={account.platform} />
                  <span className="w-24 text-sm font-medium text-ink">
                    {PLATFORM_LABELS[account.platform] ?? account.platform}
                  </span>
                  <span className="text-sm text-muted">{account.handle}</span>
                  <span title={badge.explanation}>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </span>
                  {account.capability_detail ? (
                    <span className="w-full text-xs leading-relaxed text-muted md:w-auto md:flex-1">
                      {account.capability_detail}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-muted" aria-hidden>
                    &rsaquo;
                  </span>
                </Link>
                );
              })
            )}
          </Card>

          <div className="mt-6">
            <SectionTitle hint="trailing 21 days">Content mix, target vs actual</SectionTitle>
            <Card className="space-y-3 p-5">
              {Object.keys(targets).length === 0 ? (
                <p className="text-sm text-muted">No mix targets set on the brand voice yet.</p>
              ) : (
                Object.entries(targets).map(([category, target]) => {
                  const actual = actualByCategory[category] ?? 0;
                  const debt = target - actual;
                  return (
                    <div key={category}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="capitalize text-ink">{category}</span>
                        <span className="text-xs text-muted">
                          {(actual * 100).toFixed(0)}% of {(target * 100).toFixed(0)}%
                          {debt > 0.05 ? ' — under-served' : debt < -0.05 ? ' — over-served' : ''}
                        </span>
                      </div>
                      <MiniBar value={actual} max={Math.max(target, actual, 0.01)} tone={debt > 0.05 ? 'warn' : 'info'} />
                    </div>
                  );
                })
              )}
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle hint="last 7 days">Performance</SectionTitle>
          <Card className="divide-y divide-line">
            {[
              ['Impressions', analytics.funnel.impressions],
              ['Link clicks', analytics.funnel.clicks],
              ['Signups', analytics.funnel.signups],
              ['Activated users', analytics.funnel.activated],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline justify-between px-5 py-3">
                <span className="text-sm text-muted">{label}</span>
                <span className="font-serif text-2xl text-ink">
                  {/* An em dash rather than a zero. Nothing measured and nobody
                      engaged look identical as "0", and only one of them is a
                      reason to change anything. */}
                  {analytics.coldStart.funnel.empty ? '—' : Number(value).toLocaleString()}
                </span>
              </div>
            ))}
            {analytics.coldStart.funnel.message ? (
              <p className="px-5 py-3 text-xs leading-relaxed text-muted">
                {analytics.coldStart.funnel.message}
              </p>
            ) : null}
          </Card>

          <div className="mt-6">
            <SectionTitle>Opportunities</SectionTitle>
            <Card className="space-y-3 p-5">
              {opportunities.map((line) => (
                <p key={line} className="text-sm leading-relaxed text-ink">
                  {line}
                </p>
              ))}
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-muted">
                {learning.message}
              </p>
            </Card>
          </div>

          {!settings.publishing_enabled ? (
            <Card className="mt-6 border-danger/30 bg-danger/10 p-5">
              <p className="text-sm font-semibold text-danger">Publishing is paused</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {settings.publishing_disabled_reason ??
                  'The kill switch is on. Every publish job stops at the first check.'}
              </p>
              <Link href="/settings" className="mt-3 inline-flex text-sm text-primary underline">
                Settings
              </Link>
            </Card>
          ) : null}
        </section>
      </div>

      <p className="mt-8 text-xs text-muted">
        Last checked {formatRelative(new Date().toISOString(), product.operator_timezone)}.
      </p>
    </>
  );
}
