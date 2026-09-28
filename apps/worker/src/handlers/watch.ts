/**
 * The watch-terms pass. Milestone 43, item 4.
 *
 * Read-only, once a day. It reads public sources for the terms the operator
 * cares about, stores what it finds, and promotes only the questions that keep
 * recurring into signals the idea engine can use.
 *
 * There is no write path to any of these platforms from here — no reply, no
 * upvote, no follow, no DM — and `watch.test.ts` asserts that absence the same
 * way the adapter contract asserts there is no `reply()`.
 */
import {
  WatchSourceUnavailable,
  fetchPinterestTrends,
  fetchReddit,
  fetchRss,
  findRecurringQuestions,
  deriveDiscoveryTerms,
  expiryFor,
  openToken,
  type WatchHit,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

interface TermRow {
  id: string;
  product_id: string;
  term: string;
  sources: string[];
  min_occurrences: number;
}

async function syncBrainManagedWatchTerms(
  ctx: HandlerContext,
  productId: string,
): Promise<number> {
  const { rows: facts } = await ctx.pool.query<{
    id: string;
    category: string;
    key: string;
    value: string;
    confidence: string | null;
  }>(
    `select id, category, key, value, confidence
       from product_facts
      where product_id = $1
        and status = 'verified'
        and superseded_by is null
        and category in (
          'content_pillars','jobs_to_be_done','personas','workflows',
          'users','differentiators','app_store_positioning'
        )
      order by confidence desc nulls last, updated_at desc
      limit 60`,
    [productId],
  );

  const terms = deriveDiscoveryTerms(
    facts.map((fact) => ({
      id: fact.id,
      category: fact.category,
      key: fact.key,
      value: fact.value,
      confidence: fact.confidence === null ? null : Number(fact.confidence),
    })),
    8,
  );

  if (terms.length === 0) return 0;

  const active = terms.map((term) => term.term);
  await ctx.pool.query(
    `update watch_terms
        set enabled = false
      where product_id = $1
        and managed_by = 'product_brain'
        and not (term = any($2::text[]))`,
    [productId, active],
  );

  let written = 0;
  for (const term of terms) {
    const result = await ctx.pool.query(
      `insert into watch_terms
         (product_id, term, sources, enabled, min_occurrences, managed_by, source_fact_ids)
       values ($1,$2,'{reddit,pinterest}'::text[],true,3,'product_brain',$3::uuid[])
       on conflict (product_id, term) do update
         set enabled = true,
             source_fact_ids = excluded.source_fact_ids
       where watch_terms.managed_by = 'product_brain'`,
      [productId, term.term, term.factIds],
    );
    written += result.rowCount ?? 0;
  }

  return written;
}

async function promoteRedditMomentum(
  ctx: HandlerContext,
  term: TermRow,
  productId: string,
): Promise<number> {
  const { rows } = await ctx.pool.query<{
    current_hits: string;
    previous_hits: string;
    current_engagement: string;
    urls: string[];
  }>(
    `select
       count(*) filter (where seen_at > now() - interval '7 days')::text as current_hits,
       count(*) filter (
         where seen_at <= now() - interval '7 days'
           and seen_at > now() - interval '14 days'
       )::text as previous_hits,
       coalesce(sum(coalesce(engagement,0)) filter (
         where seen_at > now() - interval '7 days'
       ),0)::text as current_engagement,
       coalesce(
         (array_agg(url order by seen_at desc) filter (
           where seen_at > now() - interval '7 days'
         ))[1:5],
         '{}'::text[]
       ) as urls
     from watch_hits
    where watch_term_id = $1 and source = 'reddit'`,
    [term.id],
  );

  const current = Number(rows[0]?.current_hits ?? 0);
  const previous = Number(rows[0]?.previous_hits ?? 0);
  const engagement = Number(rows[0]?.current_engagement ?? 0);
  const minimum = Math.max(3, term.min_occurrences);

  /*
   * Three mentions with no response can still be coincidence. Require either
   * some demonstrated engagement or a denser cluster before calling it a trend.
   */
  if (current < minimum || (engagement < 20 && current < minimum * 2)) return 0;

  const rawVelocity = previous === 0 ? 0.3 : (current - previous) / previous / 3;
  const velocity = Math.max(-0.3, Math.min(0.3, rawVelocity));
  if (velocity <= 0 && current < minimum * 2) return 0;

  const relevance = Math.max(
    0.5,
    Math.min(0.9, 0.45 + current / 20 + Math.min(0.15, engagement / 1000)),
  );
  const trendKey = `reddit:${term.term.trim().toLowerCase()}`;
  const observedAt = new Date();

  const signal = await ctx.pool.query<{ id: string }>(
    `insert into signals
       (product_id, source, summary, raw, relevance, observed_at,
        expires_at, confidence, velocity)
     select $1, 'trend', $2, $3, $4, $5, $6, $7, $8
      where not exists (
        select 1 from signals
         where product_id = $1 and source = 'trend'
           and raw ->> 'trendKey' = $9
           and created_at > now() - interval '7 days'
      )
     returning id`,
    [
      productId,
      `Reddit discussion around "${term.term}" is accelerating: ${current} hit(s) in 7 days vs ${previous} the week before, with ${engagement} observed engagement.`,
      {
        trendKey,
        term: term.term,
        occurrences7d: current,
        previous7d: previous,
        engagement7d: engagement,
        urls: rows[0]?.urls ?? [],
      },
      relevance,
      observedAt,
      expiryFor('trend', observedAt),
      0.75,
      velocity,
      trendKey,
    ],
  );

  return signal.rows[0] ? 1 : 0;
}

export async function collectWatchTermsHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');
  const onlySources = Array.isArray(job.payload.onlySources)
    ? new Set(job.payload.onlySources.map((value) => String(value)))
    : null;

  const managedTerms = await syncBrainManagedWatchTerms(ctx, productId);

  const { rows: terms } = await ctx.pool.query<TermRow>(
    `select id, product_id, term, sources, min_occurrences
       from watch_terms where product_id = $1 and enabled`,
    [productId],
  );
  if (terms.length === 0) return;

  // Pinterest trends ride the same token as publishing, when it exists.
  const { rows: pinterestRows } = await ctx.pool.query<{ access_token_enc: Buffer | null }>(
    `select access_token_enc from social_accounts
      where product_id = $1 and platform = 'pinterest' and access_token_enc is not null limit 1`,
    [productId],
  );
  const pinterestToken = pinterestRows[0]?.access_token_enc
    ? openToken(pinterestRows[0].access_token_enc)
    : undefined;

  let stored = 0;
  let promoted = 0;

  for (const term of terms) {
    const hits: WatchHit[] = [];
    const failures: string[] = [];

    for (const source of term.sources) {
      if (onlySources && !onlySources.has(source)) continue;
      try {
        if (source === 'reddit') {
          hits.push(...(await fetchReddit(term.term)));
        } else if (source === 'rss') {
          // An RSS "term" is a feed URL; a plain term has no feed to read.
          if (/^https?:\/\//.test(term.term)) hits.push(...(await fetchRss(term.term)));
        } else if (source === 'pinterest') {
          hits.push(...(await fetchPinterestTrends(term.term, { accessToken: pinterestToken })));
        }
      } catch (err) {
        // One source being unavailable must not lose the others. Pinterest is
        // expected to be unavailable until Standard access lands, so it is
        // recorded rather than alarmed about.
        const message =
          err instanceof WatchSourceUnavailable
            ? err.message
            : `${source}: ${(err as Error).message}`;
        failures.push(message);
        ctx.log('watch source unavailable', { term: term.term, source, message });
      }
    }

    for (const hit of hits) {
      const inserted = await ctx.pool.query<{ id: string }>(
        `insert into watch_hits (watch_term_id, product_id, source, url, title, excerpt,
                                 author, engagement, posted_at, question)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (watch_term_id, url) do nothing
         returning id`,
        [
          term.id,
          productId,
          hit.source,
          hit.url,
          hit.title.slice(0, 500),
          hit.excerpt ?? null,
          hit.author ?? null,
          hit.engagement ?? null,
          hit.postedAt ?? null,
          hit.question,
        ],
      );
      stored += inserted.rowCount ?? 0;

      /*
       * Pinterest Trends is already an aggregate observation, not an individual
       * post/question. Requiring the keyword to recur as a question would throw
       * away the thing the official endpoint measured: momentum.
       */
      if (hit.source === 'pinterest' && hit.trend) {
        const observedAt = hit.postedAt ?? new Date();
        const velocity = hit.trend.velocity ?? null;
        const relevance = Math.max(
          0.5,
          Math.min(0.9, 0.75 + (velocity ?? 0) * 0.5),
        );
        const trendKey = hit.title.trim().toLowerCase();
        const growthBits = [
          hit.trend.pctGrowthWow != null ? `${hit.trend.pctGrowthWow}% WoW` : null,
          hit.trend.pctGrowthMom != null ? `${hit.trend.pctGrowthMom}% MoM` : null,
          hit.trend.pctGrowthYoy != null ? `${hit.trend.pctGrowthYoy}% YoY` : null,
        ].filter(Boolean);

        const signal = await ctx.pool.query<{ id: string }>(
          `insert into signals
             (product_id, source, summary, raw, relevance, observed_at,
              expires_at, confidence, velocity, platform)
           select $1, 'trend', $2, $3, $4, $5, $6, 0.98, $7, 'pinterest'
            where not exists (
              select 1 from signals
               where product_id = $1 and source = 'trend'
                 and platform = 'pinterest'
                 and raw ->> 'trendKey' = $8
                 and created_at > now() - interval '7 days'
            )
           returning id`,
          [
            productId,
            `Pinterest trend: "${hit.title}"${growthBits.length ? ` (${growthBits.join(', ')})` : ''}`,
            {
              trendKey,
              term: term.term,
              sourceUrl: hit.url,
              ...hit.trend,
            },
            relevance,
            observedAt,
            expiryFor('trend', observedAt),
            velocity,
            trendKey,
          ],
        );

        if (signal.rows[0]) {
          promoted += 1;
          await ctx.pool.query(
            `update watch_hits
                set signal_id = $3, promoted_at = now()
              where watch_term_id = $1 and url = $2`,
            [term.id, hit.url, signal.rows[0].id],
          );
        }
      }
    }

    const questionSourcesEnabled =
      !onlySources || onlySources.has('reddit') || onlySources.has('rss');

    // Recurrence is measured across everything seen for this term in the last
    // 30 days, but only on passes that intentionally include question sources.
    const recent = questionSourcesEnabled
      ? (
          await ctx.pool.query<{ title: string; url: string; question: boolean }>(
            `select title, url, question from watch_hits
              where watch_term_id = $1 and seen_at > now() - interval '30 days'`,
            [term.id],
          )
        ).rows
      : [];

    const recurring = questionSourcesEnabled
      ? findRecurringQuestions(
          recent.map((r) => ({
            source: 'reddit' as const,
            url: r.url,
            title: r.title,
            question: r.question,
          })),
          term.min_occurrences,
        )
      : [];

    for (const question of recurring) {
      // One signal per recurring question, not one per hit.
      const signal = await ctx.pool.query<{ id: string }>(
        `insert into signals (product_id, source, summary, raw, relevance)
         select $1, 'editorial', $2, $3, $4
          where not exists (
            select 1 from signals
             where product_id = $1 and source = 'editorial'
               and raw ->> 'questionKey' = $5
               and created_at > now() - interval '30 days')
         returning id`,
        [
          productId,
          `Asked ${question.occurrences} times in the last 30 days: "${question.title}"`,
          {
            questionKey: question.key,
            term: term.term,
            occurrences: question.occurrences,
            urls: question.urls,
          },
          Math.min(1, question.occurrences / 10),
          question.key,
        ],
      );

      if (signal.rows[0]) {
        promoted++;
        await ctx.pool.query(
          `update watch_hits set signal_id = $2, promoted_at = now()
            where watch_term_id = $1 and url = any($3::text[])`,
          [term.id, signal.rows[0].id, question.urls],
        );
      }
    }

    if (term.sources.includes('reddit') && (!onlySources || onlySources.has('reddit'))) {
      promoted += await promoteRedditMomentum(ctx, term, productId);
    }

    await ctx.pool.query(
      `update watch_terms
          set last_run_at = now(), last_error = $2, last_hit_count = $3
        where id = $1`,
      [term.id, failures.length > 0 ? failures.join(' · ').slice(0, 500) : null, hits.length],
    );
  }

  ctx.log('watch pass complete', {
    productId,
    terms: terms.length,
    brainManagedTerms: managedTerms,
    stored,
    promoted,
  });
}
