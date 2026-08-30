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
import { clusterItems, fetchFeed, rankStories, type RssItem } from '@halyard/core';
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

  /**
   * §378. Ranked against what the founder actually works on, with the reason.
   *
   * `relevanceOf` weights a story by which outlets carried it, which is
   * *convergence* and is one of four inputs — and it was the only one being
   * used, because `rankStories` was written, tested, and called by nothing. So
   * the Take screen's "five stories, ranked" was ranked by how many feeds
   * picked something up, with no regard for whether it touches the founder's
   * work, how old it is, or whether they already posted about it. And
   * `rank_reason` — a column since migration 0013 — had never been written, in
   * a file whose own comment says a ranked list without a reason is one you
   * stop trusting after a week. 1,030 rows, 1,030 relevances, zero reasons.
   */
  const { rows: interestRows } = await ctx.pool.query<{ value: string }>(
    `select value from product_facts
      where product_id = $1 and superseded_by is null and category in ('product', 'audience')
      order by confidence desc limit 20`,
    [productId],
  );
  const { rows: recentRows } = await ctx.pool.query<{ title: string }>(
    `select title from rss_items
      where product_id = $1 and status = 'used'
      order by fetched_at desc limit 40`,
    [productId],
  );
  /*
   * Every cluster is ranked, not the top five: the limit is what the *screen*
   * shows, and a row stored with no relevance can never be surfaced later.
   */
  const ranked = new Map(
    rankStories(
      clusters,
      {
        interests: interestRows.map((r) => r.value),
        recentTitles: recentRows.map((r) => r.title),
      },
      clusters.length,
    ).map((story) => [story.guid, story]),
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
          fetched_at, cluster_key, feed_count, expires_at, relevance, rank_reason, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9, $10,
               coalesce($8::timestamptz, now()) + ($11 || ' hours')::interval, $12, $13, 'new')
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
        /*
         * §378. The full ranking when there is one, and the outlet weighting
         * as the floor. `rankStories` drops a story it scores at zero — one
         * already covered — and that is a real answer rather than a missing
         * one, so it is stored as zero rather than falling back to a number
         * that would outrank fresh stories forever.
         */
        ranked.has(cluster.guid)
          ? ranked.get(cluster.guid)!.relevance
          : relevanceOf(
              cluster.sourceNames.map((n) => sources.find((s) => s.name === n)?.weight ?? 1),
            ),
        ranked.get(cluster.guid)?.rankReason ?? null,
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

  const promoted = await promoteToSignals(ctx, productId);
  const fromProduct = await promoteProductFacts(ctx, productId);

  ctx.log('signals collected', {
    productId,
    sources: sources.length,
    failures,
    fetched: fetched.length,
    clusters: clusters.length,
    stored,
    promoted,
    fromProduct,
    // Logged rather than dropped quietly: a source whose every item is stale is
    // an archive feed, not a news feed, and that is worth being able to see.
    stale,
  });
}

/**
 * How many stories become signals in one pass.
 *
 * Small on purpose. Each signal is raw material for a model call downstream,
 * and a run that promoted four hundred would turn one RSS fetch into a very
 * expensive afternoon. The freshest and most-converged few are the ones worth
 * reacting to anyway.
 */
export const PROMOTE_PER_RUN = 5;

/**
 * Turn collected stories into signals the content pipeline can use. §217.
 *
 * **This is the link that was missing, and it stalled everything downstream.**
 * Production had 5,833 `rss_items` and zero `signals`. `proposeFromSignals` is
 * the only producer of `ideas`, it reads `signals`, and nothing wrote any — so
 * `generate` ran daily, found nothing to work with, and exited cleanly. No
 * ideas, therefore no content, therefore no renders, no voiceover, no creative
 * QA, no corrections and nothing for the learning loop to learn from. Seven
 * clean `generate` runs and an empty pipeline.
 *
 * ## Why this does not contradict the header
 *
 * The note at the top of this file says the handler deliberately does not
 * decide what is interesting, because the founder's daily take is input-gated
 * and a handler that pre-judged would put words in their mouth. That still
 * holds, and this does not break it: a signal is not a take. It is raw material
 * for *brand* idea proposal, and everything it produces still passes through
 * `scoreIdeas`, `selectIdeas`, every QC gate and a human approval before it can
 * reach anyone. The founder's opinion is still the founder's to give.
 *
 * ## Shape borrowed rather than invented
 *
 * `watch.ts` already promotes recurring questions into signals: one signal per
 * cluster rather than per hit, `source: 'editorial'`, deduped against a
 * 30-day window, and the source rows stamped so nothing is promoted twice.
 * This follows it exactly — a second promotion pattern would be a second set of
 * duplicate-signal bugs.
 */
export async function promoteToSignals(
  ctx: HandlerContext,
  productId: string,
): Promise<number> {
  const { rows: candidates } = await ctx.pool.query<{
    id: string;
    cluster_key: string;
    title: string;
    summary: string | null;
    url: string;
    relevance: string | null;
    feed_count: number;
    published_at: string | null;
    expires_at: string | null;
  }>(
    `select id, cluster_key, title, summary, url, relevance, feed_count,
            published_at, expires_at
       from rss_items
      where product_id = $1
        and status = 'new'
        and expires_at > now()
      order by relevance desc nulls last, published_at desc nulls last
      limit $2`,
    [productId, PROMOTE_PER_RUN],
  );

  let promoted = 0;

  for (const item of candidates) {
    /*
     * One signal per cluster, and never the same cluster twice in 30 days.
     * A story carried by five outlets is one thing that happened, and the
     * clusterer has already established that — promoting per item would spend
     * five model calls on one story.
     */
    const signal = await ctx.pool.query<{ id: string }>(
      `insert into signals
         (product_id, source, summary, raw, relevance, observed_at, expires_at)
       select $1, 'editorial', $2, $3, $4, $5, $6
        where not exists (
          select 1 from signals
           where product_id = $1 and source = 'editorial'
             and raw ->> 'clusterKey' = $7
             and created_at > now() - interval '30 days')
       returning id`,
      [
        productId,
        item.summary?.trim()
          ? `${item.title} — ${item.summary.trim().slice(0, 400)}`
          : item.title,
        {
          clusterKey: item.cluster_key,
          title: item.title,
          url: item.url,
          outlets: item.feed_count,
          rssItemId: item.id,
        },
        item.relevance === null ? null : Number(item.relevance),
        /* Decay runs from when the story was published, not from when this
           row was written — §206's whole point. */
        item.published_at,
        item.expires_at,
        /* $7 — the dedupe key in the `not exists`. */
        item.cluster_key,
      ],
    );

    /*
     * `surfaced` was already in the status constraint and nothing ever set it.
     * It means exactly this: collected, and now in front of the pipeline.
     *
     * Set whether or not *this* row produced the signal. A story whose cluster
     * a sibling already covered has still been surfaced — by the sibling — and
     * leaving it `new` would be a slow leak: it can never be promoted, it
     * outranks newer stories on relevance, and it would consume one of the five
     * slots on every run for as long as it stays unexpired. The first version
     * of this did exactly that, and the bounded-run test caught it by getting
     * four promotions where it expected five.
     */
    await ctx.pool.query(
      `update rss_items set status = 'surfaced' where id = $1`,
      [item.id],
    );

    if (!signal.rows[0]) continue;
    promoted += 1;
  }

  return promoted;
}

/** How many product facts become signals in one pass. */
export const PROMOTE_FACTS_PER_RUN = 3;

/**
 * A product's own verified capabilities are discovery too. §217.
 *
 * RSS answers "what is the world talking about", which is the right question
 * for a founder persona reacting to the news. It is the wrong one for a brand
 * account, and production proved it: RecipeFix has five connected accounts,
 * **zero RSS sources**, and therefore zero signals and zero ideas — while the
 * eight feeds that do exist belong to the founder product, whose only account
 * is unauthenticated. Discovery was configured for one half of the system and
 * the accounts for the other.
 *
 * The brand's own answer is already in the database: `product_facts` holds what
 * the Product Brain has established the product actually does, with evidence
 * ids and a verification status behind each one. A verified fact is the most
 * defensible thing a brand account can post about — it is true, it is checkable,
 * and §9's rule about never fabricating capability is satisfied by construction.
 *
 * Only `verified` facts are promoted. A `proposed` fact is a claim the Brain has
 * not stood behind yet, and turning one into public content would publish an
 * unverified capability — which is the exact failure the fact status exists to
 * prevent.
 */
export async function promoteProductFacts(
  ctx: HandlerContext,
  productId: string,
): Promise<number> {
  const { rows: facts } = await ctx.pool.query<{
    id: string;
    category: string;
    key: string;
    value: string;
    detail: string | null;
    confidence: string | null;
    last_verified_at: string | null;
  }>(
    `select id, category, key, value, detail, confidence, last_verified_at
       from product_facts
      where product_id = $1
        and status = 'verified'
        and superseded_by is null
        /* Not already the basis of a signal in the last 60 days. A capability
           does not become newsworthy again every six hours. */
        and not exists (
          select 1 from signals
           where product_id = $1 and source = 'product_activity'
             and raw ->> 'factId' = product_facts.id::text
             and created_at > now() - interval '60 days')
      order by confidence desc nulls last, last_verified_at desc nulls last
      limit $2`,
    [productId, PROMOTE_FACTS_PER_RUN],
  );

  let promoted = 0;

  for (const fact of facts) {
    const summary = fact.detail?.trim()
      ? `${fact.value} — ${fact.detail.trim().slice(0, 400)}`
      : fact.value;

    const { rowCount } = await ctx.pool.query(
      `insert into signals
         (product_id, source, summary, raw, relevance, observed_at, confidence)
       values ($1, 'product_activity', $2, $3, $4, $5, $6)`,
      [
        productId,
        summary,
        {
          factId: fact.id,
          category: fact.category,
          key: fact.key,
        },
        /* A verified fact is fully relevant to its own product. Ranking between
           facts is what `confidence` is for. */
        1,
        fact.last_verified_at,
        fact.confidence === null ? null : Number(fact.confidence),
      ],
    );
    promoted += rowCount ?? 0;
  }

  return promoted;
}
