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
  type PlatformId,
  type PublishAccount,
} from '@halyard/core';
import type { JobKind } from '@halyard/db';
import type { Job, HandlerContext, JobHandler } from '../poller.js';
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
import { reviewMediaHandler } from './reviewMedia.js';
import { collectSignalsHandler } from './signals.js';
import { ttsHandler } from './tts.js';

async function loadAccount(ctx: HandlerContext, accountId: string): Promise<PublishAccount> {
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

  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    platformUserId: row.platform_user_id,
    capabilityState: row.capability_state,
    tokens: {
      accessToken: row.access_token_enc ? openToken(row.access_token_enc) : '',
      refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
      scopes: row.scopes,
    },
  };
}

/** v1 §4.1 — metrics polled on a decaying schedule after publication. */
const METRIC_POLL_HOURS = [1, 6, 24, 72, 168];

const collectMetrics: JobHandler = async (job, ctx) => {
  const publicationId = String(job.payload.publicationId);
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
  const comments = await adapter.listComments(
    { platformPostId: publication.platform_post_id },
    account,
  );

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

  const scores = scorePosts(
    rows.map((r) => ({
      contentItemId: r.content_item_id,
      impressions: Number(r.impressions ?? 0),
      likes: Number(r.likes ?? 0),
      comments: Number(r.comments ?? 0),
      shares: Number(r.shares ?? 0),
      saves: Number(r.saves ?? 0),
      follows: Number(r.follows ?? 0),
      linkClicks: Number(r.link_clicks ?? 0),
      activatedUsers: Number(r.activated_users ?? 0),
    })),
  );

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
  // Refresh runs an hour before expiry (v1 §7). Nothing here logs a token.
  const { rows } = await ctx.pool.query<{ id: string; handle: string; platform: PlatformId }>(
    `select id, handle, platform from social_accounts
      where token_expires_at is not null
        and token_expires_at < now() + interval '1 hour'
        and capability_state in ('live','draft_only')`,
  );
  ctx.log('tokens due for refresh', { count: rows.length, accounts: rows.map((r) => r.handle) });
  // The refresh itself needs client credentials, which live in the web app's
  // environment; the web cron route performs it. This job exists to surface the
  // set and to alert if it is not shrinking.
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
  collect_signals: collectSignalsHandler,
  capture: captureHandler,
  mark_stale_assets: markStaleAssetsHandler,
  collect_app_store: collectAppStoreAttribution,
  detect_release: detectReleaseHandler,
  collect_watch_terms: collectWatchTermsHandler,
  draft_newsletter: draftNewsletterHandler,
  send_newsletter: sendNewsletterHandler,
  collect_reviews: collectReviewsHandler,
};

export type { Job, HandlerContext };
