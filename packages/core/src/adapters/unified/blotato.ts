/**
 * The unified transport. Milestone 49.
 *
 * Implements the same `PlatformAdapter` interface every direct adapter
 * implements, so the queue, the six QC gates, scheduling, idempotency, routing
 * safety and attribution are all untouched. **Only the transport changes.**
 *
 * Endpoints and field names are taken from Blotato's OpenAPI reference, read
 * directly rather than inferred:
 *
 *   POST /v2/posts                 publish or schedule
 *   GET  /v2/posts/:id             submission status
 *   GET  /v2/posts/:id/analytics   metrics for one published post
 *   GET  /v2/users/me/accounts     connected accounts
 *   POST /v2/media                 host a media URL on their CDN
 *
 * Authentication is a `blotato-api-key` header, not a bearer token. Post
 * creation is rate limited to 30 requests a minute.
 *
 * **This file was wrong in six places before the reference was read.** The
 * response field is `postSubmissionId`, not `id`; accounts live under
 * `/users/me/accounts`, not `/accounts`; Instagram's `mediaType` is `reel` or
 * `story`, never `reels` or `carousel`; TikTok requires six booleans this
 * adapter did not send; Pinterest and YouTube each have a required field it
 * omitted; and the analytics response is `metrics`/`history`, not
 * `latestMetrics`/`metricsHistory`. Every one of those would have failed on
 * first contact. They are recorded here because "the endpoint shape was
 * guessed" is exactly the class of error the capability probe exists to catch.
 *
 * What this adapter will *not* do is publish to a platform whose capability has
 * never been verified. Unknown is not permission.
 */
import {
  PublishError,
  composeCaption,
  platformFetch,
  type CapabilityReport,
  type MetricSnapshot,
  // No OAuth option types: this transport's `getAuthUrl` and `exchangeCode`
  // take no arguments, because the provider dashboard owns the connection.
  type PlatformAdapter,
  type PlatformConstraints,
  type PlatformIdentity,
  type PlatformId,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from '../types.js';
import { canPublish, type ProviderCapabilities, type ScoredMetric } from './capabilities.js';

const API = 'https://backend.blotato.com/v2';

/** Halyard's platform ids to Blotato's `targetType` values. */
export const TARGET_TYPE: Record<PlatformId, string> = {
  x: 'twitter',
  instagram: 'instagram',
  threads: 'threads',
  pinterest: 'pinterest',
  youtube: 'youtube',
  tiktok: 'tiktok',
  bluesky: 'bluesky',
};

export interface UnifiedAdapterOptions {
  platform: PlatformId;
  /** The direct adapter's constraints still apply — they are the platform's. */
  constraints: PlatformConstraints;
  capabilities: ProviderCapabilities;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Platform-specific options on a Blotato post target.
 *
 * Every required field is sent, because the API rejects a target that is missing
 * one and the rejection arrives as a validation error rather than as anything
 * actionable. Where a required field encodes a policy decision — TikTok's
 * privacy level, YouTube's visibility, whether subscribers get notified — the
 * value follows the same rule the direct adapter follows, so the two transports
 * cannot disagree about what Halyard is willing to publish.
 */
export function buildTarget(
  platform: PlatformId,
  item: PublishItem,
  account: PublishAccount,
): Record<string, unknown> {
  const target: Record<string, unknown> = { targetType: TARGET_TYPE[platform] };

  switch (platform) {
    case 'tiktok': {
      // Six booleans are required, not optional. Sending none of them, as this
      // adapter originally did, is a rejected request.
      //
      // Draft-first even where the probe confirms public posting works, and
      // that is a product decision rather than a limitation: no API of any kind
      // can attach trending commercial audio, and sound is a large share of
      // TikTok distribution. `autoAddMusic` is Blotato's nearest offer and it
      // is not the same thing — it does not reach the trending catalogue.
      target.privacyLevel = 'SELF_ONLY';
      target.isDraft = true;
      target.disabledComments = false;
      target.disabledDuet = false;
      target.disabledStitch = false;
      // Declared, not guessed: this is Halyard publishing on behalf of the
      // product it markets, which is exactly what "your brand" means here.
      target.isBrandedContent = false;
      target.isYourBrand = true;
      target.isAiGenerated = item.requiresAiLabel ?? false;
      if (item.title) target.title = item.title.slice(0, 90);
      break;
    }
    case 'pinterest': {
      if (!item.boardId) {
        throw new PublishError(
          'Pinterest needs a board id and none is set on the account.',
          'permanent',
        );
      }
      // `title` is required here, and Pinterest is a search index: a Pin with no
      // title is a Pin nobody finds. Falling back to the opening line beats
      // failing the request, but the caller should be setting it.
      target.boardId = item.boardId;
      target.title = (item.title ?? item.body.split('\n')[0] ?? 'Untitled').slice(0, 100);
      if (item.finalLinkUrl) target.link = item.finalLinkUrl.slice(0, 2048);
      if (item.altText) target.altText = item.altText.slice(0, 500);
      break;
    }
    case 'youtube': {
      target.title = (item.title ?? item.body.slice(0, 90)).replace(/[<>]/g, '').slice(0, 100);
      // Uploads stay private until the compliance audit passes, the same rule
      // the direct adapter follows and the same rule YouTube enforces anyway.
      target.privacyStatus = account.meta?.complianceAuditPassed === true ? 'public' : 'private';
      // Required. False on purpose: a private upload that notifies subscribers
      // sends people to something they cannot watch.
      target.shouldNotifySubscribers = false;
      target.containsSyntheticMedia = item.requiresAiLabel ?? false;
      break;
    }
    case 'instagram': {
      // `reel` or `story`, singular, and nothing else. A carousel is not a
      // media type here — it is what several mediaUrls produce.
      if (item.format === 'video') target.mediaType = 'reel';
      if (item.altText) target.altText = item.altText.slice(0, 1000);
      break;
    }
    default:
      break;
  }

  return target;
}

export class UnifiedAdapter implements PlatformAdapter {
  readonly platform: PlatformId;
  readonly constraints: PlatformConstraints;
  private readonly capabilities: ProviderCapabilities;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;

  constructor(options: UnifiedAdapterOptions) {
    this.platform = options.platform;
    this.constraints = options.constraints;
    this.capabilities = options.capabilities;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiKey = options.apiKey ?? process.env.BLOTATO_API_KEY;
  }

  /**
   * Accounts are connected in the provider's own dashboard, not here.
   *
   * That is the entire value of this transport: their app has already passed the
   * reviews, so there is no OAuth round trip to run and no developer app to
   * register. The connect flow points at their settings page instead.
   */
  getAuthUrl(): string {
    return 'https://my.blotato.com/settings';
  }

  async exchangeCode(): Promise<TokenSet> {
    throw new PublishError(
      'Accounts on the unified transport are connected in the provider dashboard, not through Halyard. ' +
        'Connect them at my.blotato.com/settings, then paste the account id on /accounts.',
      'permanent',
    );
  }

  async refresh(tokens: TokenSet): Promise<TokenSet> {
    // The provider holds and refreshes the platform tokens. Halyard holds only
    // the provider's API key, which does not expire on a schedule.
    return tokens;
  }

  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    // `/users/me/accounts`, not `/accounts`. The response carries `fullname`
    // rather than `displayName`, and no avatar at all.
    const accounts = (await this.get('/users/me/accounts')) as {
      items?: Array<{
        id: string;
        platform?: string;
        username?: string;
        fullname?: string;
      }>;
    };

    const providerAccountId = String(account.meta?.providerAccountId ?? account.platformUserId ?? '');
    const match =
      (accounts.items ?? []).find((a) => a.id === providerAccountId) ??
      (accounts.items ?? []).find((a) => a.platform === TARGET_TYPE[this.platform]);

    if (!match) {
      throw new PublishError(
        `No ${this.platform} account is connected in the provider dashboard. ` +
          'Connect it at my.blotato.com/settings first.',
        'auth',
      );
    }

    const alternatives = (accounts.items ?? [])
      .filter((a) => a.platform === TARGET_TYPE[this.platform] && a.id !== match.id)
      .map((a) => ({
        platformUserId: a.id,
        handle: a.username ?? a.id,
        displayName: a.fullname,
      }));

    return {
      platformUserId: match.id,
      handle: match.username ?? match.id,
      displayName: match.fullname,
      detail: 'Connected through the unified provider, which holds the platform token.',
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    const verdict = canPublish(this.capabilities, this.platform);
    const capability = this.capabilities.platforms[this.platform];

    if (!verdict.allowed) {
      return {
        state: 'pending_auth',
        detail: verdict.reason,
        supportedFormats: [],
        nextAction: 'Run `pnpm verify-provider` against a real account.',
      };
    }

    // Verified as able to publish, but perhaps only to drafts. That distinction
    // decides whether an approved post goes live or waits for a human, so it is
    // stated rather than implied.
    const publicly = capability?.publishesPublicly === 'yes';
    return {
      state: publicly ? 'live' : 'draft_only',
      detail: publicly
        ? `Live through the unified provider as ${account.handle}. Verified ${capability?.verifiedAt ?? 'recently'}.`
        : `Connected through the unified provider as ${account.handle}, and verified to reach drafts only. ` +
          (capability?.notes.join(' ') ?? ''),
      supportedFormats: this.constraints.supportedFormats,
      nextAction: publicly ? undefined : 'Finish these posts in the platform app.',
    };
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const verdict = canPublish(this.capabilities, this.platform);
    if (!verdict.allowed) {
      // Refusing here rather than at schedule time means an unverified transport
      // cannot quietly carry a real post.
      throw new PublishError(verdict.reason, 'permanent');
    }

    if (!this.apiKey) {
      throw new PublishError(
        'BLOTATO_API_KEY is not set. Find it at my.blotato.com/settings under API, and add it to the environment.',
        'auth',
      );
    }

    const { text, linkForReply } = composeCaption(item, this.constraints);
    const providerAccountId = String(
      account.meta?.providerAccountId ?? account.platformUserId ?? '',
    );
    if (!providerAccountId) {
      throw new PublishError(
        `No provider account id stored for ${account.handle}. Set it on /accounts.`,
        'permanent',
      );
    }

    /**
     * There is no reply endpoint, and that decides something.
     *
     * The published schema has no `replyToId`, no `in_reply_to`, and no way to
     * attach a post to an existing one. A platform whose link strategy is
     * `first_reply` — X — therefore cannot be served correctly by this
     * transport at all.
     *
     * The tempting fallback is to put the link in the body instead. That is
     * refused: on X a post containing a URL costs $0.20 against $0.015, so the
     * "graceful degradation" is a thirteenfold cost increase applied silently to
     * every post. Halyard would rather not publish.
     *
     * `additionalPosts` does build a thread, but every entry goes out as part of
     * the same submission — it cannot carry a link that the first post is
     * deliberately keeping out of its own body, because the pricing applies to
     * the submission.
     */
    if (linkForReply && this.constraints.linkStrategy === 'first_reply') {
      throw new PublishError(
        `${this.platform} puts its link in the first reply, and the unified provider has no reply endpoint. ` +
          'Putting the link in the body instead would cost $0.20 a post against $0.015, so this is refused rather than degraded. ' +
          `Keep ${this.platform} on the direct transport.`,
        'permanent',
      );
    }

    // Their API fetches media by URL, so assets are passed through rather than
    // uploaded — the same reason the direct Meta path needs public URLs.
    // `mediaUrls` is required even when empty.
    const mediaUrls = assets.map((asset) => asset.publicUrl).filter(Boolean);

    const body = {
      post: {
        accountId: providerAccountId,
        content: {
          text,
          platform: TARGET_TYPE[this.platform],
          mediaUrls,
        },
        target: buildTarget(this.platform, item, account),
      },
    };

    const response = (await this.post('/posts', body)) as {
      postSubmissionId?: string;
      scheduledTime?: string;
    };

    // `postSubmissionId` is the only id this API returns. Reading `id` — which
    // is what this adapter did before the reference was read — would have made
    // every successful publish look malformed.
    const postId = response.postSubmissionId;
    if (!postId) {
      // build pack §3: success with an unknown id is never retried. A retry here
      // double-posts to a real account, and that rule does not relax because a
      // provider sits in the middle.
      return { mode: 'direct', malformedResponse: true, raw: response };
    }

    const capability = this.capabilities.platforms[this.platform];
    const draftOnly = capability?.publishesPublicly !== 'yes' || this.platform === 'tiktok';
    const linkReplyPostId: string | undefined = undefined;

    return {
      mode: draftOnly ? 'draft' : 'direct',
      platformPostId: postId,
      // The submission response carries no permalink. It is resolved later from
      // GET /v2/posts/:id, rather than fabricated here.
      permalink: undefined,
      manualPublishUrl: draftOnly ? 'https://my.blotato.com/published' : undefined,
      linkReplyPostId,
      raw: response,
    };
  }

  /**
   * Metrics, mapped from the provider's field names.
   *
   * The response is `{ metrics, history: [{ fetchedAt, metrics }], lastFetchedAt,
   * lastError }`. This adapter previously read `latestMetrics`/`metricsHistory`,
   * which are the field names of the *list* endpoint — so it would have found
   * nothing on every call and reported a permanent absence of data as a
   * transient delay.
   *
   * Only what is actually present is mapped. A field the provider does not
   * return stays `undefined` rather than becoming zero: `/analytics` shows "not
   * reported by this transport", which is a different fact from "nobody
   * engaged" and the only one of the two that should change strategy.
   */
  async collectMetrics(
    publication: { platformPostId: string },
    _account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const response = (await this.get(`/posts/${publication.platformPostId}/analytics`)) as {
      metrics?: Record<string, number | null> | null;
      history?: Array<{ fetchedAt: string; metrics: Record<string, number | null> }>;
      lastFetchedAt?: string | null;
      lastError?: string | null;
    };

    const metrics =
      response.metrics ?? response.history?.[response.history.length - 1]?.metrics ?? null;

    if (!metrics) {
      if (response.lastError) {
        // The provider tried and failed. That is the platform's answer, not a
        // delay, and retrying on a schedule will not change it.
        throw new PublishError(
          `The provider could not collect metrics for this post: ${response.lastError}`,
          'permanent',
        );
      }
      // Their collection runs on a delay, and analytics need a paid plan.
      throw new PublishError(
        'The provider has no metrics snapshot for this post yet. Analytics are collected on a delay ' +
          'and need a paid plan; a post published minutes ago will have none.',
        'transient',
      );
    }

    const num = (value: number | null | undefined): number | undefined =>
      typeof value === 'number' ? value : undefined;

    const watchMs = num(metrics.watchTimeMsAvg) ?? num(metrics.viewTimeMsSum);

    return {
      impressions: num(metrics.impressionsCount),
      reach: num(metrics.reachCount),
      likes: num(metrics.likesCount),
      comments: num(metrics.commentsCount ?? metrics.repliesCount),
      shares: num(metrics.sharesCount ?? metrics.twitterRetweetsCount),
      // Saves *are* reported, contrary to what an earlier reading of the
      // marketing pages concluded. They are weighted two to three times a like
      // in scoring, so getting this wrong changed what every Instagram and
      // Pinterest post was worth.
      saves: num(metrics.savesCount),
      videoViews: num(metrics.viewsCount ?? metrics.playsCount),
      watchTimeSeconds: watchMs === undefined ? undefined : Math.round(watchMs / 1000),
      profileVisits: num(metrics.profileVisitsCount ?? metrics.profileActivityCount),
      linkClicks: num(metrics.clicksCount),
      follows: num(metrics.followsCount),
      raw: response,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'blotato-api-key': this.apiKey ?? '',
      'content-type': 'application/json',
    };
  }

  private get(path: string): Promise<unknown> {
    return platformFetch(
      this.fetchImpl,
      `${API}${path}`,
      { headers: this.headers() },
      `Blotato GET ${path}`,
    );
  }

  private post(path: string, body: unknown): Promise<unknown> {
    return platformFetch(
      this.fetchImpl,
      `${API}${path}`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      `Blotato POST ${path}`,
    );
  }
}

/**
 * The metrics this transport is documented to return, for the gap report.
 *
 * Read from the analytics schema rather than from the marketing pages, which is
 * how `saves` came to be missing from this list for an entire milestone.
 */
export const UNIFIED_METRICS: ScoredMetric[] = [
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'videoViews',
  'watchTimeSeconds',
  'profileVisits',
  'linkClicks',
  'follows',
];
