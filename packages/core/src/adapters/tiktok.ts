/**
 * TikTok. v2 Part A.4 — the hardest problem, and a likely rejection.
 *
 * This adapter defaults to **inbox upload**, not direct publish, and that is a
 * deliberate design decision rather than a limitation being worked around:
 *
 *   · Unaudited clients can only post SELF_ONLY content, and the whole account
 *     must be private while posting. Unusable for a brand account.
 *   · TikTok rejects audit submissions from apps that look like internal tools.
 *     Halyard is, by design, an internal tool for one operator. Plan for
 *     rejection.
 *   · Trending commercial sounds cannot be attached through the posting API
 *     (v2 E.4), and sound is a large share of TikTok distribution. Inbox upload
 *     puts the video in drafts, the operator opens the app, attaches a trending
 *     sound and publishes. Thirty seconds of human work the API cannot replace.
 *
 * So TikTok is *assisted*, not automated, and `publish()` returns mode:'draft'
 * with a deep link. Direct publish exists behind an explicit opt-in flag for the
 * case where the audit does land.
 */
import { PLATFORM_SCOPES, buildAuthUrl, toTokenSet, type TokenResponse } from './oauth.js';
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
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from './types.js';

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';

export const TIKTOK_CONSTRAINTS: PlatformConstraints = {
  maxChars: 2200,
  maxHashtags: 5,
  supportedFormats: ['video'],
  aspectRatios: ['9:16'],
  video: { minSeconds: 3, maxSeconds: 600, codecs: ['h264'] },
  linkStrategy: 'bio_only',
  linkNote: 'Bio only, until the account is eligible for in-video links.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
};

export class TikTokAdapter implements PlatformAdapter {
  readonly platform = 'tiktok' as const;
  readonly constraints = TIKTOK_CONSTRAINTS;

  getAuthUrl(state: string, options: OAuthUrlOptions): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      client_key: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      state,
      scope: (options.scopes ?? PLATFORM_SCOPES.tiktok)!.join(','),
    });
  }

  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${API}/oauth/token/`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: options.clientId,
          client_secret: options.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: options.redirectUri,
        }),
      },
      'TikTok code exchange',
    )) as TokenResponse & { open_id?: string };
    return { ...toTokenSet(response), meta: { openId: response.open_id } };
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    if (!tokens.refreshToken) throw new PublishError('TikTok token has no refresh token.', 'auth');
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${API}/oauth/token/`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: options.clientId,
          client_secret: options.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }),
      },
      'TikTok token refresh',
    )) as TokenResponse;
    return { ...toTokenSet(response), meta: tokens.meta };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const info = (await this.creatorInfo(account)) as {
        data?: { creator_username?: string; privacy_level_options?: string[] };
      };
      const audited = account.meta?.contentPostingAuditPassed === true;
      const privacyOptions = info.data?.privacy_level_options ?? [];
      const canGoPublic = privacyOptions.includes('PUBLIC_TO_EVERYONE');

      return {
        state: 'draft_only',
        detail: audited && canGoPublic
          ? `Audit passed for @${info.data?.creator_username ?? account.handle}, but Halyard still uploads to drafts: the API cannot attach trending audio, and sound is a large share of TikTok distribution.`
          : `Connected as @${info.data?.creator_username ?? account.handle}. Unaudited clients can only post SELF_ONLY with the account set to private, so uploads go to your drafts instead.`,
        supportedFormats: ['video'],
        nextAction: 'Open TikTok, attach a trending sound, and publish from drafts.',
      };
    } catch (err) {
      const error = err as PublishError;
      return { state: error.kind === 'auth' ? 'error' : 'pending_auth', detail: error.message, supportedFormats: [] };
    }
  }

  /** Step 1 of the documented flow: query creator info for available privacy levels. */
  async creatorInfo(account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${API}/post/publish/creator_info/query/`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
        },
        body: '{}',
      },
      'TikTok creator info',
    );
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const asset = assets.find((a) => a.kind === 'video');
    if (!asset) throw new PublishError('TikTok requires a video asset.', 'permanent');

    const { text } = composeCaption(item, this.constraints);
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;

    // Direct publish is opt-in and only reachable once the audit has landed.
    // Everything else, including the default, goes to the inbox.
    const directPublish =
      account.meta?.allowDirectPublish === true &&
      account.meta?.contentPostingAuditPassed === true &&
      account.capabilityState === 'live';

    const endpoint = directPublish
      ? `${API}/post/publish/video/init/`
      : `${API}/post/publish/inbox/video/init/`;

    const payload: Record<string, unknown> = {
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: asset.publicUrl,
      },
    };

    if (directPublish) {
      payload.post_info = {
        title: text.slice(0, this.constraints.maxChars),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        // v2 Part C: declare synthetic content natively where a toggle exists.
        ...(item.requiresAiLabel ? { is_aigc: true } : {}),
      };
    }

    const initiated = (await platformFetch(
      fetchImpl,
      endpoint,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(payload),
      },
      'TikTok publish init',
    )) as { data?: { publish_id?: string } };

    const publishId = initiated.data?.publish_id;
    if (!publishId) return { mode: 'draft', malformedResponse: true, raw: initiated };

    return {
      mode: directPublish ? 'direct' : 'draft',
      platformPostId: publishId,
      manualPublishUrl: directPublish ? undefined : 'https://www.tiktok.com/upload?lang=en',
      raw: initiated,
    };
  }

  /** Step 3: poll /status/fetch/ until PUBLISH_COMPLETE. */
  async fetchStatus(publishId: string, account: PublishAccount): Promise<string> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const response = (await platformFetch(
      fetchImpl,
      `${API}/post/publish/status/fetch/`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
      'TikTok status fetch',
    )) as { data?: { status?: string } };
    return response.data?.status ?? 'UNKNOWN';
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const response = (await platformFetch(
      fetchImpl,
      `${API}/video/query/?fields=id,like_count,comment_count,share_count,view_count`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ filters: { video_ids: [publication.platformPostId] } }),
      },
      'TikTok metrics',
    )) as {
      data?: {
        videos?: Array<{
          like_count?: number;
          comment_count?: number;
          share_count?: number;
          view_count?: number;
        }>;
      };
    };

    const video = response.data?.videos?.[0] ?? {};
    return {
      videoViews: video.view_count,
      impressions: video.view_count,
      likes: video.like_count,
      comments: video.comment_count,
      shares: video.share_count,
      raw: response,
    };
  }
}
