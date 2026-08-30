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
 * §179 replaced that inbox-first design with Direct Post, because the scope it
 * depended on — `video.upload` — was never granted in the developer portal, so
 * the fallback could not have worked. What survives from the reasoning above is
 * the honesty: `verifyCapabilities` reports `live` only when the token really
 * carries `video.publish` and TikTok is really offering a public visibility, and
 * the creator still chooses every setting TikTok requires a human to choose.
 */
import { PLATFORM_SCOPES, buildAuthUrl, toTokenSet, type TokenResponse } from './oauth.js';
import { parseCreatorInfo, toTikTokPostInfo } from '../tiktok/directPost.js';
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
  /**
   * §349. TikTok carries photo carousels, and this said video only.
   *
   * Verified against TikTok's own Content Posting API reference rather than
   * assumed: photo posts go to `/v2/post/publish/content/init/` with
   * `media_type: "PHOTO"` and take *"an array containing up to 35 photo content
   * URLs"*.
   *
   * The consequence of the old line was not a missing feature but a missing
   * *option*: `platformsForPostType` derives from this, so every carousel
   * Halyard could have made for TikTok was silently unavailable — and photo
   * carousels are among the best-performing formats on the platform.
   */
  supportedFormats: ['video', 'carousel'],
  aspectRatios: ['9:16'],
  video: { minSeconds: 3, maxSeconds: 600, codecs: ['h264'] },
  /* Up to 35 per the photo-post reference; two is the point at which it is a
     carousel rather than an image. */
  carousel: { min: 2, max: 35 },
  linkStrategy: 'bio_only',
  linkNote: 'Bio only, until the account is eligible for in-video links.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
  delivery: {
    nativeDraft: false,
    privateUpload: false,
    apiScheduling: false,
    requiresCreatorCompletion: false,
    note:
      'Direct Post (/v2/post/publish/video/init/, scope video.publish). The creator chooses visibility and interaction settings on the item and confirms TikTok\'s Music Usage Confirmation; Halyard sends exactly those choices and then polls /status/fetch/ until TikTok reports the post complete.',
  },
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

  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const response = (await platformFetch(
      fetchImpl,
      `${API}/user/info/?fields=open_id,union_id,display_name,avatar_url,follower_count,username`,
      { headers: { authorization: `Bearer ${account.tokens.accessToken}` } },
      'TikTok user info',
    )) as {
      data?: {
        user?: {
          open_id?: string;
          display_name?: string;
          avatar_url?: string;
          follower_count?: number;
          username?: string;
        };
      };
    };

    const user = response.data?.user;
    const openId = user?.open_id ?? (account.tokens.meta?.openId as string | undefined);
    if (!openId) {
      throw new PublishError('TikTok returned no open_id for this token.', 'malformed_response', undefined, undefined, response);
    }
    return {
      platformUserId: openId,
      handle: user?.username ?? user?.display_name ?? openId,
      displayName: user?.display_name,
      avatarUrl: user?.avatar_url,
      followerCount: user?.follower_count,
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const parsed = parseCreatorInfo(await this.creatorInfo(account));
      if (!parsed) {
        return {
          state: 'pending_auth',
          detail: 'TikTok answered the creator query without creator details. Reconnect the account.',
          supportedFormats: [],
        };
      }

      /*
       * §179. Measured, not assumed.
       *
       * Two things have to be true before Halyard may say a TikTok account can
       * publish: the token actually carries `video.publish`, and TikTok is
       * currently offering this creator a public visibility. An unaudited client
       * is restricted to SELF_ONLY, so `privacy_level_options` is where app
       * approval becomes observable — asking the creator rather than tracking a
       * flag Halyard set about itself.
       */
      const granted = account.tokens.scopes ?? [];
      const hasPublishScope = granted.includes('video.publish');
      const canGoPublic = parsed.privacyLevelOptions.includes('PUBLIC_TO_EVERYONE');
      const who = `@${parsed.creatorUsername ?? parsed.creatorNickname}`;

      if (hasPublishScope && canGoPublic) {
        return {
          state: 'live',
          detail: `Direct Post is available for ${who}. TikTok is offering ${parsed.privacyLevelOptions.length} visibility options and allows videos up to ${parsed.maxVideoPostDurationSec}s.`,
          supportedFormats: ['video'],
        };
      }

      return {
        state: 'draft_only',
        detail: !hasPublishScope
          ? `Connected as ${who}, but this token does not carry video.publish, so Halyard cannot post. Reconnect once the TikTok app has Direct Post approved.`
          : `Connected as ${who}, but TikTok is only offering ${parsed.privacyLevelOptions.join(', ') || 'no'} visibility for this account — an unaudited client can post SELF_ONLY only.`,
        supportedFormats: ['video'],
        nextAction: 'Finish TikTok app review, then reconnect the account so a new token is issued.',
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

    /*
     * §179. Direct Post, built from what the creator chose.
     *
     * This used to send `privacy_level: 'PUBLIC_TO_EVERYONE'` with every
     * interaction toggle enabled — a silent default on the one decision TikTok
     * requires a human to make, and the most public option available. It is now
     * refused outright: no completed panel, no post.
     *
     * The inbox path is gone with the `video.upload` scope it needed, which was
     * never granted in the developer portal, so it could not have worked.
     */
    const options = item.tiktokOptions ?? null;
    if (!options) {
      throw new PublishError(
        'TikTok posting needs the creator to choose visibility and interaction settings first. Open the item and complete the TikTok panel.',
        'permanent',
      );
    }
    if (!options.privacyLevel) {
      throw new PublishError(
        'TikTok posting needs a visibility chosen by the creator; Halyard will not pick one.',
        'permanent',
      );
    }
    if (!options.musicConfirmedAt) {
      throw new PublishError(
        "TikTok posting needs the creator's Music Usage Confirmation.",
        'permanent',
      );
    }

    const endpoint = `${API}/post/publish/video/init/`;

    const payload: Record<string, unknown> = {
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: asset.publicUrl,
      },
      post_info: {
        ...toTikTokPostInfo(options, text.slice(0, this.constraints.maxChars)),
        // v2 Part C: declare synthetic content natively where a toggle exists.
        ...(item.requiresAiLabel ? { is_aigc: true } : {}),
      },
    };

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

    /*
     * `publish_id` is a receipt for the *request*, not for a post. TikTok pulls
     * the video, transcodes it and publishes asynchronously, so the worker polls
     * `/status/fetch/` before anything is recorded as published — see
     * `interpretPublishStatus`.
     */
    return { mode: 'direct', platformPostId: publishId, raw: initiated };
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
