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

        {/* ── Routed clicks and App Store conversions ─────────────────────── */}
        <section className="min-w-0">
          <SectionTitle hint="every click through /r, by the device that made it">
            Where clicks came from
          </SectionTitle>
          {analytics.clicksByDevice.length === 0 ? (
            <EmptyState
              title="No routed clicks yet"
              body="Published links point at Halyard's router, which decides the destination by device and records the click. The first one appears here once a post goes out and someone taps it."
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-muted">
                    <th className="px-4 py-2.5 font-medium">Device</th>
                    <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                    <th className="px-4 py-2.5 text-right font-medium">Posts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {analytics.clicksByDevice.map((row) => (
                    <tr key={row.device_class}>
                      <td className="px-4 py-2.5 text-ink">
                        {row.device_class}
                        {row.device_class === 'bot' ? (
                          <span className="ml-2 text-xs text-muted">
                            preview crawlers, counted separately so they do not inflate the rest
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                        {formatNumber(row.clicks)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">{row.posts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <section className="min-w-0">
          <SectionTitle hint="a different system, never summed with web sessions">
            App Store
          </SectionTitle>
          <Card className="p-4">
            {!analytics.appStore.configured ? (
              <p className="text-sm text-muted">
                No App Analytics provider token is configured, so every App Store install reads as
                organic and mobile-first platforms are systematically under-scored. Find it in App
                Store Connect under Analytics → Campaigns and set{' '}
                <code className="text-primary">app_analytics_provider_token</code> in the
                product&rsquo;s destinations. Campaign links then carry{' '}
                <code className="text-primary">pt</code>, <code className="text-primary">ct</code>{' '}
                and <code className="text-primary">mt=8</code>, which is what App Store Connect
                reads.
              </p>
            ) : analytics.appStore.installs === 0 ? (
              <p className="text-sm text-muted">
                Campaign links are configured; no conversions collected yet.
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {[
                  ['Impressions', analytics.appStore.impressions],
                  ['Product page views', analytics.appStore.productPageViews],
                  ['Installs', analytics.appStore.installs],
                  ['First-time', analytics.appStore.firstTimeDownloads],
                  ['Redownloads', analytics.appStore.redownloads],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs uppercase tracking-[0.08em] text-muted">{label}</dt>
                    <dd className="mt-1 text-xl tabular-nums text-ink">
                      {formatNumber(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 text-xs text-muted">
              These are App Store conversions, kept in their own columns. An install is not a web
              session and Apple counts a redownload separately, so adding them to the funnel above
              would produce a number that means nothing.
            </p>
          </Card>
        </section>
      </div>
    </>
  );
}
