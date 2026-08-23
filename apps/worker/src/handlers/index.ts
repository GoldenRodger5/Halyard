/**
 * Job handler registry. One file per kind where the logic is substantial;
 * the smaller collectors live here.
 */
import {
  attributionReadiness,
  fetchAttribution,
  getAdapter,
  openToken,
  repostEligibleAt,
  scorePosts,
  unmeasured,
  refreshDueTokens,
  type PlatformId,
  type PublishAccount,
} from '@halyard/core';
import type { JobKind } from '@halyard/db';
import { PermanentJobFailure } from '../poller.js';
import type { Job, HandlerContext, JobHandler } from '../poller.js';
import { classifyObservationFailure, recordAccountObservation } from '../observations.js';
import { publishHandler } from './publish.js';
import { renderHandler } from './render.js';
import { generateHandler } from './generate.js';
import { reconcileScheduleHandler } from './reconcile.js';
import { captureHandler, markStaleAssetsHandler } from './capture.js';
import { collectAppStoreAttribution } from './appStore.js';
import { detectReleaseHandler } from './detectRelease.js';
import { collectWatchTermsHandler } from './watch.js';
import { draftNewsletterHandler, sendNewsletterHandler } from './newsletter.js';
import { collectReviewsHandler } from './reviews.js';
import { clusterRejectionsHandler } from './clusterRejections.js';
import { digestHandler } from './digest.js';
import { purgeLogsHandler } from './purgeLogs.js';
import { reviewMediaHandler } from './reviewMedia.js';
import { collectSignalsHandler } from './signals.js';
import { ttsHandler } from './tts.js';
import { exploreHandler } from './explore.js';
import { collectEvidenceHandler } from './collectEvidence.js';
import { buildBrainHandler } from './buildBrain.js';
import { verifyCapabilityHandler } from './verifyCapability.js';
import { verifyFeatureHandler } from './verifyFeature.js';

/**
 * Load an account for a job that is about to use its credential.
 *
 * Returns **null** when no credential is stored, and that is the whole point.
 * This used to hand back `accessToken: ''` — an empty string is a value, so the
 * request was built, sent, and refused by the platform with an empty bearer.
 * Every caller then spent a real API call, and its retries, to learn something
 * the row it had just read already said.
 *
 * It is reachable in ordinary ways: a seeded account marked `live` that never
 * had a token, and any account whose credential an operator erased with
 * Disconnect while collection jobs were still queued against its publications.
 * `capability_state` cannot answer this — `live` has never meant "connected".
 */
async function loadAccount(
  ctx: HandlerContext,
  accountId: string,
): Promise<PublishAccount | null> {
  const { rows } = await ctx.pool.query<{
    id: string;
    platform: PlatformId;
    handle: string;
    platform_user_id: string | null;
    capability_state: PublishAccount['capabilityState'];
    access_token_enc: Buffer | null;
    refresh_token_enc: Buffer | null;
    scopes: string[];
  }>('select * from social_accounts where id = $1', [accountId]);

  const row = rows[0];
  if (!row) throw new Error(`account ${accountId} not found`);
  if (!row.access_token_enc) return null;

  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    platformUserId: row.platform_user_id,
    capabilityState: row.capability_state,
    tokens: {
      accessToken: openToken(row.access_token_enc),
      refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
      scopes: row.scopes,
    },
  };
}

/** v1 §4.1 — metrics polled on a decaying schedule after publication. */
const METRIC_POLL_HOURS = [1, 6, 24, 72, 168];

const collectMetrics: JobHandler = async (job, ctx) => {
  /**
   * §155. The guard every sibling handler has.
   *
   * `String(undefined)` is `'undefined'`, which reaches Postgres as a uuid and
   * comes back as `invalid input syntax for type uuid: "undefined"` — a message
   * about the database rather than about the job. Worse, it is retried: the
   * payload cannot become valid, so the whole retry budget is spent rediscovering
   * the same malformed row.
   */
  const publicationId = String(job.payload.publicationId ?? '');
  if (!publicationId) {
    throw new PermanentJobFailure(
      'collect_metrics job has no publicationId. It is enqueued by `publish` after a real ' +
        'publication; a job without one cannot be made valid by retrying.',
      'a missing payload field is not transient',
    );
  }
  const { rows } = await ctx.pool.query<{
    id: string;
    account_id: string;
    platform: PlatformId;
    platform_post_id: string | null;
    published_at: string | null;
  }>('select * from publications where id = $1', [publicationId]);

  const publication = rows[0];
  if (!publication?.platform_post_id) return;

  const account = await loadAccount(ctx, publication.account_id);
  if (!account) {
    /**
     * Stop, and stop rescheduling. A missing credential is not transient, and
     * the decay schedule would otherwise re-enqueue this every few hours
     * forever against an account that cannot answer.
     */
    ctx.log('skipping metrics, account has no stored credential', {
      publicationId,
      accountId: publication.account_id,
      platform: publication.platform,
    });
    return;
  }
  const adapter = getAdapter(publication.platform);
  const snapshot = await adapter.collectMetrics(
    { platformPostId: publication.platform_post_id },
    account,
  );

  await ctx.pool.query(
    `insert into post_metrics (publication_id, impressions, reach, likes, comments, shares,
                               saves, video_views, watch_time_seconds, profile_visits,
                               link_clicks, follows, raw, purge_after)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      publicationId,
      snapshot.impressions ?? null,
      snapshot.reach ?? null,
      snapshot.likes ?? null,
      snapshot.comments ?? null,
      snapshot.shares ?? null,
      snapshot.saves ?? null,
      snapshot.videoViews ?? null,
      snapshot.watchTimeSeconds ?? null,
      snapshot.profileVisits ?? null,
      snapshot.linkClicks ?? null,
      snapshot.follows ?? null,
      snapshot.raw ?? null,
      snapshot.purgeAfter ?? null,
    ],
  );

  // Schedule the next poll, if there is one left in the decay schedule.
  const publishedAt = publication.published_at ? new Date(publication.published_at) : new Date();
  const ageHours = (Date.now() - publishedAt.getTime()) / 3_600_000;
  const next = METRIC_POLL_HOURS.find((h) => h > ageHours);
  if (next) {
    await ctx.enqueue(
      'collect_metrics',
      { publicationId },
      {
        runAfter: new Date(publishedAt.getTime() + next * 3_600_000),
        dedupeKey: `metrics:${publicationId}:${next}h`,
      },
    );
  }
};

/**
 * v2 I.1 — poll comments for 24 hours at declining frequency (5min → 15min →
 * 1hr). Engagement in the first 30 to 60 minutes disproportionately determines
 * distribution, so the early polls are the ones that matter.
 */
const COMMENT_POLL_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

const collectComments: JobHandler = async (job, ctx) => {
  const publicationId = String(job.payload.publicationId);
  const pollNumber = Number(job.payload.pollNumber ?? 1);

  const { rows } = await ctx.pool.query<{
    id: string;
    account_id: string;
    platform: PlatformId;
    platform_post_id: string | null;
  }>('select * from publications where id = $1', [publicationId]);
  const publication = rows[0];
  if (!publication?.platform_post_id) return;

  const adapter = getAdapter(publication.platform);
  if (!adapter.listComments) return;

  const account = await loadAccount(ctx, publication.account_id);
  if (!account) {
    /**
     * Recorded as an observation, because "the probe could not run — there is
     * no credential" is exactly what `unavailable` means, and it is what an
     * operator wondering why a verified read went quiet needs to see. It is
     * inert to the resolver in both directions, so it cannot demote the earlier
     * confirmation; it only explains the silence.
     */
    await recordAccountObservation(ctx, {
      accountId: publication.account_id,
      platform: publication.platform,
      action: 'read_comments',
      outcome: 'unavailable',
      detail:
        'No credential is stored for this account, so no read was attempted. This says nothing about what the account is permitted to do.',
      observed: { publicationId },
      jobId: job.id,
    });
    ctx.log('skipping comments, account has no stored credential', {
      publicationId,
      accountId: publication.account_id,
    });
    return;
  }

  /**
   * The read is also the probe.
   *
   * `read_comments` had no way to reach `verified`: nothing wrote an
   * account-scoped observation, so the resolver could only ever report what the
   * adapter *declares*. This call is the only thing in Halyard that actually
   * exercises the permission against a real account, so it records what it saw
   * — at no extra API cost, because the call had to happen anyway.
   *
   * A failure is never recorded as `refuted`. A deleted post, an expired token
   * and a rate limit all look like this, and none of them proves the account
   * cannot read comments. See `observations.ts`.
   */
  let comments: Awaited<ReturnType<NonNullable<typeof adapter.listComments>>>;
  try {
    comments = await adapter.listComments(
      { platformPostId: publication.platform_post_id },
      account,
    );
  } catch (err) {
    const failure = classifyObservationFailure(err);
    await recordAccountObservation(ctx, {
      accountId: publication.account_id,
      platform: publication.platform,
      action: 'read_comments',
      outcome: failure.outcome,
      detail: failure.detail,
      observed: { publicationId },
      jobId: job.id,
    });
    // Rethrown: the job still failed, and the retry policy still applies. The
    // observation records what was seen; it does not swallow the failure.
    throw err;
  }

  /**
   * A read that returned is evidence the permission is live, including when it
   * returns nothing. An empty list is what a post with no comments looks like;
   * a *missing* permission is an error on every platform Halyard connects to,
   * and would have gone down the branch above. The detail says exactly what was
   * observed so the claim can be re-checked rather than trusted.
   */
  await recordAccountObservation(ctx, {
    accountId: publication.account_id,
    platform: publication.platform,
    action: 'read_comments',
    outcome: 'confirmed',
    detail: `Read the comments on a real publication through the direct ${publication.platform} adapter; the platform accepted the request and returned ${comments.length} comment(s).`,
    observed: { publicationId, commentCount: comments.length },
    jobId: job.id,
  });

  for (const comment of comments) {
    // The AI drafts a reply; a human sends it. There is no code path here that
    // sends anything (v1 §13, v2 I.1).
    await ctx.pool.query(
      `insert into comments (publication_id, platform_comment_id, author_handle,
                             author_display_name, body, posted_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (publication_id, platform_comment_id) do nothing`,
      [
        publicationId,
        comment.platformCommentId,
        comment.authorHandle ?? null,
        comment.authorDisplayName ?? null,
        comment.body,
        comment.postedAt ?? null,
      ],
    );
  }

  const nextMinutes = COMMENT_POLL_MINUTES[pollNumber];
  if (nextMinutes !== undefined) {
    await ctx.enqueue(
      'collect_comments',
      { publicationId, pollNumber: pollNumber + 1 },
      {
        runAfter: new Date(Date.now() + nextMinutes * 60_000),
        dedupeKey: `comments:${publicationId}:${pollNumber + 1}`,
      },
    );
  }
};

const collectAttribution: JobHandler = async (_job, ctx) => {
  const host = process.env.POSTHOG_HOST;
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  const stamped = await ctx.pool.query<{ count: string }>(
    `select count(*) from content_items where final_link_url is not null and status = 'published'`,
  );

  if (!host || !apiKey || !projectId) {
    ctx.log('attribution skipped', {
      reason: attributionReadiness({
        postsWithStampedLinks: Number(stamped.rows[0]?.count ?? 0),
        attributionRowsSeen: 0,
        postHogConfigured: false,
      }).message,
    });
    return;
  }

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await fetchAttribution({ host, apiKey, projectId }, since);

  for (const row of rows) {
    await ctx.pool.query(
      `insert into attribution (content_item_id, sessions, signups, activated_users,
                                adaptations, saves, cook_starts, paid_conversions)
       select $1,$2,$3,$4,$5,$6,$7,$8
        where exists (select 1 from content_items where id = $1)`,
      [
        row.contentItemId,
        row.sessions,
        row.signups,
        row.activatedUsers,
        row.adaptations,
        row.saves,
        row.cookStarts,
        row.paidConversions,
      ],
    );
  }

  ctx.log('attribution collected', {
    rows: rows.length,
    readiness: attributionReadiness({
      postsWithStampedLinks: Number(stamped.rows[0]?.count ?? 0),
      attributionRowsSeen: rows.length,
      postHogConfigured: true,
    }).message,
  });
};

const scorePerformance: JobHandler = async (_job, ctx) => {
  const { rows } = await ctx.pool.query<{
    content_item_id: string;
    published_at: string | null;
    impressions: string | null;
    likes: string | null;
    comments: string | null;
    shares: string | null;
    saves: string | null;
    follows: string | null;
    link_clicks: string | null;
    activated_users: string | null;
  }>(
    `select ci.id as content_item_id,
            ci.published_at,
            m.impressions, m.likes, m.comments, m.shares, m.saves, m.follows, m.link_clicks,
            a.activated_users
       from content_items ci
       join publications p on p.content_item_id = ci.id
       left join lateral (
         select * from post_metrics pm
          where pm.publication_id = p.id
          order by collected_at desc limit 1
       ) m on true
       left join lateral (
         select * from attribution at
          where at.content_item_id = ci.id
          order by collected_at desc limit 1
       ) a on true
      where ci.status = 'published'`,
  );

  /**
   * `null` is carried through rather than coerced.
   *
   * This read `Number(r.impressions ?? 0)`, and the join is a `left join
   * lateral` — a published post with no `post_metrics` row at all arrives here
   * as all-nulls. Coercing turned "never collected" into "measured, and zero",
   * which then earned a real score, a real percentile and a row in
   * `performance_scores`. Worse than one wrong score: percentiles are computed
   * over the cohort, so each fabricated zero moved every measured post's score
   * too.
   *
   * The engagement counts stay `?? 0`: they are only ever read as a numerator
   * over measured impressions, and a platform that reports impressions but not
   * saves is a transport gap `missingMetrics()` already names.
   */
  const inputs = rows.map((r) => ({
    contentItemId: r.content_item_id,
    impressions: r.impressions === null ? null : Number(r.impressions),
    likes: Number(r.likes ?? 0),
    comments: Number(r.comments ?? 0),
    shares: Number(r.shares ?? 0),
    saves: Number(r.saves ?? 0),
    follows: Number(r.follows ?? 0),
    linkClicks: Number(r.link_clicks ?? 0),
    activatedUsers: Number(r.activated_users ?? 0),
  }));

  const skipped = unmeasured(inputs);
  if (skipped.length > 0) {
    // Said out loud: "nothing published" and "published but never collected"
    // are different problems and look identical in an empty scores table.
    ctx.log('scoring skipped unmeasured posts', {
      skipped: skipped.length,
      scored: inputs.length - skipped.length,
      why: 'no metrics have been collected for them, so any score would be invented',
    });
  }

  const scores = scorePosts(inputs);

  for (const score of scores) {
    await ctx.pool.query(
      `insert into performance_scores (content_item_id, score, reach_score, engagement_score,
                                       conversion_score, low_confidence, computed_at, notes)
       values ($1,$2,$3,$4,$5,$6,now(),$7)
       on conflict (content_item_id) do update
         set score = excluded.score,
             reach_score = excluded.reach_score,
             engagement_score = excluded.engagement_score,
             conversion_score = excluded.conversion_score,
             low_confidence = excluded.low_confidence,
             computed_at = now(),
             notes = excluded.notes`,
      [
        score.contentItemId,
        score.score,
        score.reachScore,
        score.engagementScore,
        score.conversionScore,
        score.lowConfidence,
        score.notes,
      ],
    );

    // v2 I.6 — a strong post comes back sooner.
    const row = rows.find((r) => r.content_item_id === score.contentItemId);
    if (row?.published_at) {
      await ctx.pool.query('update content_items set eligible_for_repost_at = $2 where id = $1', [
        score.contentItemId,
        repostEligibleAt(new Date(row.published_at), score.score),
      ]);
    }
  }

  // Pinterest retention (v2 A.5 / build pack §9).
  const purged = await ctx.pool.query(
    'delete from post_metrics where purge_after is not null and purge_after < now()',
  );
  ctx.log('performance scored', { posts: scores.length, purgedMetricRows: purged.rowCount ?? 0 });
};

const refreshTokens: JobHandler = async (_job, ctx) => {
  /**
   * The worker performs the refresh, rather than reporting on it.
   *
   * This handler used to select the accounts due and log them, deferring the
   * actual refresh to the web tier's cron route. That route is scheduled in
   * `apps/web/vercel.json` as `0 4 * * *` — once a day, because Hobby accounts
   * allow one cron run per day — and an X access token lives **two hours**. So
   * nothing kept a token alive: it expired, the next publish failed, and the
   * account was marked `error` telling the operator to reconnect something that
   * had been working.
   *
   * The scheduler already places this job hourly for exactly that reason. Now
   * the handler does the work, which needs `X_CLIENT_ID` and `X_CLIENT_SECRET`
   * in the worker's environment — X authenticates the client on refresh, not
   * only the user.
   *
   * Nothing here logs a token.
   */
  const result = await refreshDueTokens({
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
      (await ctx.pool.query(sql, params)).rows as T[],
  });

  ctx.log('token refresh pass', { ...result });

  /**
   * Missing credentials is a configuration problem, and a silent one: every
   * account would be skipped and the pass would look like a clean no-op right
   * up until the tokens expired. Said out loud instead.
   */
  if (result.skippedNoCredentials > 0) {
    ctx.log('token refresh skipped for want of client credentials', {
      accounts: result.skippedNoCredentials,
      why: 'The platform client id/secret are not set in this environment, so the refresh could not be attempted. Tokens will expire.',
    });
  }
};

export const HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  publish: publishHandler,
  render: renderHandler,
  generate: generateHandler,
  reconcile_schedule: reconcileScheduleHandler,
  collect_metrics: collectMetrics,
  collect_comments: collectComments,
  collect_attribution: collectAttribution,
  score_performance: scorePerformance,
  refresh_tokens: refreshTokens,
  review_media: reviewMediaHandler,
  tts: ttsHandler,
  verify_feature: verifyFeatureHandler,
  explore_product: exploreHandler,
  collect_product_evidence: collectEvidenceHandler,
  build_product_brain: buildBrainHandler,
  verify_provider_capability: verifyCapabilityHandler,
  collect_signals: collectSignalsHandler,
  capture: captureHandler,
  mark_stale_assets: markStaleAssetsHandler,
  collect_app_store: collectAppStoreAttribution,
  detect_release: detectReleaseHandler,
  collect_watch_terms: collectWatchTermsHandler,
  draft_newsletter: draftNewsletterHandler,
  send_newsletter: sendNewsletterHandler,
  collect_reviews: collectReviewsHandler,
  cluster_rejections: clusterRejectionsHandler,
  digest_email: digestHandler,
  purge_logs: purgeLogsHandler,
};

export type { Job, HandlerContext };
