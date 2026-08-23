
/**
 * Promoting an operator's find into a `signal`.
 *
 * ## What a find was, and was not
 *
 * `addFind` inserted a row and enqueued `collect_signals` with
 * `{ summariseFindUrl }`. **Nothing handles that payload** — `collect_signals`
 * fetches RSS feeds and has never read it — so `finds.title` and
 * `finds.summary` are always null, and the job did unrelated work. The find's
 * only route onward was `draftFind`, which writes a post directly.
 *
 * So a find could become one post and could never become evidence. Meanwhile
 * `signals` had exactly one writer, and the idea generator that now reads it
 * (`DECISIONS.md` §84) saw only recurring questions from watch terms.
 *
 * ## The operator's line is the evidence
 *
 * Not the URL. `draftFind` already says so — "Their line about why it is useful
 * is the seed AND the constraint" — and refuses to draft without it. The same
 * gate applies here: a find with no reason is a bookmark, and promoting it
 * would put a bare link in front of the idea generator as though someone had
 * vouched for it.
 *
 * ## Operator evidence is marked as operator evidence — in `raw`, not `source`
 *
 * The distinction matters: a question Halyard watched recur across public
 * sources and one person saying "this matters" are both real evidence and are
 * not the same kind.
 *
 * `signals.source` cannot carry it. It is a **closed vocabulary** —
 * `signals_source_check` allows exactly `product_activity`, `changelog`,
 * `editorial`, `seasonal`, `trend`, `performance`, `submission` — and none of
 * them means "the operator handed this over". A real-database test found that
 * by being rejected on insert; a mocked one would have written
 * `source = 'operator_find'` happily and shipped it.
 *
 * So the source is `editorial`, which is what it is, and the distinction lives
 * in `raw.collectedBy` where it is explicit and queryable
 * (`raw ->> 'collectedBy' = 'operator'`). Extending the constraint would mean a
 * migration and a new vocabulary value — gotcha 1's exact shape, a list written
 * in TypeScript and SQL at once — for a distinction `raw` already expresses.
 *
 * If a consumer ever needs to filter by collection method at the *source* level
 * rather than inside the payload, that is the point at which the migration
 * earns itself. Recorded in `DECISIONS.md` §85 rather than pre-empted here.
 *
 * ## Deduplication is the existing semantic
 *
 * A `not exists` guard on `raw ->> 'findId'` within a window, which is exactly
 * how `watch.ts` guards on `raw ->> 'questionKey'`. Nothing new invented.
 *
 * ## Why the query is injected
 *
 * The same shape as `refreshDueTokens` and `disconnectAccount`: the caller
 * supplies the database surface, so a test can run this statement against a
 * real isolated Postgres instead of a copy of it. A test that re-types the SQL
 * proves the copy works.
 */

/** The narrow database surface this needs, so a test can drive it. */
export type FindSignalQuery = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;
export const FIND_SIGNAL_SOURCE = 'editorial';

/**
 * What actually separates this from a watched signal.
 *
 * Both are `editorial`; only this says who collected it. `watch.ts` writes no
 * `collectedBy`, so its absence reads as "not operator-supplied" rather than as
 * a missing field.
 */
export const FIND_SIGNAL_COLLECTED_BY = 'operator';

/**
 * How long the same find is considered already-signalled.
 *
 * The same thirty days `watch.ts` uses for a recurring question, and for the
 * same reason: a signal that regenerates every time a screen is refreshed is
 * noise, and the idea generator consumes signals rather than tracking them.
 */
export const FIND_SIGNAL_WINDOW_DAYS = 30;

export interface PromotedFind {
  id: string;
  productId: string;
  url: string;
  whyUseful: string | null;
  title?: string | null;
}

/**
 * Write the signal, or don't. Returns the signal id when one was created.
 *
 * Null covers three different honest outcomes — no reason given, already
 * signalled inside the window, or nothing to promote — and the caller does not
 * need to tell them apart. What it must not do is report a signal that was not
 * written.
 */
export async function promoteFindToSignal(
  query: FindSignalQuery,
  find: PromotedFind,
): Promise<string | null> {
  const why = (find.whyUseful ?? '').trim();
  // No reason, no signal. The same gate `draftFind` applies before it will write
  // a word: without it there is nothing to say, only a link.
  if (!why) return null;
  if (!find.productId || !find.url) return null;

  const rows = await query<{ id: string }>(
    `insert into signals (product_id, source, summary, raw, relevance)
     select $1, $2, $3, $4, null
      where not exists (
        select 1 from signals
         where product_id = $1 and source = $2
           and raw ->> 'findId' = $5
           and created_at > now() - ($6 || ' days')::interval)
     returning id`,
    [
      find.productId,
      FIND_SIGNAL_SOURCE,
      // The operator's sentence leads, because it is the part with judgement in
      // it. The URL follows as the thing being judged.
      `${why} — ${find.url}`,
      JSON.stringify({
        findId: find.id,
        url: find.url,
        title: find.title ?? null,
        whyUseful: why,
        /**
         * Said out loud in the evidence itself. A pasted URL is not something
         * Halyard discovered, and anything reading `raw` later should be able
         * to tell without inferring it from the source string.
         */
        collectedBy: FIND_SIGNAL_COLLECTED_BY,
      }),
      find.id,
      String(FIND_SIGNAL_WINDOW_DAYS),
    ],
  );

  return rows[0]?.id ?? null;
}
