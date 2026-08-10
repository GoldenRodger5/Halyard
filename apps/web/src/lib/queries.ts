/**
 * Read models for the UI. One function per screen, so a page component is a
 * layout concern and nothing else.
 */
import 'server-only';
import {
  computeBestTimes,
  describeFunnel,
  describeGap,
  describeSlotConfidence,
  describeWhatIsNotMeasurable,
  missingMetrics,
  type ColdStartReadout,
  type FunnelHonesty,
  type PlatformId,
  type ScoredMetric,
  type TimingResult,
} from '@halyard/core';
import { one, query } from './db';

export interface Settings {
  publishing_enabled: boolean;
  publishing_disabled_reason: string | null;
  generation_enabled: boolean;
  learning_min_posts_per_category: number;
}

export async function getSettings(): Promise<Settings> {
  return (
    (await one<Settings>(
      `select publishing_enabled, publishing_disabled_reason, generation_enabled,
              learning_min_posts_per_category
         from settings where id = true`,
    )) ?? {
      publishing_enabled: false,
      publishing_disabled_reason: null,
      generation_enabled: true,
      learning_min_posts_per_category: 20,
    }
  );
}

export async function getNavCounts(): Promise<{
  pendingApproval: number;
  inboxPending: number;
  failed: number;
  scheduledToday: number;
  storiesWaiting: number;
}> {
  const row = await one<{
    pending: string;
    inbox: string;
    failed: string;
    scheduled_today: string;
    stories_waiting: string;
  }>(
    `select
       (select count(*) from content_items where status = 'pending_approval')            as pending,
       (select count(*) from comments where reply_status = 'pending')                    as inbox,
       (select count(*) from content_items where status = 'failed')                      as failed,
       (select count(*) from content_items
         where status in ('approved','scheduled')
           and scheduled_at::date = (now() at time zone 'utc')::date)                    as scheduled_today,
       (select count(*) from rss_items
         where status in ('new','surfaced') and expires_at > now())                   as stories_waiting`,
  );
  return {
    pendingApproval: Number(row?.pending ?? 0),
    inboxPending: Number(row?.inbox ?? 0),
    failed: Number(row?.failed ?? 0),
    scheduledToday: Number(row?.scheduled_today ?? 0),
    storiesWaiting: Number(row?.stories_waiting ?? 0),
  };
}

export interface ProductRow {
  id: string;
  kind: 'product' | 'personal';
  name: string;
  tagline: string | null;
  website_url: string | null;
  brief_summary: string | null;
  brief_markdown: string | null;
  brand_tokens: Record<string, string>;
  content_rules: { forbidden_claims?: string[]; banned_phrases?: string[] };
  connector_type: string;
  audience_timezone: string;
  operator_timezone: string;
}

/**
 * Products, real ones first.
 *
 * The founder persona is a `products` row so it can have a voice, a mix and its
 * own signals — but it is not a product, and defaulting the whole UI to it
 * (which is what happened the moment it was added) shows an empty dashboard.
 * Ordering by kind keeps "the first product" meaning what every caller assumes.
 */
export async function getProducts(): Promise<ProductRow[]> {
  return query<ProductRow>(
    `select * from products order by (kind = 'product') desc, created_at`,
  );
}

/**
 * The product the UI is currently about. Milestone 23.
 *
 * An explicit `?product=` wins, then the first real product. Personal personas
 * are only ever selected deliberately.
 */
export async function getCurrentProduct(requested?: string): Promise<ProductRow | null> {
  const products = await getProducts();
  if (requested) {
    const match = products.find((p) => p.id === requested);
    if (match) return match;
  }
  return products.find((p) => p.kind === 'product') ?? products[0] ?? null;
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  return one<ProductRow>('select * from products where id = $1', [id]);
}

export interface OnboardingRow {
  product_id: string;
  step_ingest_done: boolean;
  step_voice_done: boolean;
  step_calibration_done: boolean;
  step_templates_done: boolean;
  step_accounts_done: boolean;
  calibration_reviewed: number;
  calibration_target: number;
  completed_at: string | null;
}

export async function getOnboarding(productId: string): Promise<OnboardingRow | null> {
  return one<OnboardingRow>('select * from onboarding_state where product_id = $1', [productId]);
}

export interface AccountRow {
  id: string;
  product_id: string;
  product_name: string;
  product_kind: string;
  platform: string;
  persona: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  capability_state: string;
  capability_detail: string | null;
  supported_formats: string[];
  link_strategy: string;
  bio_link_url: string | null;
  token_expires_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  identity_confirmed_at: string | null;
  identity_warning: string | null;
  last_self_test_at: string | null;
  last_self_test_ok: boolean | null;
  last_self_test_detail: string | null;
  last_published_at: string | null;
  has_token: boolean;
  transport: 'direct' | 'unified';
  provider_account_id: string | null;
}

const ACCOUNT_COLUMNS = `sa.id, sa.product_id, p.name as product_name, p.kind as product_kind,
        sa.platform, sa.persona, sa.handle, sa.display_name, sa.avatar_url, sa.follower_count,
        sa.capability_state, sa.capability_detail, sa.supported_formats, sa.link_strategy,
        sa.bio_link_url, sa.token_expires_at, sa.last_verified_at, sa.last_error,
        sa.identity_confirmed_at, sa.identity_warning, sa.last_self_test_at,
        sa.last_self_test_ok, sa.last_self_test_detail, sa.last_published_at,
        (sa.access_token_enc is not null) as has_token,
        sa.transport, sa.provider_account_id`;

/**
 * Accounts reachable from a product: its own brand accounts, plus the founder
 * account, which is shared across every product and lives on the personal one.
 * Token ciphertext is deliberately absent from this projection.
 */
export async function getAccounts(productId?: string): Promise<AccountRow[]> {
  return query<AccountRow>(
    `select ${ACCOUNT_COLUMNS}
       from social_accounts sa
       join products p on p.id = sa.product_id
      where $1::text is null or sa.product_id = $1 or sa.persona = 'founder'
      order by sa.persona desc, sa.platform`,
    [productId ?? null],
  );
}

/** Every account on every product, for the accounts screen and readiness gate. */
export async function getAllAccounts(): Promise<AccountRow[]> {
  return query<AccountRow>(
    `select ${ACCOUNT_COLUMNS}
       from social_accounts sa
       join products p on p.id = sa.product_id
      order by (p.kind = 'product') desc, p.created_at, sa.persona desc, sa.platform`,
  );
}

export interface QueueItem {
  id: string;
  platform: string;
  persona: string;
  format: string;
  category: string;
  body: string;
  title: string | null;
  alt_text: string | null;
  hashtags: string[];
  final_link_url: string | null;
  link_url: string | null;
  status: string;
  scheduled_at: string | null;
  qc_results: { gates?: Array<{ gate: string; status: string; summary: string }> };
  claims: Array<{ text: string; source: string }>;
  ai_components: string[];
  requires_ai_label: boolean | null;
  disclosure_text: string | null;
  audio_mode: string;
  idea_title: string | null;
  series_name: string | null;
  sequence_number: number | null;
  render_total: number;
  render_done: number;
  render_failed: number;
  render_error: string | null;
  preview_urls: string[];
  artifact_headline: string | null;
  edited_by_human: boolean;
  product_id: string;
  attached_asset_ids: string[];
  attached_urls: string[];
  destination_type: string | null;
  destination_url: string | null;
  destination_reason: string | null;
  product_web_url: string | null;
  product_share_template: string | null;
  product_artifact: unknown;
}

const QUEUE_SELECT = `
  select ci.id, ci.platform, ci.persona, ci.format, ci.category, ci.body, ci.title,
         ci.alt_text, ci.hashtags, ci.final_link_url, ci.link_url, ci.status,
         ci.scheduled_at, ci.qc_results, ci.claims, ci.ai_components,
         ci.requires_ai_label, ci.disclosure_text, ci.audio_mode,
         ci.edited_by_human, ci.sequence_number, ci.product_id, ci.attached_asset_ids,
         ci.destination_type, ci.destination_url, ci.destination_reason, ci.product_artifact,
         p.destinations ->> 'web' as product_web_url,
         p.destinations ->> 'share_url_template' as product_share_template,
         i.title as idea_title,
         s.name as series_name,
         ci.product_artifact ->> 'recipeName' as artifact_headline,
         coalesce(r.total, 0)  as render_total,
         coalesce(r.done, 0)   as render_done,
         coalesce(r.failed, 0) as render_failed,
         r.first_error         as render_error,
         coalesce(r.urls, '{}') as preview_urls,
         coalesce(att.urls, '{}') as attached_urls
    from content_items ci
    join products p on p.id = ci.product_id
    left join ideas i on i.id = ci.idea_id
    left join series s on s.id = ci.series_id
    left join lateral (
      select count(*)::int as total,
             count(*) filter (where rr.status = 'done')::int as done,
             count(*) filter (where rr.status = 'failed')::int as failed,
             min(rr.error) as first_error,
             array_remove(array_agg(a.public_url order by rr.slide_index), null) as urls
        from renders rr
        left join assets a on a.id = rr.output_asset_id
       where rr.content_item_id = ci.id and rr.quality = 'final'
    ) r on true
    left join lateral (
      select array_remove(array_agg(a.public_url order by array_position(ci.attached_asset_ids, a.id)), null) as urls
        from assets a
       where a.id = any(ci.attached_asset_ids)
    ) att on true
`;

export async function getQueue(filters: {
  status?: string[];
  platform?: string;
} = {}): Promise<QueueItem[]> {
  const statuses = filters.status ?? ['pending_approval', 'approved', 'scheduled', 'failed'];
  return query<QueueItem>(
    `${QUEUE_SELECT}
      where ci.status = any($1::text[])
        and ($2::text is null or ci.platform = $2)
      order by ci.scheduled_at nulls last, ci.created_at desc`,
    [statuses, filters.platform ?? null],
  );
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  const rows = await query<QueueItem>(`${QUEUE_SELECT} where ci.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getItemArtifact(id: string): Promise<unknown> {
  const row = await one<{ product_artifact: unknown; generation_meta: unknown }>(
    'select product_artifact, generation_meta from content_items where id = $1',
    [id],
  );
  return row;
}

export interface IdeaRow {
  id: string;
  title: string;
  angle: string;
  category: string;
  rationale: string | null;
  score: string;
  score_breakdown: Record<string, number>;
  status: string;
  created_at: string;
}

export async function getIdeas(): Promise<IdeaRow[]> {
  return query<IdeaRow>(
    `select id, title, angle, category, rationale, score, score_breakdown, status, created_at
       from ideas
      where status in ('proposed','selected','snoozed')
      order by score desc, created_at desc
      limit 60`,
  );
}

export interface MixRow {
  category: string;
  published: number;
  share: string;
}

export async function getMix(productId: string, persona = 'brand'): Promise<MixRow[]> {
  return query<MixRow>('select * from content_mix_actual($1, $2, 21)', [productId, persona]);
}

export async function getMixTargets(
  productId: string,
  persona = 'brand',
): Promise<Record<string, number>> {
  const row = await one<{ mix_targets: Record<string, number> }>(
    'select mix_targets from brand_voices where product_id = $1 and persona = $2',
    [productId, persona],
  );
  return row?.mix_targets ?? {};
}

export interface LibraryRow {
  id: string;
  platform: string;
  category: string;
  format: string;
  body: string;
  published_at: string | null;
  permalink: string | null;
  impressions: number | null;
  link_clicks: number | null;
  activated_users: number | null;
  score: string | null;
  low_confidence: boolean | null;
}

export async function getLibrary(): Promise<LibraryRow[]> {
  return query<LibraryRow>(
    `select ci.id, ci.platform, ci.category, ci.format, ci.body, ci.published_at,
            p.permalink, m.impressions, m.link_clicks, a.activated_users,
            ps.score, ps.low_confidence
       from content_items ci
       left join publications p on p.content_item_id = ci.id
       left join lateral (
         select * from post_metrics pm where pm.publication_id = p.id
          order by collected_at desc limit 1
       ) m on true
       left join lateral (
         select * from attribution at where at.content_item_id = ci.id
          order by collected_at desc limit 1
       ) a on true
       left join performance_scores ps on ps.content_item_id = ci.id
      where ci.status in ('published','awaiting_manual_publish')
      order by ci.published_at desc nulls last
      limit 100`,
  );
}

export interface InboxRow {
  id: string;
  body: string;
  author_handle: string | null;
  posted_at: string | null;
  reply_status: string;
  suggested_reply: string | null;
  is_support_question: boolean;
  sentiment: string | null;
  platform: string;
  permalink: string | null;
  post_body: string;
  content_item_id: string;
}

export async function getInbox(): Promise<InboxRow[]> {
  return query<InboxRow>(
    `select c.id, c.body, c.author_handle, c.posted_at, c.reply_status, c.suggested_reply,
            c.is_support_question, c.sentiment,
            p.platform, p.permalink, ci.body as post_body, ci.id as content_item_id
       from comments c
       join publications p on p.id = c.publication_id
       join content_items ci on ci.id = p.content_item_id
      order by (c.reply_status = 'pending') desc, c.posted_at desc nulls last
      limit 100`,
  );
}

export interface TemplateRow {
  id: string;
  renderer: string;
  format: string;
  aspect_ratio: string;
  description: string | null;
  enabled: boolean;
  disabled_reason: string | null;
  uses: number;
}

export async function getTemplates(): Promise<TemplateRow[]> {
  return query<TemplateRow>(
    `select t.id, t.renderer, t.format, t.aspect_ratio, t.description, t.enabled,
            t.disabled_reason,
            (select count(*)::int from renders r where r.template_id = t.id) as uses
       from templates t
      order by t.renderer, t.id`,
  );
}

export interface CalendarItem {
  id: string;
  platform: string;
  persona: string;
  format: string;
  status: string;
  scheduled_at: string;
  body: string;
}

export async function getCalendar(fromIso: string, toIso: string): Promise<CalendarItem[]> {
  return query<CalendarItem>(
    `select id, platform, persona, format, status, scheduled_at, body
       from content_items
      where scheduled_at between $1 and $2
      order by scheduled_at`,
    [fromIso, toIso],
  );
}

export interface HealthSnapshot {
  queue: { queued: number; running: number; failed_24h: number; dead: number; oldest_queued_seconds: number };
  workers: Array<{ worker_id: string; last_seen_at: string; seconds_ago: number }>;
  accounts: AccountRow[];
  renderSuccessRate: number | null;
  lastPublishByPlatform: Array<{ platform: string; published_at: string | null }>;
  notifications: Array<{ id: string; kind: string; severity: string; title: string; body: string | null; created_at: string }>;
  /** Milestone 41's verification gate, and whether it is actually passing. */
  flows: Array<{
    flow_id: string;
    ok: boolean;
    mode: string;
    started_at: string;
    summary: string;
    failure_screenshot_path: string | null;
    app_version: string | null;
  }>;
}

export async function getHealth(): Promise<HealthSnapshot> {
  const [queue] = await query<HealthSnapshot['queue']>('select * from queue_health()');
  const workers = await query<{ worker_id: string; last_seen_at: string; seconds_ago: string }>(
    `select worker_id, last_seen_at, extract(epoch from now() - last_seen_at)::int as seconds_ago
       from worker_heartbeats order by last_seen_at desc`,
  );
  const renders = await one<{ total: string; done: string }>(
    `select count(*) as total, count(*) filter (where status = 'done') as done
       from renders where created_at > now() - interval '7 days'`,
  );
  const lastPublish = await query<{ platform: string; published_at: string | null }>(
    `select platform, max(published_at) as published_at from publications group by platform`,
  );
  const notifications = await query<HealthSnapshot['notifications'][number]>(
    `select id, kind, severity, title, body, created_at from notifications
      order by created_at desc limit 20`,
  );

  /**
   * Capture flows, and whether the last verification of each one passed.
   *
   * A flow that stopped resolving is the failure this whole subsystem exists to
   * catch, so it is on the health screen rather than buried in a job log. "Never
   * verified" is shown as its own state: it is not a pass.
   */
  const flows = await query<HealthSnapshot['flows'][number]>(
    `select distinct on (flow_id)
            flow_id, ok, mode, started_at, summary, failure_screenshot_path,
            (select observed_app_version from products where id = capture_runs.product_id)
              as app_version
       from capture_runs
      order by flow_id, started_at desc`,
  );

  const total = Number(renders?.total ?? 0);
  return {
    queue: queue ?? { queued: 0, running: 0, failed_24h: 0, dead: 0, oldest_queued_seconds: 0 },
    workers: workers.map((w) => ({ ...w, seconds_ago: Number(w.seconds_ago) })),
    accounts: await getAccounts(),
    renderSuccessRate: total === 0 ? null : Number(renders?.done ?? 0) / total,
    lastPublishByPlatform: lastPublish,
    notifications,
    flows,
  };
}

export interface AnalyticsSnapshot {
  postsPerCategory: Array<{ category: string; posts: number; impressions: number; link_clicks: number; activated: number }>;
  byPlatform: Array<{ platform: string; posts: number; impressions: number; link_clicks: number; activated: number }>;
  funnel: { impressions: number; clicks: number; signups: number; activated: number };
  attributionRows: number;
  stampedLinks: number;
  /**
   * Milestone 42. Routed clicks by device class, and App Store conversions.
   *
   * App Store numbers stay in their own columns and are never added to web
   * sessions: they come from a different system with different semantics — an
   * install is not a session, and Apple counts a redownload separately — and
   * summing them would produce a single number that means nothing.
   */
  clicksByDevice: Array<{ device_class: string; clicks: number; posts: number }>;
  /**
   * Milestone 49. Platforms routed through the unified provider, and what that
   * transport cannot see. Named per platform rather than rendered as a zero:
   * "nobody saved this" and "this transport does not report saves" are
   * different facts, and only one of them should change strategy.
   */
  transportGaps: Array<{ platform: string; missing: string[]; note: string }>;
  /**
   * Milestone 51. What is not yet knowable, and the timing windows with their
   * provenance attached — default, still learning, or actually measured.
   */
  coldStart: {
    lines: string[];
    funnel: FunnelHonesty;
    publishedPosts: number;
  };
  timing: Array<{
    platform: string;
    slots: Array<{ name: string; window: string; posts: number; readout: ColdStartReadout }>;
    result: TimingResult;
  }>;
  appStore: {
    configured: boolean;
    impressions: number;
    productPageViews: number;
    installs: number;
    firstTimeDownloads: number;
    redownloads: number;
    lastCollectedAt: string | null;
  };
}

export async function getAnalytics(): Promise<AnalyticsSnapshot> {
  const base = `
    from content_items ci
    join publications p on p.content_item_id = ci.id
    left join lateral (select * from post_metrics pm where pm.publication_id = p.id
                        order by collected_at desc limit 1) m on true
    left join lateral (select * from attribution at where at.content_item_id = ci.id
                        order by collected_at desc limit 1) a on true
   where ci.status = 'published'`;

  const postsPerCategory = await query<AnalyticsSnapshot['postsPerCategory'][number]>(
    `select ci.category,
            count(*)::int as posts,
            coalesce(sum(m.impressions),0)::int as impressions,
            coalesce(sum(m.link_clicks),0)::int as link_clicks,
            coalesce(sum(a.activated_users),0)::int as activated
       ${base}
       group by ci.category order by posts desc`,
  );

  const byPlatform = await query<AnalyticsSnapshot['byPlatform'][number]>(
    `select ci.platform,
            count(*)::int as posts,
            coalesce(sum(m.impressions),0)::int as impressions,
            coalesce(sum(m.link_clicks),0)::int as link_clicks,
            coalesce(sum(a.activated_users),0)::int as activated
       ${base}
       group by ci.platform order by posts desc`,
  );

  const funnel = await one<{ impressions: string; clicks: string; signups: string; activated: string }>(
    `select coalesce(sum(m.impressions),0) as impressions,
            coalesce(sum(m.link_clicks),0) as clicks,
            coalesce(sum(a.signups),0) as signups,
            coalesce(sum(a.activated_users),0) as activated
       ${base}`,
  );

  const counts = await one<{ attribution_rows: string; stamped: string }>(
    `select (select count(*) from attribution) as attribution_rows,
            (select count(*) from content_items
              where final_link_url is not null and status = 'published') as stamped`,
  );

  const clicksByDevice = await query<{ device_class: string; clicks: string; posts: string }>(
    `select device_class, count(*) as clicks, count(distinct content_item_id) as posts
       from link_clicks
      where clicked_at > now() - interval '90 days'
      group by device_class order by count(*) desc`,
  );

  const appStore = await one<{
    impressions: string;
    product_page_views: string;
    installs: string;
    first_time_downloads: string;
    redownloads: string;
    last_collected_at: string | null;
  }>(
    `select coalesce(sum(impressions),0) as impressions,
            coalesce(sum(product_page_views),0) as product_page_views,
            coalesce(sum(installs),0) as installs,
            coalesce(sum(first_time_downloads),0) as first_time_downloads,
            coalesce(sum(redownloads),0) as redownloads,
            max(collected_at)::text as last_collected_at
       from app_store_attribution`,
  );

  const providerToken = await one<{ configured: boolean }>(
    `select bool_or(destinations ? 'app_analytics_provider_token') as configured from products`,
  );

  const unifiedAccounts = await query<{ platform: string }>(
    `select distinct platform from social_accounts where transport = 'unified'`,
  );
  const providerRow = await one<{ capabilities: { platforms?: Record<string, { metrics?: string[] }> } }>(
    `select capabilities from provider_capabilities where provider = 'blotato'`,
  );

  const transportGaps = unifiedAccounts
    .map((row) => {
      const observed = (providerRow?.capabilities?.platforms?.[row.platform]?.metrics ??
        []) as ScoredMetric[];
      const note = describeGap(row.platform as PlatformId, observed);
      return note
        ? { platform: row.platform, missing: missingMetrics(row.platform as PlatformId, observed), note }
        : null;
    })
    .filter((gap) => gap !== null)
    .map((gap) => ({ platform: gap!.platform, missing: [...gap!.missing] as string[], note: gap!.note }));

  // ── Milestone 51: what is not yet knowable ───────────────────────────────
  const learningSettings = await getSettings();
  const minPostsForLearning = learningSettings.learning_min_posts_per_category;

  const published = await one<{ posts: string; platforms: string; first_at: string | null }>(
    `select count(*) as posts,
            count(distinct platform) as platforms,
            min(published_at) as first_at
       from content_items where status = 'published'`,
  );

  const publishedPosts = Number(published?.posts ?? 0);
  const daysSinceFirstPost = published?.first_at
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(published.first_at).getTime()) / 86_400_000),
      )
    : null;

  const coldStart = {
    lines: describeWhatIsNotMeasurable({
      publishedPosts,
      daysSinceFirstPost,
      platformsWithPosts: Number(published?.platforms ?? 0),
      categoriesAtThreshold: postsPerCategory.filter((c) => c.posts >= minPostsForLearning).length,
    }),
    funnel: describeFunnel(
      {
        impressions: Number(funnel?.impressions ?? 0),
        clicks: Number(funnel?.clicks ?? 0),
        signups: Number(funnel?.signups ?? 0),
        activated: Number(funnel?.activated ?? 0),
      },
      publishedPosts,
    ),
    publishedPosts,
  };

  // Timing, per platform, with each window's provenance. `computeBestTimes`
  // has always refused to answer below its sample threshold; until now nothing
  // asked it, so the refusal was never shown to anyone.
  const slotRows = await query<{
    platform: string;
    name: string;
    window_start: string;
    window_end: string;
    posts: string;
  }>(
    `select s.platform, s.name, s.window_start, s.window_end,
            (select count(*) from content_items ci
              where ci.slot_id = s.id and ci.status = 'published') as posts
       from slots s
      where s.enabled
      order by s.platform, s.window_start`,
  );

  // Impressions as the timing measure, from the latest snapshot per post.
  // Timing is a question about reach — when were more people around — and using
  // a blended engagement score here would confound *when* it went out with *how
  // good it was*, which is the other chart's job.
  const timings = await query<{ platform: string; weekday: number; hour: number; score: number }>(
    `select ci.platform,
            extract(isodow from ci.published_at at time zone p.audience_timezone)::int as weekday,
            extract(hour from ci.published_at at time zone p.audience_timezone)::int as hour,
            coalesce(
              (select m.impressions from post_metrics m
                 join publications pub on pub.id = m.publication_id
                where pub.content_item_id = ci.id
                order by m.collected_at desc limit 1),
              0
            )::float as score
       from content_items ci
       join products p on p.id = ci.product_id
      where ci.status = 'published' and ci.published_at is not null`,
  );

  const timingPlatforms = [...new Set(slotRows.map((row) => row.platform))];
  const timing = timingPlatforms.map((platform) => ({
    platform,
    slots: slotRows
      .filter((row) => row.platform === platform)
      .map((row) => ({
        name: row.name,
        window: `${row.window_start.slice(0, 5)}–${row.window_end.slice(0, 5)}`,
        posts: Number(row.posts),
        readout: describeSlotConfidence(Number(row.posts)),
      })),
    result: computeBestTimes(timings, { platform }),
  }));

  return {
    coldStart,
    timing,
    postsPerCategory,
    byPlatform,
    funnel: {
      impressions: Number(funnel?.impressions ?? 0),
      clicks: Number(funnel?.clicks ?? 0),
      signups: Number(funnel?.signups ?? 0),
      activated: Number(funnel?.activated ?? 0),
    },
    attributionRows: Number(counts?.attribution_rows ?? 0),
    stampedLinks: Number(counts?.stamped ?? 0),
    transportGaps,
    clicksByDevice: clicksByDevice.map((r) => ({
      device_class: r.device_class,
      clicks: Number(r.clicks),
      posts: Number(r.posts),
    })),
    appStore: {
      configured: providerToken?.configured === true,
      impressions: Number(appStore?.impressions ?? 0),
      productPageViews: Number(appStore?.product_page_views ?? 0),
      installs: Number(appStore?.installs ?? 0),
      firstTimeDownloads: Number(appStore?.first_time_downloads ?? 0),
      redownloads: Number(appStore?.redownloads ?? 0),
      lastCollectedAt: appStore?.last_collected_at ?? null,
    },
  };
}
