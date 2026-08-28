/**
 * Turn measured performance into beliefs the next plan can act on. §204.
 *
 * The whole job is a read, some arithmetic, and an upsert. No model is asked
 * what worked: a model reading a dashboard writes confident sentences with
 * nothing behind them, and the property that makes a belief here worth holding
 * is that anyone can recompute it from the cohorts recorded beside it.
 *
 * ## What it learns from
 *
 * `performance_scores` joined to the creative decisions the item embodied —
 * `generation_meta.creative.type`, the format, the hour it went out. Those are
 * the features a later decision can actually act on; learning that "recipes do
 * well" changes nothing, because nothing chooses whether to be a recipe.
 *
 * ## Three scopes, and why account wins
 *
 * The same computation runs at account, platform, and global scope. An account
 * with enough of its own evidence should not be steered by an average taken
 * across accounts that behave differently — so the scopes are stored separately
 * and the consumer prefers the narrowest one that has earned confidence.
 *
 * ## Unmeasured is not zero
 *
 * `performance_scores` already excludes posts whose metrics were never
 * collected (gotcha 9), and the join here is an inner one, so an uncollected
 * post contributes to no cohort rather than contributing a zero. A fabricated
 * zero would move the mean of every real observation beside it.
 */
import {
  computeInsights,
  reconcileInsight,
  type ContentObservation,
  type Insight,
  type InsightScope,
} from '@halyard/core';
import type { JobHandler } from '../poller.js';

interface ObservationRow {
  content_item_id: string;
  platform: string;
  account_id: string;
  published_at: string;
  score: string | null;
  creative_type: string | null;
  format: string | null;
  posting_hour: string | null;
  duration_bucket: string | null;
}

/** The stored form of a belief, for reconciliation. */
interface StoredRow {
  id: string;
  lift: string;
  confidence: string;
  corroborations: number;
  status: Insight['status'];
  supporting_content_ids: string[];
  sample_size: number;
  baseline_size: number;
  cohort_mean: string;
  baseline_mean: string;
  evidence_window_start: string | null;
  evidence_window_end: string | null;
  observation: string;
  recommendation: string;
  review_after: string;
}

function toStoredInsight(row: StoredRow, template: Insight): Insight {
  return {
    ...template,
    cohortMean: Number(row.cohort_mean),
    baselineMean: Number(row.baseline_mean),
    lift: Number(row.lift),
    sampleSize: row.sample_size,
    baselineSize: row.baseline_size,
    status: row.status,
    confidence: Number(row.confidence),
    corroborations: row.corroborations,
    evidence: {
      supporting: row.supporting_content_ids ?? [],
      contradicting: [],
      windowStart: row.evidence_window_start ? new Date(row.evidence_window_start) : new Date(0),
      windowEnd: row.evidence_window_end ? new Date(row.evidence_window_end) : new Date(0),
    },
    observation: row.observation,
    recommendation: row.recommendation,
    reviewAfter: new Date(row.review_after),
  };
}

export const learnFromPerformanceHandler: JobHandler = async (job, ctx) => {
  const productId = (job.payload.productId as string | undefined) ?? null;

  const { rows } = await ctx.pool.query<ObservationRow>(
    `select ci.id               as content_item_id,
            ci.platform,
            ci.account_id::text as account_id,
            ci.published_at,
            ps.score,
            ci.generation_meta -> 'creative' ->> 'type' as creative_type,
            ci.format,
            /* The hour it actually went out, in UTC. A later decision can act
               on a posting window; it cannot act on a timestamp. */
            to_char(ci.published_at at time zone 'UTC', 'HH24')  as posting_hour,
            /* Duration in coarse buckets. Learning that 23.4s beat 24.1s would
               be learning noise. */
            case
              when a.duration_seconds is null then null
              when a.duration_seconds < 15 then 'under_15s'
              when a.duration_seconds < 30 then '15_30s'
              when a.duration_seconds < 60 then '30_60s'
              else 'over_60s'
            end as duration_bucket
       from content_items ci
       join performance_scores ps on ps.content_item_id = ci.id
       left join lateral (
         select av.duration_seconds
           from renders r
           join assets av on av.id = r.output_asset_id
          where r.id = any(ci.render_ids) and av.mime_type like 'video/%'
          limit 1
       ) a on true
      where ci.status = 'published'
        and ci.published_at is not null
        /* Excluded at the source: a score computed on unmeasured impressions is
           not a weak observation, it is not an observation. */
        and ps.low_confidence is not true
        and ($1::text is null or ci.product_id = $1)`,
    [productId],
  );

  if (rows.length === 0) {
    ctx.log('nothing measured to learn from yet', { productId });
    return;
  }

  const observations: ContentObservation[] = rows.map((r) => ({
    contentItemId: r.content_item_id,
    platform: r.platform,
    accountId: r.account_id,
    publishedAt: new Date(r.published_at),
    features: {
      creative_type: r.creative_type,
      format: r.format,
      posting_hour: r.posting_hour,
      duration_bucket: r.duration_bucket,
    },
    score: r.score === null ? null : Number(r.score),
  }));

  const minSample = (
    await ctx.pool.query<{ n: number }>(
      'select learning_min_posts_per_category as n from settings limit 1',
    )
  ).rows[0]?.n;

  /*
   * Account first, then platform, then everything. Computed separately rather
   * than derived from one another: an account's cohort is not a slice of the
   * global one once different accounts post different things.
   */
  const groups: Array<{ scope: InsightScope; rows: ContentObservation[] }> = [];
  for (const accountId of new Set(observations.map((o) => o.accountId))) {
    groups.push({ scope: 'account', rows: observations.filter((o) => o.accountId === accountId) });
  }
  for (const platform of new Set(observations.map((o) => o.platform))) {
    groups.push({ scope: 'platform', rows: observations.filter((o) => o.platform === platform) });
  }
  groups.push({ scope: 'global', rows: observations });

  let written = 0;
  let reversed = 0;

  for (const group of groups) {
    const insights = computeInsights(group.rows, group.scope, {
      ...(minSample ? { minSample } : {}),
    });

    for (const incoming of insights) {
      const existing = (
        await ctx.pool.query<StoredRow>(
          `select * from learned_insights
            where scope = $1
              and coalesce(platform,'') = coalesce($2,'')
              and coalesce(account_id::text,'') = coalesce($3,'')
              and feature = $4 and feature_value = $5`,
          [
            incoming.scope,
            incoming.platform,
            incoming.accountId,
            incoming.feature,
            incoming.featureValue,
          ],
        )
      ).rows[0];

      const merged = reconcileInsight(
        existing ? toStoredInsight(existing, incoming) : null,
        incoming,
      );
      if (existing && Math.sign(Number(existing.lift)) !== Math.sign(merged.lift)) reversed += 1;

      await ctx.pool.query(
        `insert into learned_insights (
           scope, platform, account_id, product_id, feature, feature_value,
           cohort_mean, baseline_mean, lift, sample_size, baseline_size,
           status, confidence, corroborations,
           supporting_content_ids, contradicting_content_ids,
           evidence_window_start, evidence_window_end,
           observation, recommendation, review_after
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         on conflict (scope, coalesce(platform,''),
                      coalesce(account_id,'00000000-0000-0000-0000-000000000000'::uuid),
                      feature, feature_value)
         do update set
           cohort_mean = excluded.cohort_mean,
           baseline_mean = excluded.baseline_mean,
           lift = excluded.lift,
           sample_size = excluded.sample_size,
           baseline_size = excluded.baseline_size,
           status = excluded.status,
           confidence = excluded.confidence,
           corroborations = excluded.corroborations,
           supporting_content_ids = excluded.supporting_content_ids,
           contradicting_content_ids = excluded.contradicting_content_ids,
           evidence_window_start = excluded.evidence_window_start,
           evidence_window_end = excluded.evidence_window_end,
           observation = excluded.observation,
           recommendation = excluded.recommendation,
           review_after = excluded.review_after,
           updated_at = now()`,
        [
          merged.scope,
          merged.platform,
          merged.accountId,
          productId,
          merged.feature,
          merged.featureValue,
          merged.cohortMean,
          merged.baselineMean,
          merged.lift,
          merged.sampleSize,
          merged.baselineSize,
          merged.status,
          merged.confidence,
          merged.corroborations,
          merged.evidence.supporting,
          merged.evidence.contradicting,
          merged.evidence.windowStart,
          merged.evidence.windowEnd,
          merged.observation,
          merged.recommendation,
          merged.reviewAfter,
        ],
      );
      written += 1;
    }
  }

  ctx.log('learning pass complete', {
    observations: observations.length,
    insights: written,
    reversed,
  });
};
