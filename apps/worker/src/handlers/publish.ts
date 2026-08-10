/**
 * The publish handler.
 *
 * "A retry that double-posts to a real account is the worst possible bug."
 * Three layers stand between a retry and a duplicate post:
 *
 *   1. A pre-flight SELECT for an existing publication row.
 *   2. An INSERT of a claim row *before* the network call, protected by the
 *      unique index on (content_item_id, account_id). Two concurrent workers
 *      race on that index and exactly one wins.
 *   3. A malformed response is treated as success-with-unknown-id and never
 *      retried (build pack §3).
 *
 * Plus the kill switch, checked first, every time (v1 §10).
 */
import {
  disclosureSatisfied,
  getAdapter,
  openToken,
  publishFailurePolicy,
  stampUtm,
  type AiComponent,
  type PlatformId,
  type PublishAccount,
  type PublishAsset,
  type PublishError,
  type PublishItem,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

export class DuplicatePublishAbort extends Error {
  constructor(contentItemId: string, accountId: string) {
    super(
      `Duplicate publish aborted for content item ${contentItemId} on account ${accountId}. This must never happen.`,
    );
    this.name = 'DuplicatePublishAbort';
  }
}

/**
 * Milestone 40. The database already makes this pairing impossible through the
 * routing-scope foreign key, so reaching here means the constraint was dropped,
 * the row was written by something that bypassed it, or the job payload was
 * built from stale data. Any of those is a reason to stop, not to post.
 */
export class RoutingViolation extends Error {
  constructor(
    contentItemId: string,
    itemScope: string,
    accountScope: string,
    accountHandle: string,
  ) {
    super(
      `Refusing to publish ${contentItemId}: the item routes to '${itemScope}' but account ${accountHandle} serves '${accountScope}'. ` +
        'A brand post cannot go out on the founder account, and no product can post from another product\'s account.',
    );
    this.name = 'RoutingViolation';
  }
}

export class PublishingDisabled extends Error {
  constructor(reason: string | null) {
    super(`Publishing is disabled${reason ? `: ${reason}` : ''}. Kill switch is on.`);
    this.name = 'PublishingDisabled';
  }
}

interface ContentRow {
  id: string;
  product_id: string;
  account_id: string;
  platform: PlatformId;
  format: PublishItem['format'];
  category: string;
  body: string;
  title: string | null;
  alt_text: string | null;
  hashtags: string[];
  link_url: string | null;
  final_link_url: string | null;
  status: string;
  ai_components: AiComponent[];
  disclosure_text: string | null;
  requires_ai_label: boolean | null;
  render_ids: string[];
  attached_asset_ids: string[];
  series_id: string | null;
  persona: 'founder' | 'brand';
  routing_scope: string;
}

interface AccountRow {
  id: string;
  platform: PlatformId;
  handle: string;
  platform_user_id: string | null;
  capability_state: PublishAccount['capabilityState'];
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  token_expires_at: string | null;
  scopes: string[];
  link_strategy: string;
  rate_limit_config: Record<string, unknown>;
  persona: 'founder' | 'brand';
  routing_scope: string;
}

export async function publishHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const contentItemId = String(job.payload.contentItemId ?? '');
  if (!contentItemId) throw new Error('publish job has no contentItemId');

  // ── 0. The kill switch, before anything else ─────────────────────────────
  const settings = await ctx.pool.query<{
    publishing_enabled: boolean;
    publishing_disabled_reason: string | null;
  }>('select publishing_enabled, publishing_disabled_reason from settings where id = true');
  if (!settings.rows[0]?.publishing_enabled) {
    throw new PublishingDisabled(settings.rows[0]?.publishing_disabled_reason ?? null);
  }

  const { rows: itemRows } = await ctx.pool.query<ContentRow>(
    'select * from content_items where id = $1',
    [contentItemId],
  );
  const item = itemRows[0];
  if (!item) throw new Error(`content item ${contentItemId} not found`);

  if (!['approved', 'scheduled', 'publishing'].includes(item.status)) {
    ctx.log('skipping publish, item is not approved', { contentItemId, status: item.status });
    return;
  }

  // ── 1. Pre-flight idempotency check ──────────────────────────────────────
  const existing = await ctx.pool.query<{ id: string; platform_post_id: string | null }>(
    'select id, platform_post_id from publications where content_item_id = $1 and account_id = $2',
    [item.id, item.account_id],
  );
  if (existing.rows.length > 0) {
    await auditDuplicate(ctx, item.id, item.account_id, 'pre-flight check found an existing publication');
    throw new DuplicatePublishAbort(item.id, item.account_id);
  }

  const { rows: accountRows } = await ctx.pool.query<AccountRow>(
    'select * from social_accounts where id = $1',
    [item.account_id],
  );
  const accountRow = accountRows[0];
  if (!accountRow) throw new Error(`account ${item.account_id} not found`);
  if (accountRow.capability_state === 'disabled' || accountRow.capability_state === 'error') {
    throw new Error(`account ${accountRow.handle} is ${accountRow.capability_state}; not publishing`);
  }

  // ── 1b. Routing, asserted a second time ──────────────────────────────────
  // The constraint in the schema is the real defence. This is the belt to its
  // braces, and it is cheap: two strings already loaded.
  if (item.routing_scope !== accountRow.routing_scope) {
    await ctx.pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('system', 'routing_violation', 'content_item', $1, $2)`,
      [
        item.id,
        {
          itemScope: item.routing_scope,
          accountScope: accountRow.routing_scope,
          accountId: accountRow.id,
        },
      ],
    );
    throw new RoutingViolation(
      item.id,
      item.routing_scope,
      accountRow.routing_scope,
      accountRow.handle,
    );
  }

  // ── 2. Compliance, as a code path rather than a habit (v2 C.3) ───────────
  const disclosure = disclosureSatisfied({
    aiComponents: item.ai_components ?? [],
    disclosureText: item.disclosure_text,
    body: item.body,
  });
  if (!disclosure.ok) {
    throw new Error(`Refusing to publish: ${disclosure.reason}`);
  }

  // ── 3. UTM stamping at schedule time (v1 §9) ─────────────────────────────
  let finalLink = item.final_link_url;
  if (!finalLink && item.link_url) {
    finalLink = stampUtm(item.link_url, {
      platform: item.platform,
      category: item.category,
      contentItemId: item.id,
    });
    await ctx.pool.query('update content_items set final_link_url = $2 where id = $1', [
      item.id,
      finalLink,
    ]);
  }

  // Rendered media first, then anything the operator attached from the library.
  const assets = [
    ...(await loadAssets(ctx, item.render_ids)),
    ...(await loadAttachedAssets(ctx, item.attached_asset_ids)),
  ];

  const account: PublishAccount = {
    id: accountRow.id,
    platform: accountRow.platform,
    handle: accountRow.handle,
    platformUserId: accountRow.platform_user_id,
    capabilityState: accountRow.capability_state,
    tokens: {
      accessToken: accountRow.access_token_enc ? openToken(accountRow.access_token_enc) : '',
      refreshToken: accountRow.refresh_token_enc ? openToken(accountRow.refresh_token_enc) : null,
      expiresAt: accountRow.token_expires_at ? new Date(accountRow.token_expires_at) : null,
      scopes: accountRow.scopes,
    },
    meta: (job.payload.accountMeta as Record<string, unknown>) ?? {},
  };

  const publishItem: PublishItem = {
    id: item.id,
    platform: item.platform,
    format: item.format,
    body: item.body,
    title: item.title,
    altText: item.alt_text,
    hashtags: item.hashtags ?? [],
    finalLinkUrl: finalLink,
    boardId: (job.payload.boardId as string | undefined) ?? null,
    disclosureText: item.disclosure_text,
    requiresAiLabel: item.requires_ai_label ?? false,
  };

  // ── 4. Claim the publication row BEFORE the network call ─────────────────
  // If two workers reach here at once, the unique index rejects the loser and
  // no second API call is made.
  let publicationId: string;
  try {
    const claim = await ctx.pool.query<{ id: string }>(
      `insert into publications (content_item_id, account_id, platform, publish_mode)
       values ($1, $2, $3, 'direct')
       returning id`,
      [item.id, item.account_id, item.platform],
    );
    publicationId = claim.rows[0]!.id;
  } catch (err) {
    await auditDuplicate(ctx, item.id, item.account_id, (err as Error).message);
    throw new DuplicatePublishAbort(item.id, item.account_id);
  }

  await ctx.pool.query(`update content_items set status = 'publishing' where id = $1`, [item.id]);

  const adapter = getAdapter(item.platform);

  try {
    const result = await adapter.publish(publishItem, assets, account);

    await ctx.pool.query(
      `update publications
          set platform_post_id = $2,
              permalink = $3,
              publish_mode = $4,
              manual_publish_url = $5,
              link_reply_post_id = $6,
              published_at = now(),
              raw_response = $7,
              needs_reconciliation = $8
        where id = $1`,
      [
        publicationId,
        result.platformPostId ?? null,
        result.permalink ?? null,
        result.mode,
        result.manualPublishUrl ?? null,
        result.linkReplyPostId ?? null,
        result.raw ?? null,
        result.malformedResponse === true,
      ],
    );

    await ctx.pool.query(
      `update content_items
          set status = $2,
              published_at = now(),
              eligible_for_repost_at = now() + interval '90 days'
        where id = $1`,
      [item.id, result.mode === 'draft' ? 'awaiting_manual_publish' : 'published'],
    );

    // An account that has posted recently is an account whose credential is
    // known good, which is what /accounts and the readiness gate read.
    await ctx.pool.query('update social_accounts set last_published_at = now() where id = $1', [
      accountRow.id,
    ]);

    await ctx.pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('worker', 'publish', 'content_item', $1, $2)`,
      [item.id, { mode: result.mode, platformPostId: result.platformPostId, worker: ctx.workerId }],
    );

    if (result.malformedResponse) {
      await notify(
        ctx,
        'duplicate_publish_abort',
        'warning',
        `Publish response could not be parsed for ${item.platform}`,
        'The post may be live. Flagged for manual reconciliation and will never be retried.',
        item.id,
      );
    }

    // Metrics polling, and comment polling for the first 24 hours (v2 I.1).
    if (result.platformPostId) {
      await ctx.enqueue(
        'collect_metrics',
        { publicationId },
        { runAfter: new Date(Date.now() + 60 * 60_000), dedupeKey: `metrics:${publicationId}:1h` },
      );
      await ctx.enqueue(
        'collect_comments',
        { publicationId, pollNumber: 1 },
        { runAfter: new Date(Date.now() + 5 * 60_000), dedupeKey: `comments:${publicationId}:1` },
      );
    }

    ctx.log('published', { contentItemId: item.id, platform: item.platform, mode: result.mode });
  } catch (err) {
    const error = err as PublishError;
    const kind =
      error.kind === 'auth' ||
      error.kind === 'rate_limit' ||
      error.kind === 'malformed_response'
        ? error.kind
        : error.kind === 'permanent'
          ? 'transient'
          : 'transient';
    const policy = publishFailurePolicy(kind, job.attempts, error.retryAfterSeconds);

    await ctx.pool.query(`update publications set error = $2 where id = $1`, [
      publicationId,
      error.message.slice(0, 2000),
    ]);

    if (policy.setAccountState === 'error') {
      await ctx.pool.query(
        `update social_accounts set capability_state = 'error', last_error = $2 where id = $1`,
        [accountRow.id, error.message.slice(0, 500)],
      );
    }

    if (policy.pauseAccountQueue) {
      // Do not retry blindly against a dead token, and do not let the rest of
      // the day's queue burn itself against the same failure.
      await ctx.pool.query(
        `update content_items set status = 'failed'
          where account_id = $1 and status in ('approved','scheduled')`,
        [accountRow.id],
      );
    }

    if (policy.notify) {
      await notify(
        ctx,
        policy.notify,
        'critical',
        `${item.platform} publish failed`,
        error.message.slice(0, 500),
        item.id,
      );
    }

    if (!policy.retry) {
      // Release the claim so a human can retry deliberately, but only when we
      // are certain nothing was posted.
      if (kind !== 'malformed_response') {
        await ctx.pool.query('delete from publications where id = $1', [publicationId]);
      }
      await ctx.pool.query(`update content_items set status = 'failed' where id = $1`, [item.id]);
      throw new Error(`${error.message} (${policy.note})`, { cause: err });
    }

    await ctx.pool.query('delete from publications where id = $1', [publicationId]);
    await ctx.pool.query(`update content_items set status = 'approved' where id = $1`, [item.id]);
    throw error;
  }
}

/**
 * Assets the operator picked out of the library, which have no render row and
 * therefore no slide index — they keep the order they were attached in.
 */
async function loadAttachedAssets(
  ctx: HandlerContext,
  assetIds: string[],
): Promise<PublishAsset[]> {
  if (!assetIds || assetIds.length === 0) return [];
  const { rows } = await ctx.pool.query<{
    id: string;
    public_url: string | null;
    mime_type: string;
    width: number | null;
    height: number | null;
    duration_seconds: string | null;
    caption: string | null;
    alt_text: string | null;
  }>(
    `select a.id, a.public_url, a.mime_type, a.width, a.height, a.duration_seconds,
            a.caption, a.alt_text
       from assets a
      where a.id = any($1::uuid[]) and a.archived_at is null
      order by array_position($1::uuid[], a.id)`,
    [assetIds],
  );

  return rows.map((row) => ({
    id: row.id,
    publicUrl: row.public_url ?? '',
    mimeType: row.mime_type,
    kind: row.mime_type.startsWith('video')
      ? ('video' as const)
      : row.mime_type.startsWith('audio')
        ? ('audio' as const)
        : ('image' as const),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : undefined,
    altText: row.alt_text ?? row.caption,
  }));
}

async function loadAssets(ctx: HandlerContext, renderIds: string[]): Promise<PublishAsset[]> {
  if (!renderIds || renderIds.length === 0) return [];
  const { rows } = await ctx.pool.query<{
    id: string;
    public_url: string | null;
    mime_type: string;
    width: number | null;
    height: number | null;
    duration_seconds: string | null;
    caption: string | null;
    render_index: number;
  }>(
    `select a.id, a.public_url, a.mime_type, a.width, a.height, a.duration_seconds, a.caption,
            array_position($1::uuid[], r.id) as render_index
       from renders r
       join assets a on a.id = r.output_asset_id
      where r.id = any($1::uuid[])
      order by render_index`,
    [renderIds],
  );

  return rows.map((row) => ({
    id: row.id,
    publicUrl: row.public_url ?? '',
    mimeType: row.mime_type,
    kind: row.mime_type.startsWith('video') ? 'video' : row.mime_type.startsWith('audio') ? 'audio' : 'image',
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : undefined,
    altText: row.caption,
  }));
}

async function auditDuplicate(
  ctx: HandlerContext,
  contentItemId: string,
  accountId: string,
  detail: string,
): Promise<void> {
  await ctx.pool.query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('worker', 'duplicate_publish_abort', 'content_item', $1, $2)`,
    [contentItemId, { accountId, detail, worker: ctx.workerId }],
  );
  await notify(
    ctx,
    'duplicate_publish_abort',
    'critical',
    'Duplicate publish aborted',
    detail,
    contentItemId,
  );
}

export async function notify(
  ctx: HandlerContext,
  kind: string,
  severity: 'info' | 'warning' | 'critical',
  title: string,
  body: string,
  entityId?: string,
): Promise<void> {
  await ctx.pool.query(
    `insert into notifications (kind, severity, title, body, entity_type, entity_id)
     values ($1, $2, $3, $4, 'content_item', $5)`,
    [kind, severity, title, body, entityId ?? null],
  );
}
