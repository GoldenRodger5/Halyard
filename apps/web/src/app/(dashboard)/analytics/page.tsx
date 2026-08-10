import { Banner, Card, EmptyState, MiniBar, PLATFORM_LABELS, PageHeader, SectionTitle } from '@halyard/ui';
import { attributionReadiness } from '@halyard/core';
import { getAnalytics, getSettings } from '@/lib/queries';
import { formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const [analytics, settings] = await Promise.all([getAnalytics(), getSettings()]);

  const readiness = attributionReadiness({
    postsWithStampedLinks: analytics.stampedLinks,
    attributionRowsSeen: analytics.attributionRows,
    postHogConfigured: Boolean(process.env.POSTHOG_PROJECT_API_KEY),
  });

  const minPosts = settings.learning_min_posts_per_category;
  const readyCategories = analytics.postsPerCategory.filter((c) => c.posts >= minPosts);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Conversion by content category is the chart that decides strategy. Everything above it is a leading indicator."
      />

      {!readiness.ready ? (
        <Banner tone="warn" title="Attribution is not producing data">
          {readiness.message}
        </Banner>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        {[
          ['Impressions', analytics.funnel.impressions],
          ['Link clicks', analytics.funnel.clicks],
          ['Signups', analytics.funnel.signups],
          ['Activated users', analytics.funnel.activated],
        ].map(([label, value], i, all) => {
          const previous = i === 0 ? null : Number(all[i - 1]![1]);
          const rate = previous && previous > 0 ? (Number(value) / previous) * 100 : null;
          return (
            <Card key={String(label)} className="p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">{label}</p>
              <p className="mt-1 font-serif text-3xl text-ink">{formatNumber(Number(value))}</p>
              {rate !== null ? (
                <p className="mt-1 text-xs text-muted">{rate.toFixed(1)}% of the step before</p>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle hint="activated users per 1,000 impressions">
            Conversion by category
          </SectionTitle>
          {readyCategories.length < 2 ? (
            <EmptyState
              title="Not enough data yet"
              body={
                <>
                  Meaningful comparison needs about {minPosts} posts per category.{' '}
                  {analytics.postsPerCategory.length === 0
                    ? 'Nothing has been published yet.'
                    : `The busiest category has ${Math.max(...analytics.postsPerCategory.map((c) => c.posts))}.`}{' '}
                  A chart here now would be noise rendered as signal.
                </>
              }
            />
          ) : (
            <Card className="space-y-4 p-4">
              {readyCategories.map((category) => {
                const per1k =
                  category.impressions > 0 ? (category.activated / category.impressions) * 1000 : 0;
                const best = Math.max(
                  ...readyCategories.map((c) =>
                    c.impressions > 0 ? (c.activated / c.impressions) * 1000 : 0,
                  ),
                );
                return (
                  <div key={category.category}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="capitalize text-ink">{category.category}</span>
                      <span className="text-muted">
                        {per1k.toFixed(2)} per 1k · {category.posts} posts
                      </span>
                    </div>
                    <MiniBar value={per1k} max={Math.max(best, 0.01)} tone="good" />
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        {/* The table scrolls inside its own container; the page body must never
            scroll horizontally on a phone. */}
        <section className="min-w-0">
          <SectionTitle hint="normalised per post">Platform comparison</SectionTitle>
          {analytics.byPlatform.length === 0 ? (
            <EmptyState title="No published posts" body="Nothing to compare yet." />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-muted">
                    <th className="px-4 py-2.5 font-medium">Platform</th>
                    <th className="px-4 py-2.5 text-right font-medium">Posts</th>
                    <th className="px-4 py-2.5 text-right font-medium">Impr/post</th>
                    <th className="px-4 py-2.5 text-right font-medium">Activated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {analytics.byPlatform.map((row) => (
                    <tr key={row.platform}>
                      <td className="px-4 py-2.5 text-ink">
                        {PLATFORM_LABELS[row.platform] ?? row.platform}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">{row.posts}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {formatNumber(Math.round(row.impressions / Math.max(row.posts, 1)))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                        {formatNumber(row.activated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
