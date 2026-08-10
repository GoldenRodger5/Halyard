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

export async function collectWatchTermsHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');

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
    }

    // Recurrence is measured across everything seen for this term in the last
    // 30 days, not just this pass — the same question asked once a week for a
    // month is exactly the pattern worth writing about.
    const { rows: recent } = await ctx.pool.query<{ title: string; url: string; question: boolean }>(
      `select title, url, question from watch_hits
        where watch_term_id = $1 and seen_at > now() - interval '30 days'`,
      [term.id],
    );

    const recurring = findRecurringQuestions(
      recent.map((r) => ({
        source: 'reddit' as const,
        url: r.url,
        title: r.title,
        question: r.question,
      })),
      term.min_occurrences,
    );

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

    await ctx.pool.query(
      `update watch_terms
          set last_run_at = now(), last_error = $2, last_hit_count = $3
        where id = $1`,
      [term.id, failures.length > 0 ? failures.join(' · ').slice(0, 500) : null, hits.length],
    );
  }

  ctx.log('watch pass complete', { productId, terms: terms.length, stored, promoted });
}
