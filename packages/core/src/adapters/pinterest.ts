/**
 * Pinterest. v2 Part A.5.
 *
 * Free at both tiers. Three non-monetary gates: the Trial-to-Standard video-demo
 * review, per-category rate ceilings of roughly 1,000 requests per day, and a
 * data-storage rule that bars caching most API data.
 *
 * That last one is a genuine architectural constraint, not a footnote: every
 * metric snapshot this adapter returns carries a `purgeAfter` deadline, and the
 * retention job honours it. Pinterest is also the one platform where the link is
 * the whole point — the destination URL sits on the pin itself.
 */
import { PLATFORM_SCOPES, buildAuthUrl, toTokenSet, type TokenResponse } from './oauth.js';
import {
  PublishError,
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

const AUTHORIZE_URL = 'https://www.pinterest.com/oauth/';
const PRODUCTION = 'https://api.pinterest.com/v5';
const SANDBOX = 'https://api-sandbox.pinterest.com/v5';

/**
 * Pinterest's Developer Guidelines bar caching most API data. 30 days is a
 * conservative reading; re-check the current guidelines before changing it.
 */
export const PINTEREST_METRIC_RETENTION_DAYS = 30;

export const PINTEREST_CONSTRAINTS: PlatformConstraints = {
  maxChars: 500,
  maxHashtags: 0,
  supportedFormats: ['pin', 'image', 'video'],
  aspectRatios: ['2:3', '1:1', '9:16'],
  video: { minSeconds: 4, maxSeconds: 900 },
  linkStrategy: 'pin_destination',
  linkNote: 'The destination URL is a field on the pin. This is Pinterest\'s whole strength.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
};

export class PinterestAdapter implements PlatformAdapter {
  readonly platform = 'pinterest' as const;
  readonly constraints = PINTEREST_CONSTRAINTS;

  /** Trial apps write to the sandbox, where pins are visible only to their creator. */
  private base(account: PublishAccount): string {
    return account.capabilityState === 'live' ? PRODUCTION : SANDBOX;
  }

  getAuthUrl(state: string, options: OAuthUrlOptions): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      state,
      scope: (options.scopes ?? PLATFORM_SCOPES.pinterest)!.join(','),
    });
  }

  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${PRODUCTION}/oauth/token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: options.redirectUri,
        }),
      },
      'Pinterest code exchange',
    )) as TokenResponse;
    return toTokenSet(response);
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    if (!tokens.refreshToken) {
      throw new PublishError('Pinterest token has no refresh token; reconnect.', 'auth');
    }
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${PRODUCTION}/oauth/token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
      },
      'Pinterest token refresh',
    )) as TokenResponse;
    return toTokenSet(response);
  }

  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    const me = (await this.get('/user_account', account)) as {
      id?: string;
      username?: string;
      profile_image?: string;
      account_type?: string;
      follower_count?: number;
    };
    if (!me.username) {
      throw new PublishError('Pinterest returned no account for this token.', 'malformed_response', undefined, undefined, me);
    }
    return {
      platformUserId: me.id ?? me.username,
      handle: me.username,
      avatarUrl: me.profile_image,
      followerCount: me.follower_count,
      detail: me.account_type
        ? `Account type: ${me.account_type.toLowerCase()}.`
        : undefined,
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const me = (await this.get('/user_account', account)) as { username?: string };
      const standard = account.meta?.standardAccessApproved === true;
      return {
        state: standard ? 'live' : 'draft_only',
        detail: standard
          ? `Standard access. Pins are public, as @${me.username ?? account.handle}.`
          : `Trial access as @${me.username ?? account.handle}. Pins are created as sandbox entities and are visible only to you.`,
        supportedFormats: this.constraints.supportedFormats,
        nextAction: standard
          ? undefined
          : 'Record a screen capture showing the full OAuth flow AND a Pinterest API call, then submit for Standard access.',
      };
    } catch (err) {
      const error = err as PublishError;
      return { state: error.kind === 'auth' ? 'error' : 'pending_auth', detail: error.message, supportedFormats: [] };
    }
  }

  async listBoards(account: PublishAccount): Promise<Array<{ id: string; name: string }>> {
    const response = (await this.get('/boards?page_size=50', account)) as {
      items?: Array<{ id: string; name: string }>;
    };
    return response.items ?? [];
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const boardId = item.boardId ?? (account.meta?.defaultBoardId as string | undefined);
    if (!boardId) {
      throw new PublishError('Every pin requires a board_id. None was set on the item or account.', 'permanent');
    }
    const asset = assets[0];
    if (!asset) throw new PublishError('A pin requires media.', 'permanent');

    const payload: Record<string, unknown> = {
      board_id: boardId,
      title: item.title?.slice(0, 100) ?? undefined,
      description: item.body.slice(0, this.constraints.maxChars),
      // Destination link, title and alt text are three separate fields, and alt
      // text is a ranking signal on Pinterest (v2 I.8).
      link: item.finalLinkUrl ?? undefined,
      alt_text: item.altText ?? asset.altText ?? undefined,
      media_source:
        asset.kind === 'video'
          ? { source_type: 'video_id', cover_image_url: account.meta?.coverImageUrl, media_id: asset.id }
          : { source_type: 'image_url', url: asset.publicUrl },
    };

    const created = (await this.post('/pins', payload, account)) as { id?: string };
    if (!created.id) return { mode: 'direct', malformedResponse: true, raw: created };

    const isSandbox = account.capabilityState !== 'live';
    return {
      mode: isSandbox ? 'draft' : 'direct',
      platformPostId: created.id,
      permalink: `https://www.pinterest.com/pin/${created.id}/`,
      manualPublishUrl: isSandbox ? `https://www.pinterest.com/pin/${created.id}/` : undefined,
      raw: created,
    };
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const response = (await this.get(
      `/pins/${publication.platformPostId}/analytics?metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`,
      account,
    )) as Record<string, { lifetime_metrics?: Record<string, number> }>;

    const lifetime = Object.values(response)[0]?.lifetime_metrics ?? {};

    return {
      impressions: lifetime.IMPRESSION,
      saves: lifetime.SAVE,
      linkClicks: lifetime.OUTBOUND_CLICK ?? lifetime.PIN_CLICK,
      raw: response,
      // Pinterest bars caching most API data, so this row expires by design.
      purgeAfter: new Date(Date.now() + PINTEREST_METRIC_RETENTION_DAYS * 86_400_000),
    };
  }

  private get(path: string, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${this.base(account)}${path}`,
      { headers: { authorization: `Bearer ${account.tokens.accessToken}` } },
      `Pinterest GET ${path}`,
    );
  }

  private post(path: string, body: unknown, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${this.base(account)}${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      `Pinterest POST ${path}`,
    );
  }
}
