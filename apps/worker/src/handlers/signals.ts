/**
 * Fetch the RSS feeds. The handler that was scheduled and never written.
 *
 * `collect_signals` has been on the schedule for the entire life of this
 * system, running every six hours, with **no handler registered anywhere**. The
 * poller claimed each job, found nothing to run it with, put it back, and
 * repeated. Thirteen of them accumulated in production over seventy-five hours
 * while every other kind completed normally. No error, no dead letter, no
 * alert — the branch that could have noticed returned quietly, and now it
 * notifies.
 *
 * Everything this needs already existed: `parseFeed`, `fetchFeed`,
 * `clusterItems`, eight seeded `rss_sources`, an `rss_items` table and a
 * `/take` screen that reads it. Only the twenty lines joining them were absent,
 * which is why the founder's daily take has never had a story to react to.
 *
 * ## What it does, and what it deliberately does not
 *
 * It fetches, deduplicates and stores. It does **not** decide what is
 * interesting, rank by taste, or draft anything. Those are the take screen's
 * job and they are input-gated on purpose: the founder persona says nothing
 * without the founder's own opinion, and a handler that pre-judged the stories
 * would be putting words in their mouth.
 */
import { clusterItems, fetchFeed, type RssItem } from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

interface SourceRow {
  id: string;
  product_id: string;
  name: string;
  feed_url: string;
  weight: number;
}

/** How long a story stays worth reacting to, measured from when it was published. */
export const STORY_TTL_HOURS = 48;

/**
 * How much a story matters: convergence, scaled by who carried it.
 *
 * Every source is seeded with a `weight` and a `why` — Hacker News at 1.4,
 * Anthropic and OpenAI at 1.3, arXiv deliberately lowest at 0.6 because it
 * publishes hundreds of preprints a day. That column was read in exactly one
 * place: `order by weight desc` on the polling loop, which decides the order
 * feeds are fetched in and nothing else.
 *
 * So the editorial judgment had no effect. With convergence alone, every
 * single-outlet story scored an identical 0.33 and the tie broke on recency —
 * which handed the entire take screen to arXiv, the one source explicitly rated
 * least important. All five slots, every day.
 *
 * Convergence still leads: three outlets covering the same morning is the
 * strongest signal here. Weight scales it, so a story Hacker News carried alone
 * (0.47) outranks a preprint nobody else picked up (0.20), and anything three
 * outlets carried saturates regardless.
 *
 * The highest contributing weight wins rather than the mean: if Hacker News and
 * arXiv both carried it, it is a Hacker News story.
 */
export function relevanceOf(outletWeights: number[]): number {
  if (outletWeights.length === 0) return 0;
  const convergence = outletWeights.length / 3;
  return Math.min(1, convergence * Math.max(...outletWeights));
}

/**
 * Is this story still worth an opinion?
 *
 * The TTL was originally applied as `now() + 48 hours` at insert — expiry
 * measured from **when we happened to fetch it**, not when it was published.
 * Several of these feeds serve a deep archive rather than a recent window, so
 * the first successful run stored 2,118 stories and marked every one of them
 * `new`: 1,135 were more than a year old and the oldest was from **2015**. The
 * take screen dutifully offered all of them as things to react to today.
 *
 * Nothing errored. The count went up, which read as the feature working.
 *
 * A story's age is a property of the story. Fetching it late does not make it
 * news, so the window is anchored to `publishedAt` and stale items are never
 * ingested at all — storing them just to expire them in the same transaction
 * would inflate `stored` and teach the health screen to expect churn.
 *
 * A feed with no date on an item is the one case where fetch time is the only
 * clock available. Those are kept: an undated item from a feed we poll every
 * six hours is far more likely to be new than to be from 2015, and dropping
 * everything undated would silently blind the take screen to whole sources.
 */
export function isWorthReacting(
  publishedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!publishedAt) return true;
  const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
  return ageHours < STORY_TTL_HOURS;
}

/**
 * Which products to collect for.
 *
 * **Not the one in the payload, and that distinction is the whole bug.** The
 * scheduler's `perProduct` option enqueues one job per row in
 * `products where kind = 'product'`, which is `recipefix`. Every RSS source
 * belongs to `founder`, the *personal* persona — these are the feeds the daily
 * take reacts to, and a founder's opinions are not a product's.
 *
 * So the first fixed version ran, found no sources for recipefix, logged "no
 * rss sources configured" and returned. Thirteen jobs drained from `queued` to
 * `done` and the feeds were still never polled. It looked exactly like a fix.
 *
 * Following the data rather than the payload: collect for whichever products
 * actually have enabled sources. An explicit `productId` still narrows it, for
 * a manual run.
 */
async function productsToCollect(ctx: HandlerContext, requested?: string): Promise<string[]> {
  const { rows } = await ctx.pool.query<{ product_id: string }>(
    `select distinct s.product_id
       from rss_sources s
       join products p on p.id = s.product_id
      where s.enabled and p.status = 'active'
        and ($1::text is null or s.product_id = $1)
      order by 1`,
    [requested ?? null],
  );
  return rows.map((r) => r.product_id);
}

export async function collectSignalsHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const requested = job.payload.productId ? String(job.payload.productId) : undefined;
  const products = await productsToCollect(ctx, requested);

  if (products.length === 0) {
    ctx.log('no products have rss sources', { requested: requested ?? 'any' });
    return;
  }

  for (const productId of products) {
    await collectForProduct(productId, ctx);
  }
}

async function collectForProduct(productId: string, ctx: HandlerContext): Promise<void> {
  const { rows: sources } = await ctx.pool.query<SourceRow>(
    `select id, product_id, name, feed_url, weight
       from rss_sources where product_id = $1 and enabled
       order by weight desc`,
    [productId],
  );

  if (sources.length === 0) {
    ctx.log('no rss sources configured', { productId });
    return;
  }

  const fetched: Array<{ source: SourceRow; item: RssItem }> = [];
  let failures = 0;

  for (const source of sources) {
    try {
      const items = await fetchFeed(source.feed_url);
      for (const item of items) fetched.push({ source, item });

      await ctx.pool.query(
        `update rss_sources set last_polled_at = now(), last_error = null where id = $1`,
        [source.id],
      );
    } catch (err) {
      failures += 1;
      // A feed that has gone away is a fact about that feed, not a reason to
      // abandon the other seven. Recorded so /settings/health can show it.
      await ctx.pool.query(
        `update rss_sources set last_polled_at = now(), last_error = $2 where id = $1`,
        [source.id, (err as Error).message.slice(0, 500)],
      );
      ctx.log('feed failed', { source: source.name, error: (err as Error).message });
    }
  }

  if (fetched.length === 0) {
    ctx.log('no items fetched', { productId, sources: sources.length, failures });
    return;
  }

  /**
   * The same story arrives from five feeds with five headlines.
   *
   * Convergence across feeds is signal rather than noise — a story three
   * outlets covered on the same morning is a different thing from one blog
   * post — so items are grouped and the group size is kept as a ranking input
   * rather than deduplicated away.
   */
  const clusters = clusterItems(
    fetched.map((f) => ({ ...f.item, sourceName: f.source.name })),
  );

  let stored = 0;
  let stale = 0;
  for (const cluster of clusters) {
    if (!isWorthReacting(cluster.publishedAt)) {
      stale += 1;
      continue;
    }

    const origin = fetched.find((f) => f.item.guid === cluster.guid)?.source ?? sources[0]!;

    const { rowCount } = await ctx.pool.query(
      `insert into rss_items
         (source_id, product_id, guid, url, title, summary, author, published_at,
          fetched_at, cluster_key, feed_count, expires_at, relevance, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9, $10,
               coalesce($8::timestamptz, now()) + ($11 || ' hours')::interval, $12, 'new')
       on conflict (product_id, guid) do nothing`,
      [
        origin.id,
        productId,
        cluster.guid,
        cluster.url,
        cluster.title,
        cluster.summary ?? null,
        cluster.author ?? null,
        cluster.publishedAt ?? null,
        cluster.clusterKey,
        // **Distinct outlets, not items.**
        //
        // `feedCount` counts everything the clusterer absorbed, and a single
        // feed publishing "Introducing X", "Introducing Y" and "Introducing Z"
        // absorbs its own headlines on title similarity. The first real run
        // scored "Introducing OpenAI Presence" at 15 — all from one source —
        // and called it maximum convergence.
        //
        // Convergence means *three different outlets covered this*, which is
        // what `sourceNames` actually measures.
        cluster.sourceNames.length,
        String(STORY_TTL_HOURS),
        relevanceOf(
          cluster.sourceNames.map((n) => sources.find((s) => s.name === n)?.weight ?? 1),
        ),
      ],
    );
    stored += rowCount ?? 0;
  }

  // Expiry rather than deletion: a story nobody reacted to is still evidence of
  // what the feeds were carrying that week.
  await ctx.pool.query(
    `update rss_items set status = 'expired'
      where product_id = $1 and status = 'new' and expires_at < now()`,
    [productId],
  );

  ctx.log('signals collected', {
    productId,
    sources: sources.length,
    failures,
    fetched: fetched.length,
    clusters: clusters.length,
    stored,
    // Logged rather than dropped quietly: a source whose every item is stale is
    // an archive feed, not a news feed, and that is worth being able to see.
    stale,
  });
}
