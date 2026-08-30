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
  audioIsPublishable,
  adapterForAccount,
  checkFinish,
  finishFor,
  PublishError,
  disclosureSatisfied,
  emptyTikTokOptions,
  getAdapter,
  openToken,
  resolvePlatformClient,
  publishableBaseUrl,
  publishFailurePolicy,
  scrubString,
  sealToken,
  stampUtm,
  tiktokMediaUrl,
  validateTikTokPost,
  type AiComponent,
  type PlatformId,
  type ProviderCapabilities,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
} from '@halyard/core';
import { chaptersForItem } from '../chapters.js';
import { PermanentJobFailure, type Job, type HandlerContext } from '../poller.js';

/**
 * Permanent by construction. A second attempt re-reads the same publication row
 * and aborts identically; the only thing retrying adds is three more rows in the
 * log and a delay before an operator sees it.
 */
/**
 * What a delivery outcome means for Halyard's own record. §156.
 *
 * Only a direct post is a publication. A native draft is sitting in someone's
 * TikTok inbox; a private upload is on YouTube and not public. Neither is a
 * post, and treating either as one starts the repost clock and sends metrics
 * collection after something nobody can see.
 *
 * The polarity is deliberate: anything this function has not been taught about
 * is **not** published. A delivery capability added later fails closed rather
 * than silently claiming a post that does not exist.
 */
export function statusAfterDelivery(mode: PublishResult['mode']): {
  status: 'published' | 'awaiting_manual_publish';
  published: boolean;
} {
  return mode === 'direct'
    ? { status: 'published', published: true }
    : { status: 'awaiting_manual_publish', published: false };
}

export class DuplicatePublishAbort extends PermanentJobFailure {
  constructor(contentItemId: string, accountId: string) {
    super(
      `Duplicate publish aborted for content item ${contentItemId} on account ${accountId}. This must never happen.`,
      'the publication already exists; retrying re-aborts',
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
  /** §199. Shorts vs long-form for YouTube; the generic variant slot elsewhere. */
  format_subtype: string | null;
  category: string;
  scheduled_at: string | null;
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
  tiktok_options: unknown;
  tiktok_creator_info: unknown;
  render_ids: string[];
  attached_asset_ids: string[];
  series_id: string | null;
  persona: 'founder' | 'brand';
  routing_scope: string;
  /** Pinterest only. Chosen at draft time so the queue shows where it lands. */
  board_id: string | null;
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
  transport: 'direct' | 'unified';
  provider_account_id: string | null;
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

  /**
   * §244. Nothing unlicensed in the audio, checked against what was mixed.
   *
   * §242 set `forPublication: false` in the TTS handler — correctly, because
   * that mix is produced long before anybody approves anything — and left a
   * comment claiming the publish path re-checked provenance. It did not. A
   * fixture mixed at draft time would have travelled all the way to a real
   * post and the whole provenance apparatus would have been decoration.
   *
   * Read from what was recorded, not re-derived: the file that exists is the
   * one being published, and asking the selector again could produce a
   * different answer.
   */
  const { rows: audioProvenance } = await ctx.pool.query<{
    kind: string;
    title: string;
    provenance: string;
  }>(
    `select 'music' as kind, m.title, m.provenance
       from music_usage u join music_beds m on m.id = u.music_bed_id
      where u.content_item_id = $1
     union all
     select 'sfx' as kind, s.title, s.provenance
       from sound_effects s
      where s.id::text in (
        select jsonb_array_elements(coalesce(ci.qc_results -> 'audio' -> 'sfxUsed', '[]'::jsonb)) ->> 'id'
          from content_items ci where ci.id = $1
      )`,
    [contentItemId],
  );

  const verdict = audioIsPublishable({
    musicProvenance: audioProvenance.filter((r) => r.kind === 'music'),
    sfxProvenance: audioProvenance.filter((r) => r.kind === 'sfx'),
  });
  if (!verdict.publishable) {
    /*
     * Permanent, not retried: nothing about waiting changes an unlicensed
     * bed into a licensed one. The operator either re-runs the audio or
     * licenses what is in it.
     */
    throw new PermanentJobFailure(
      `Audio provenance refuses this publish. ${verdict.problems.join(' ')}`,
      'Waiting does not turn an unlicensed bed into a licensed one. Re-run the audio, or license what is in it.',
    );
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

  /**
   * `pending_auth` means the capability model says this account cannot act.
   *
   * It was not refused here, and a token is not enough to make it safe.
   * `confirmConnection` writes the account as `pending_auth` **with the sealed
   * token** and only then runs `verifyCapabilities` to move it on — so there is
   * a real window in which an account holds a working credential and has not
   * been verified for anything. A publish job landing in that window went
   * straight through.
   *
   * `resolveCapability` returns `auth_required` for this state and
   * `accountStatus` calls it not-connected. The publisher was the only place
   * that disagreed, and it is the only one whose disagreement reaches a
   * platform.
   */
  if (accountRow.capability_state === 'pending_auth') {
    throw new PermanentJobFailure(
      `account ${accountRow.handle} has not completed authentication; not publishing`,
      'the account is pending_auth, which no retry resolves',
    );
  }

  /**
   * An account that cannot post through an API is not a failure. It is a
   * handover.
   *
   * `draft_only` and `awaiting_manual_publish` were designed together — the
   * capability state, the item state, the schema constraints and the
   * architecture doc all describe this path — and **neither end was ever
   * built**. The handler refused only `disabled` and `error`, so a `draft_only`
   * account fell straight through to the adapter and failed there, which reads
   * as a broken integration rather than as a post waiting for a person.
   *
   * This matters more than it looks. Several platforms Halyard targets cannot
   * be posted to programmatically for this account — Facebook has no adapter at
   * all, and any account whose review has not landed sits here. Without this
   * branch those posts are generated, approved, and then simply fail.
   *
   * Everything needed to post by hand is already on the item: the body, the
   * rendered media, the destination link. The queue surfaces it, the operator
   * posts it, and records the URL. Nothing is lost and nothing is pretended.
   */
  if (accountRow.capability_state === 'draft_only') {
    await ctx.pool.query(
      `update content_items
          set status = 'awaiting_manual_publish', updated_at = now()
        where id = $1`,
      [item.id],
    );
    await ctx.pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('system', 'handed_to_manual_publish', 'content_item', $1, $2)`,
      [item.id, { account: accountRow.handle, platform: accountRow.platform }],
    );
    ctx.log('handed to manual publish', {
      contentItemId: item.id,
      account: accountRow.handle,
      why: 'the account is draft_only, so there is no API path to post through',
    });
    return;
  }

  /**
   * No credential, found here rather than by the platform.
   *
   * `access_token_enc` was read as `accountRow.access_token_enc ? openToken(…) : ''`
   * a few lines below, and an empty string is a *value*: the request was built,
   * sent, and refused by the platform with an empty bearer. That is a real API
   * call spent to discover something the database already knew, three times per
   * job under the retry policy, against an API billed per call.
   *
   * It is reachable in three ordinary ways, not one exotic one: a seeded
   * account marked `live` with no token ever stored, an account whose
   * credential an operator erased with Disconnect while items were queued, and
   * one whose token was cleared by hand. `capability_state` does not answer
   * this — `live` has never meant "connected" (see `accounts/status.ts`), which
   * is exactly why the state checks above do not catch it.
   *
   * Placed after the `draft_only` handover on purpose: a post being handed to a
   * person to publish does not need a credential, and failing it here would
   * turn a working handover into a broken integration.
   */
  if (!accountRow.access_token_enc) {
    // Permanent: no number of retries stores a credential. Reconnecting does,
    // and that requeues deliberately rather than on a backoff timer.
    throw new PermanentJobFailure(
      `account ${accountRow.handle} has no stored credential; not publishing. Reconnect it on /accounts.`,
      'no credential is stored for this account',
    );
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

  /**
   * §153. A link is not attached until it is known to be reachable.
   *
   * §111 made *generation* refuse to build a link from an unset
   * `HALYARD_PUBLIC_URL`, and stopped there. An item drafted on a developer's
   * machine carries `http://localhost:3200/r/…`, and nothing between that row
   * and the platform looked at it again — no QC gate reads `link_url`, and the
   * adapters treat it as opaque. Publishing such a row puts a URL no reader can
   * open in front of an audience, and on X it also buys a second billed post to
   * carry it.
   *
   * Refused rather than silently dropped, for the reason §111 gives: publishing
   * the same post without its link changes what goes out, and that is the
   * operator's call. Clearing `link_url` is how an operator makes it.
   */
  if (item.link_url && !publishableBaseUrl(item.link_url)) {
    throw new PermanentJobFailure(
      `Refusing to publish: ${item.platform} would carry the link ${item.link_url}, ` +
        'which is not publicly reachable. Set HALYARD_PUBLIC_URL on the worker and regenerate, ' +
        'or clear link_url on this item to publish it without one.',
      'a local link is not made reachable by retrying',
    );
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

  /**
   * §353. Checked against the platform it is actually going to.
   *
   * `HALYARD_CREATIVE_GAP_AUDIT` §6: the same render reaches TikTok, Reels and
   * Shorts, so a piece is never assessed against the surface it lands on. A
   * video whose opening lands at 1.2 seconds is fine on Shorts and too slow on
   * TikTok, and today both receive it with nothing said.
   *
   * Recorded rather than blocking. Every rule here is about *quality on this
   * surface* rather than capability — the platform will accept the post either
   * way — and a gate that started refusing publishes on rules nobody has seen
   * yet would stop the account rather than improve it. The finding reaches
   * `qc_results` and the log, where an operator sees it before the next one.
   *
   * The one thing worth blocking on eventually is a misplaced link, which costs
   * real money on X. Left as a warning until an operator has seen it fire.
   */
  const finish = finishFor(accountRow.platform);
  if (finish) {
    const problems = checkFinish(
      {
        caption: item.body,
        captionHasLink: /https?:\/\//.test(item.body ?? ''),
      },
      finish,
    );
    if (problems.length > 0) {
      ctx.log('platform finish', {
        contentItemId: item.id,
        platform: accountRow.platform,
        problems: problems.map((p) => `${p.rule}: ${p.detail}`),
      });
      await ctx.pool.query(
        `update content_items
            set qc_results = coalesce(qc_results, '{}'::jsonb)
                             || jsonb_build_object('finish', $2::jsonb)
          where id = $1`,
        [item.id, JSON.stringify({ platform: accountRow.platform, problems })],
      );
    }
  }

  const account: PublishAccount = {
    id: accountRow.id,
    platform: accountRow.platform,
    handle: accountRow.handle,
    platformUserId: accountRow.platform_user_id,
    capabilityState: accountRow.capability_state,
    tokens: {
      // Guaranteed present by the guard above. Never `?? ''` — an empty bearer
      // is a request the platform has to refuse, not an absent credential.
      accessToken: openToken(accountRow.access_token_enc),
      refreshToken: accountRow.refresh_token_enc ? openToken(accountRow.refresh_token_enc) : null,
      expiresAt: accountRow.token_expires_at ? new Date(accountRow.token_expires_at) : null,
      scopes: accountRow.scopes,
    },
    meta: {
      ...((job.payload.accountMeta as Record<string, unknown>) ?? {}),
      providerAccountId: accountRow.provider_account_id,
    },
  };

  const publishItem: PublishItem = {
    id: item.id,
    platform: item.platform,
    format: item.format,
    body: item.body,
    title: item.title,
    altText: item.alt_text,
    hashtags: item.hashtags ?? [],
    formatSubtype: item.format_subtype,
    category: item.category,
    /*
     * §199. Only platforms that can hold a post themselves read this; YouTube
     * turns it into `status.publishAt`. Halyard's scheduler is still what fires
     * the job, so this is a hand-off, not a second scheduler.
     */
    scheduledAt: item.scheduled_at ? new Date(item.scheduled_at) : null,
    finalLinkUrl: finalLink,
    // Routed at draft time and stored on the item, so the board shown in the
    // queue is the board the pin lands on.
    boardId: item.board_id ?? (job.payload.boardId as string | undefined) ?? null,
    disclosureText: item.disclosure_text,
    requiresAiLabel: item.requires_ai_label ?? false,
    /*
     * §179. Carried, never computed. TikTok requires these to be a person's
     * choices; a value the publisher derived would not be one, and the adapter
     * refuses when they are absent rather than filling them in.
     */
    tiktokOptions: (item.tiktok_options as PublishItem['tiktokOptions']) ?? null,
    /*
     * §223. Chapter boundaries for a long-form upload.
     *
     * Resolved from the beat plan against the measured runtime of the file
     * that is actually being uploaded, using the same `layoutScenes` the
     * renderer used — so the timestamps point at the frames they name rather
     * than at a plan's intentions. Null for everything that is not YouTube
     * long-form, which is almost everything.
     */
    chapters: await chaptersForItem(
      ctx.pool,
      item.id,
      assets.find((a) => a.kind === 'video')?.durationSeconds ?? 0,
    ),
  };

  /*
   * §179. Re-checked here, against the creator_info the answers were given
   * against. Approval already validated them, but a creator can turn their
   * account private in the hours between approving and posting, which would make
   * a chosen PUBLIC_TO_EVERYONE invalid at exactly the moment it is used.
   */
  if (item.platform === 'tiktok') {
    /*
     * §179. TikTok pulls the video itself, from a URL prefix it has verified, so
     * the stored asset URL — Supabase Storage, or a local dev path — is rewritten
     * to Halyard's own `/media/<id>` route on the production origin.
     *
     * Refused rather than attempted when that cannot be built. Sending an
     * unreachable URL still returns a `publish_id`, so the operator would be told
     * the post was sent and learn otherwise from a later `video_pull_failed`.
     */
    const base = publishableBaseUrl(process.env.HALYARD_PUBLIC_URL);
    for (const asset of assets) {
      const rewritten = tiktokMediaUrl(base, asset.id);
      if (!rewritten) {
        throw new PublishError(
          'TikTok fetches the video from Halyard, so HALYARD_PUBLIC_URL must be the verified https origin. It is not set to one.',
          'permanent',
        );
      }
      asset.publicUrl = rewritten;
    }

    const problems = validateTikTokPost({
      options: (item.tiktok_options as never) ?? emptyTikTokOptions(),
      creatorInfo: (item.tiktok_creator_info as never) ?? null,
    });
    if (problems.length > 0) {
      throw new PublishError(
        `TikTok settings are no longer valid: ${problems.map((p) => p.message).join(' ')}`,
        'permanent',
      );
    }
  }

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

  // Direct or unified, per account. The transport is the only thing this
  // chooses; everything above it — QC, scheduling, idempotency, routing safety —
  // has already run and does not know the difference.
  const { rows: providerRows } = await ctx.pool.query<{ capabilities: ProviderCapabilities }>(
    `select capabilities from provider_capabilities where provider = 'blotato'`,
  );
  const adapter = adapterForAccount(
    {
      platform: item.platform,
      transport: accountRow.transport,
      provider_account_id: accountRow.provider_account_id,
    },
    providerRows[0]?.capabilities ?? null,
  );

  try {
    let result: Awaited<ReturnType<typeof adapter.publish>>;
    try {
      result = await adapter.publish(publishItem, assets, account);
    } catch (err) {
      // ── Token expiry mid-publish (build pack §3) ─────────────────────────
      //
      // A token can expire between the refresh cron's last pass and this call.
      // Refreshing and retrying once here is safe *because the failure was
      // auth*: a 401 means the platform rejected the request before creating
      // anything, so the retry cannot double-post. Any other failure kind is
      // rethrown untouched — that is the distinction the whole idempotency
      // design rests on.
      const failure = err as PublishError;
      if (failure.kind !== 'auth') throw err;

      const refreshed = await refreshAccountToken(ctx, accountRow, account);
      if (!refreshed) throw err;

      ctx.log('token refreshed mid-publish, retrying once', {
        contentItemId: item.id,
        platform: item.platform,
      });
      result = await adapter.publish(publishItem, assets, refreshed);
    }

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

    /**
     * §156. Only a direct post is published. Everything else is delivery.
     *
     * This read `mode === 'draft' ? awaiting_manual_publish : published`, so
     * the moment a third outcome existed — a private YouTube upload — it would
     * have been recorded as **published**: `published_at` set, the repost clock
     * started, and metrics collected against a video nobody can watch.
     *
     * The polarity is inverted deliberately. A mode this code has not been
     * taught about is not a publication, so a future delivery capability fails
     * closed rather than claiming a post that does not exist.
     */
    const { status: nextStatus, published } = statusAfterDelivery(result.mode);

    await ctx.pool.query(
      `update content_items
          set status = $2,
              published_at = case when $3 then now() else published_at end,
              eligible_for_repost_at =
                case when $3 then now() + interval '90 days' else eligible_for_repost_at end
        where id = $1`,
      [item.id, nextStatus, published],
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
      scrubString(error.message).slice(0, 2000),
    ]);

    if (policy.setAccountState === 'error') {
      await ctx.pool.query(
        `update social_accounts set capability_state = 'error', last_error = $2 where id = $1`,
        // Scrubbed for the same reason the job error is: this row is rendered
        // on /accounts and kept until the account is reconnected.
        [accountRow.id, scrubString(error.message).slice(0, 500)],
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
      /**
       * `policy.retry` is false, and now the queue hears it.
       *
       * This threw a plain `Error`, so the poller retried anyway — including
       * for `malformed_response`, whose own policy note reads "never retried —
       * that double-posts". The idempotency index was the only thing preventing
       * the second write it warns about.
       */
      throw new PermanentJobFailure(`${error.message} (${policy.note})`, policy.note);
    }

    await ctx.pool.query('delete from publications where id = $1', [publicationId]);
    await ctx.pool.query(`update content_items set status = 'approved' where id = $1`, [item.id]);
    throw error;
  }
}

/**
 * Refresh a token in the middle of a publish, once.
 *
 * Returns the account with the new token, or null when a refresh is impossible
 * or fails — in which case the caller falls through to the normal auth-failure
 * path, which marks the account and pauses its queue rather than retrying
 * against a dead credential.
 */
async function refreshAccountToken(
  ctx: HandlerContext,
  accountRow: AccountRow,
  account: PublishAccount,
): Promise<PublishAccount | null> {
  if (!accountRow.refresh_token_enc) return null;

  /*
   * §178. Resolved the same way the OAuth routes resolve it.
   *
   * This read `process.env` directly, which meant it missed the trim-check that
   * treats `KEY=` as unset — dotenv parses that to the empty string, and an empty
   * string is not `undefined`, so `!clientId` was the only thing standing between
   * a blank secret and a refresh attempt. It also named a fixed variable pair,
   * which stopped being true once platforms could name their own.
   */
  const client = resolvePlatformClient(accountRow.platform);
  if (!client.clientId || !client.clientSecret) {
    ctx.log('cannot refresh mid-publish, client credentials absent', {
      platform: accountRow.platform,
      needs: client.tried.join(' or '),
    });
    return null;
  }
  const { clientId, clientSecret } = client;

  try {
    const adapter = getAdapter(accountRow.platform);
    const next = await adapter.refresh(
      {
        accessToken: account.tokens.accessToken,
        refreshToken: openToken(accountRow.refresh_token_enc),
      },
      { clientId, clientSecret, fetchImpl: account.meta?.fetchImpl as typeof fetch | undefined },
    );

    await ctx.pool.query(
      `update social_accounts
          set access_token_enc = $2, refresh_token_enc = $3, token_expires_at = $4,
              last_error = null
        where id = $1`,
      [
        accountRow.id,
        sealToken(next.accessToken),
        next.refreshToken ? sealToken(next.refreshToken) : accountRow.refresh_token_enc,
        next.expiresAt ?? null,
      ],
    );

    return {
      ...account,
      tokens: {
        ...account.tokens,
        accessToken: next.accessToken,
        refreshToken: next.refreshToken ?? account.tokens.refreshToken,
        expiresAt: next.expiresAt ?? null,
      },
    };
  } catch (err) {
    ctx.log('mid-publish token refresh failed', { error: (err as Error).message });
    return null;
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

/**
 * Write a notification, scrubbed.
 *
 * Callers pass arbitrary error text into `body` — `generate` sends
 * `${err.message} Generation is paused…`, `appStore` sends `err.message`
 * directly — and an error message is whatever threw, which for an HTTP client
 * routinely includes the request URL. Meta's Graph API takes the access token
 * as a *query parameter*, so a failed Instagram call produces a message with a
 * live credential in it. That message would land in `notifications.body`,
 * render on the dashboard, and stay there forever.
 *
 * `jobs.last_error`, `publications.error` and `social_accounts.last_error` are
 * all scrubbed at their own write. This was the fourth path to the same class
 * of column and the only one that was not.
 *
 * Scrubbed here rather than at each call site, for the reason §96 gives: a
 * boundary that every caller must pass is the only place a rule of this kind
 * holds. `title` is scrubbed too — it is caller-supplied and equally capable of
 * carrying an interpolated message.
 */
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
    [kind, severity, scrubString(title), scrubString(body), entityId ?? null],
  );
}
