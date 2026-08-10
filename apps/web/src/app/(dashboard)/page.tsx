import Link from 'next/link';
import {
  Badge,
  CAPABILITY_LABEL,
  CAPABILITY_TONE,
  Card,
  EmptyState,
  MiniBar,
  PLATFORM_LABELS,
  PageHeader,
  PlatformDot,
  SectionTitle,
  StatChip,
} from '@halyard/ui';
import { findOpportunities, learningStatus } from '@halyard/core';
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

  const [counts, settings, accounts, mix, targets, analytics, onboarding] = await Promise.all([
    getNavCounts(),
    getSettings(),
    getAccounts(product.id),
    getMix(product.id),
    getMixTargets(product.id),
    getAnalytics(),
    getOnboarding(product.id),
  ]);

  const wizardSteps = [
    ['Ingest brief', onboarding?.step_ingest_done],
    ['Voice bootstrap', onboarding?.step_voice_done],
    ['Calibration batch', onboarding?.step_calibration_done],
    ['Template preview', onboarding?.step_templates_done],
    ['Connect accounts', onboarding?.step_accounts_done],
  ] as const;
  const wizardIncomplete = wizardSteps.filter(([, done]) => !done);

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
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            {product.name}
            {product.tagline ? ` — ${product.tagline}` : ''}. Times shown in{' '}
            {product.operator_timezone}; slots resolve against {product.audience_timezone}.
          </>
        }
      />

      {wizardIncomplete.length > 0 ? (
        <Card className="mb-6 border-warn/40 bg-warn/10 p-5">
          <p className="text-sm font-semibold text-ink">
            First-run calibration is not finished, so daily generation will not run.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Twenty drafts you review and reject with reasons, before any of it goes live. It takes
            about thirty minutes and it is what separates a system trained on your taste from one
            trained on the average of the internet.
          </p>
          <ol className="mt-4 space-y-1.5">
            {wizardSteps.map(([label, done]) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span className={done ? 'text-good' : 'text-muted/50'}>{done ? '✓' : '○'}</span>
                <span className={done ? 'text-muted line-through' : 'text-ink'}>{label}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Continue setup
          </Link>
        </Card>
      ) : null}

      {/* Action strip — v1 §8, each one a link */}
      <div className="mb-8 flex flex-wrap gap-3">
        <StatChip label="pending approval" value={counts.pendingApproval} href="/queue" tone={counts.pendingApproval > 0 ? 'info' : 'neutral'} />
        <StatChip label="scheduled today" value={counts.scheduledToday} href="/calendar" />
        <StatChip label="failed" value={counts.failed} href="/queue?status=failed" tone={counts.failed > 0 ? 'bad' : 'neutral'} />
        <StatChip label="comments waiting" value={counts.inboxPending} href="/inbox" tone={counts.inboxPending > 0 ? 'warn' : 'neutral'} />
      </div>

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
              accounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <PlatformDot platform={account.platform} />
                  <span className="w-24 text-sm font-medium text-ink">
                    {PLATFORM_LABELS[account.platform] ?? account.platform}
                  </span>
                  <span className="text-sm text-muted">{account.handle}</span>
                  <Badge tone={CAPABILITY_TONE[account.capability_state] ?? 'neutral'}>
                    {CAPABILITY_LABEL[account.capability_state] ?? account.capability_state}
                  </Badge>
                  {account.capability_detail ? (
                    <span className="w-full text-xs leading-relaxed text-muted md:w-auto md:flex-1">
                      {account.capability_detail}
                    </span>
                  ) : null}
                </div>
              ))
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
                <span className="font-serif text-2xl text-ink">{Number(value).toLocaleString()}</span>
              </div>
            ))}
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
