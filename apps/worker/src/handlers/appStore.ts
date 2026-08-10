/**
 * App Store attribution collection. Milestone 42, item 4.
 *
 * Runs daily. Apple reports against the campaign token a link carried, and the
 * token is the content item's id, so a row here maps one App Store install back
 * to one post.
 *
 * These numbers are stored in their own table and shown in their own columns.
 * They are never added to web sessions: an install is not a session, Apple
 * counts a redownload separately, and a single summed figure would mean nothing.
 */
import {
  AppStoreCredentialsMissing,
  AppStoreReportPending,
  credentialsFromEnv,
  fetchCampaignReport,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

export async function collectAppStoreAttribution(
  _job: Job,
  ctx: HandlerContext,
): Promise<void> {
  let credentials;
  try {
    credentials = credentialsFromEnv();
  } catch (err) {
    if (err instanceof AppStoreCredentialsMissing) {
      // Not a failure worth retrying — it is a missing credential, and saying so
      // once a day is more useful than a job that keeps dying.
      await ctx.pool.query(
        `insert into notifications (kind, severity, title, body, dedupe_key)
         values ('connector_down', 'warning', $1, $2, $3)
         on conflict (dedupe_key) do nothing`,
        [
          'App Store attribution is not configured',
          err.message,
          `app_store_creds:${new Date().toISOString().slice(0, 10)}`,
        ],
      );
      ctx.log('app store attribution skipped', { reason: 'credentials missing' });
      return;
    }
    throw err;
  }

  let report;
  try {
    report = await fetchCampaignReport(credentials);
  } catch (err) {
    if (err instanceof AppStoreReportPending) {
      ctx.log('app store report pending', { detail: err.message });
      return;
    }
    throw err;
  }

  let matched = 0;
  for (const row of report.rows) {
    // The campaign token is the content item id, so it resolves directly. A
    // token that does not is still recorded — it may be a campaign someone set
    // up by hand — but with no item attached.
    const { rows: items } = await ctx.pool.query<{ id: string; campaign_id: string | null }>(
      'select id, campaign_id from content_items where id::text = $1',
      [row.campaignToken],
    );
    const item = items[0];
    if (item) matched++;

    await ctx.pool.query(
      `insert into app_store_attribution
         (content_item_id, campaign_id, campaign_token, impressions, product_page_views,
          installs, first_time_downloads, redownloads, proceeds_usd, collected_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        item?.id ?? null,
        item?.campaign_id ?? null,
        row.campaignToken,
        row.impressions ?? null,
        row.productPageViews ?? null,
        row.installs ?? null,
        row.firstTimeDownloads ?? null,
        row.redownloads ?? null,
        row.proceedsUsd ?? null,
        report.collectedAt,
      ],
    );
  }

  ctx.log('collected app store attribution', {
    rows: report.rows.length,
    matchedToPosts: matched,
  });
}
