/**
 * The unified transport. Milestone 49.
 *
 * Implements the same `PlatformAdapter` interface every direct adapter
 * implements, so the queue, the six QC gates, scheduling, idempotency, routing
 * safety and attribution are all untouched. **Only the transport changes.**
 *
 * Endpoints and field names here come from Blotato's published API corpus, not
 * from guesswork:
 *
 *   POST /v2/posts                 publish or schedule
 *   GET  /v2/posts/:id             submission status
 *   GET  /v2/posts/:id/analytics   metrics snapshots
 *   GET  /v2/accounts              connected accounts
 *   POST /v2/media/uploads         host a media URL on their CDN
 *
 * Authentication is a `blotato-api-key` header, not a bearer token.
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
  type OAuthClientOptions,
  type OAuthExchangeOptions,
  type OAuthUrlOptions,
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
 * TikTok is the interesting one. `privacyLevel` exists in their API, but whether
 * `PUBLIC_TO_EVERYONE` is *honoured* depends on whether their app has cleared
 * TikTok's Content Posting audit — which no documentation states and only a real
 * post can settle. `scripts/verify-provider --publish` settles it, and what it
 * settles is what `/accounts` and the docs are allowed to claim. What gets sent
 * is draft either way, for the reason in the branch below.
 */
export function buildTarget(
  platform: PlatformId,
  item: PublishItem,
  account: PublishAccount,
): Record<string, unknown> {
  const target: Record<string, unknown> = { targetType: TARGET_TYPE[platform] };

  switch (platform) {
    case 'tiktok': {
      // Draft-first even where the probe confirms public posting works, and this
      // is a product decision rather than a limitation: no API of any kind can
      // attach trending commercial audio, and sound is a large share of TikTok
      // distribution. A video published without it underperforms one finished by
      // hand in the app. So the capability probe settles what the *docs* and
      // /accounts are allowed to claim, not what gets sent here.
      target.privacyLevel = 'SELF_ONLY';
      target.isDraft = true;
      target.isAiGenerated = item.requiresAiLabel ?? false;
      target.disabledComments = false;
      break;
    }
    case 'pinterest': {
      if (!item.boardId) {
        throw new PublishError(
          'Pinterest needs a board id and none is set on the account.',
          'permanent',
        );
      }
      target.boardId = item.boardId;
      if (item.title) target.title = item.title;
      if (item.finalLinkUrl) target.link = item.finalLinkUrl;
      break;
    }
    case 'youtube': {
      target.title = item.title ?? item.body.slice(0, 90);
      // Uploads stay private until the compliance audit passes, the same rule
      // the direct adapter follows.
      target.privacyStatus = account.meta?.complianceAuditPassed === true ? 'public' : 'private';
      break;
    }
    case 'instagram': {
      if (item.format === 'video') target.mediaType = 'reels';
      else if (item.format === 'carousel') target.mediaType = 'carousel';
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
    const accounts = (await this.get('/accounts')) as {
      items?: Array<{
        id: string;
        platform?: string;
        username?: string;
        displayName?: string;
        profileImageUrl?: string;
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
        displayName: a.displayName,
      }));

    return {
      platformUserId: match.id,
      handle: match.username ?? match.id,
      displayName: match.displayName,
      avatarUrl: match.profileImageUrl,
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

    // Their API fetches media by URL, so assets are passed through rather than
    // uploaded — the same reason the direct Meta path needs public URLs.
    const mediaUrls = assets.map((asset) => asset.publicUrl).filter(Boolean);

    const body = {
      post: {
        accountId: providerAccountId,
        content: {
          text,
          platform: TARGET_TYPE[this.platform],
          ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
        },
        target: buildTarget(this.platform, item, account),
      },
    };

    const response = (await this.post('/posts', body)) as {
      id?: string;
      submissionId?: string;
      status?: string;
      permalink?: string;
      url?: string;
    };

    const postId = response.id ?? response.submissionId;
    if (!postId) {
      // build pack §3: success with an unknown id is never retried. A retry here
      // double-posts to a real account, and that rule does not relax because a
      // provider sits in the middle.
      return { mode: 'direct', malformedResponse: true, raw: response };
    }

    const capability = this.capabilities.platforms[this.platform];
    const draftOnly = capability?.publishesPublicly !== 'yes' || this.platform === 'tiktok';

    let linkReplyPostId: string | undefined;
    if (linkForReply && this.constraints.linkStrategy === 'first_reply') {
      // X carries its link in a reply. Blotato models that as a second post
      // targeting the first, and losing it would silently drop every
      // destination on the platform Halyard publishes to most.
      const reply = (await this.post('/posts', {
        post: {
          accountId: providerAccountId,
          content: { text: linkForReply, platform: TARGET_TYPE[this.platform] },
          target: { targetType: TARGET_TYPE[this.platform], replyToId: postId },
        },
      })) as { id?: string; submissionId?: string };
      linkReplyPostId = reply.id ?? reply.submissionId;
    }

    return {
      mode: draftOnly ? 'draft' : 'direct',
      platformPostId: postId,
      permalink: response.permalink ?? response.url,
      manualPublishUrl: draftOnly ? 'https://my.blotato.com/published' : undefined,
      linkReplyPostId,
      raw: response,
    };
  }

  /**
   * Metrics, mapped from the provider's field names.
   *
   * Only what is actually present is mapped. A field the provider does not
   * return stays `undefined` rather than becoming zero — `/analytics` shows
   * "not reported by this transport", which is a different fact from "nobody
   * engaged" and the only one of the two that should change strategy.
   */
  async collectMetrics(
    publication: { platformPostId: string },
    _account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const response = (await this.get(`/posts/${publication.platformPostId}/analytics`)) as {
      latestMetrics?: Record<string, number | null>;
      metricsHistory?: Array<{ fetchedAt: string; metrics: Record<string, number | null> }>;
    };

    const metrics =
      response.latestMetrics ??
      response.metricsHistory?.[response.metricsHistory.length - 1]?.metrics;

    if (!metrics) {
      // Their analytics run on a delay — around two hours on the higher plans,
      // up to a day on the lowest — and are absent entirely on the free trial.
      throw new PublishError(
        'The provider has no metrics snapshot for this post yet. Analytics are collected on a delay ' +
          'and need a paid plan; a post published minutes ago will have none.',
        'transient',
      );
    }

    const num = (value: number | null | undefined): number | undefined =>
      typeof value === 'number' ? value : undefined;

    return {
      impressions: num(metrics.impressionsCount),
      reach: num(metrics.reachCount),
      likes: num(metrics.likesCount),
      comments: num(metrics.commentsCount ?? metrics.repliesCount),
      shares: num(metrics.sharesCount ?? metrics.twitterRetweetsCount),
      videoViews: num(metrics.viewsCount ?? metrics.facebookTotalVideoViewsCount),
      // Deliberately absent: saves, watchTimeSeconds, profileVisits, follows and
      // linkClicks. The provider does not report them, and inventing a zero
      // would corrupt the engagement weighting that treats a save as worth two
      // to three likes.
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

/** The metrics this transport is documented to return, for the gap report. */
export const UNIFIED_METRICS: ScoredMetric[] = [
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'videoViews',
];
