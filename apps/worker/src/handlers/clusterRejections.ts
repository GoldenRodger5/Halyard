/**
 * The rejection clusterer's caller — the half that was never built.
 *
 * ## What was broken
 *
 * `rejection_clusters` had a complete consumer and no producer. The dashboard
 * selects the top three surfaced clusters, `clusterActions.ts` promotes one
 * into `brand_voices.dont_rules` on a click, and `dont_rules` is read by the
 * copywriter prompt (`prompts.ts`) and the compose stream. Every part of that
 * chain works. Nothing ever inserted a row into the table it starts from, so
 * the only loop that learns from the operator's own rejections never closed —
 * an operator could reject the same thing thirty times and Halyard would keep
 * writing it.
 *
 * The registry has said so plainly: "Referenced only by its own tests."
 *
 * ## Deterministic, with the model as a narrow fallback
 *
 * `clusterRejections` is ordinary code: it matches rejection reasons against
 * known complaint vocabulary and buckets them by category. That is the whole
 * judgement, and it belongs in code — the governing rule assigns a model only
 * the parts that need perception or writing.
 *
 * `inferRejectionPattern` exists for the leftovers, where a group of rejections
 * shares no known vocabulary and naming the pattern is genuinely writing. It is
 * not called here. Doing so would make the one loop that closes depend on model
 * credits, and the deterministic half is the part with value: a named pattern
 * with no rule attached still tells the operator what they keep rejecting.
 *
 * ## Why re-clustering is a replace, not an append
 *
 * Clusters are a view over the rejections that exist right now, not events. A
 * run recomputes them, so a cluster that stops recurring stops being surfaced.
 * Only `status = 'surfaced'` rows are replaced: a cluster the operator has
 * accepted or dismissed is a decision they made, and re-running must not undo
 * it or ask again.
 *
 * Replacing the surfaced rows is not enough on its own, because the rejections
 * that produced a decided cluster are still in the table — recomputing would
 * insert a fresh `surfaced` row for a pattern the operator dealt with
 * yesterday, and ask again every day forever. So a pattern is skipped while a
 * decision on it stands:
 *
 *  · `accepted` — the rule is already in `products.content_rules`. Permanent.
 *  · `dismissed` — suppressed until `dismissed_until`, which `dismissCluster`
 *    sets thirty days out. Deliberately not permanent: its own comment says a
 *    pattern dismissed once may be worth acting on after another ten
 *    rejections, so it comes back when the window lapses.
 */
import { clusterRejections, type RejectionRecord } from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

/**
 * Below this many rejections there is nothing to learn — three occurrences of
 * the same complaint is a pattern, two is a coincidence. `clusterRejections`
 * applies the per-pattern threshold; this is the floor for running at all.
 */
const MIN_REJECTIONS = 3;

/** How far back a rejection still says something about current output. */
const WINDOW_DAYS = 90;

export async function clusterRejectionsHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');

  const { rows } = await ctx.pool.query<{
    id: string;
    category: string;
    reject_reason: string;
    updated_at: Date;
  }>(
    `select id, category, reject_reason, updated_at
       from content_items
      where product_id = $1
        and status = 'rejected'
        and reject_reason is not null
        and reject_reason <> ''
        and updated_at > now() - ($2 || ' days')::interval
      order by updated_at desc`,
    [productId, String(WINDOW_DAYS)],
  );

  if (rows.length < MIN_REJECTIONS) {
    ctx.log('too few rejections to cluster', { productId, rejections: rows.length });
    return;
  }

  const records: RejectionRecord[] = rows.map((r) => ({
    contentItemId: r.id,
    category: r.category,
    reason: r.reject_reason,
    rejectedAt: r.updated_at,
  }));

  const clusters = clusterRejections(records);

  /*
   * Replace the surfaced set in one transaction. Without it a concurrent read
   * from the dashboard can land between the delete and the insert and show an
   * operator that they have nothing to review when they do.
   */
  const client = await ctx.pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `delete from rejection_clusters where product_id = $1 and status = 'surfaced'`,
      [productId],
    );
    for (const cluster of clusters) {
      /*
       * `insert … select … where not exists` rather than a read followed by an
       * insert: the check and the write are one statement, so a second worker
       * cannot decide "no standing decision" between them.
       */
      await client.query(
        `insert into rejection_clusters
           (product_id, category, pattern, example_ids, occurrences, suggested_rule, status)
         select $1, $2, $3, $4, $5, $6, 'surfaced'
          where not exists (
            select 1 from rejection_clusters
             where product_id = $1
               and category is not distinct from $2
               and pattern = $3
               and (
                 status = 'accepted'
                 or (status = 'dismissed' and dismissed_until is not null and dismissed_until > now())
               )
          )`,
        [
          productId,
          cluster.category,
          cluster.pattern,
          cluster.exampleIds,
          cluster.occurrences,
          cluster.suggestedRule,
        ],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  ctx.log('clustered rejections', {
    productId,
    rejections: records.length,
    clusters: clusters.length,
  });
}
