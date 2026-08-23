/**
 * Threads. v1 §7 and v2 B.1 — rides the same Meta app as Instagram, with
 * simpler permissions, and is one of the platforms where full automation stays
 * on (v2 E.4).
 *
 * Container → publish, the same shape as Instagram, on a different host.
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
  type PlatformComment,
  type PlatformConstraints,
  type PlatformIdentity,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from './types.js';

const API = 'https://graph.threads.net/v1.0';
const AUTHORIZE_URL = 'https://threads.net/oauth/authorize';

export const THREADS_CONSTRAINTS: PlatformConstraints = {
  maxChars: 500,
  maxHashtags: 3,
  supportedFormats: ['text', 'image', 'video', 'carousel'],
  aspectRatios: ['1:1', '4:5', '9:16', '16:9'],
  video: { minSeconds: 1, maxSeconds: 300 },
  carousel: { min: 2, max: 20 },
  linkStrategy: 'in_body',
  linkNote: 'Links are clickable inline on Threads, so the link goes in the post.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
  delivery: {
    nativeDraft: false,
    privateUpload: false,
    apiScheduling: false,
    requiresCreatorCompletion: false,
    note: 'Same two-step container as Instagram — POST /threads then /threads_publish — with no documented draft capability. The container exists to be published seconds later.',
  },
};

export class ThreadsAdapter implements PlatformAdapter {
  readonly platform = 'threads' as const;
  readonly constraints = THREADS_CONSTRAINTS;

  getAuthUrl(state: string, options: OAuthUrlOptions): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      state,
      scope: (options.scopes ?? PLATFORM_SCOPES.threads)!.join(','),
    });
  }

  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const short = (await platformFetch(
      options.fetchImpl ?? fetch,
      'https://graph.threads.net/oauth/access_token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: options.redirectUri,
          code,
        }),
      },
      'Threads code exchange',
    )) as TokenResponse & { user_id?: string };

    const long = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${API.replace('/v1.0', '')}/access_token?` +
        new URLSearchParams({
          grant_type: 'th_exchange_token',
          client_secret: options.clientSecret,
          access_token: String(short.access_token),
        }),
      { method: 'GET' },
      'Threads long-lived token exchange',
    )) as TokenResponse;

    return { ...toTokenSet(long), meta: { threadsUserId: short.user_id } };
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    const refreshed = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${API.replace('/v1.0', '')}/refresh_access_token?` +
        new URLSearchParams({ grant_type: 'th_refresh_token', access_token: tokens.accessToken }),
      { method: 'GET' },
      'Threads token refresh',
    )) as TokenResponse;
    return { ...toTokenSet(refreshed), meta: tokens.meta };
  }

  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    const me = (await this.get(
      '/me?fields=id,username,name,threads_profile_picture_url',
      account,
    )) as { id?: string; username?: string; name?: string; threads_profile_picture_url?: string };

    if (!me.id) {
      throw new PublishError('Threads returned no user for this token.', 'malformed_response', undefined, undefined, me);
    }
    return {
      platformUserId: me.id,
      handle: me.username ?? me.id,
      displayName: me.name,
      avatarUrl: me.threads_profile_picture_url,
      detail: 'Threads shares an identity with Instagram; the handle should match.',
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const me = (await this.get('/me?fields=id,username', account)) as { username?: string };
      const reviewed = account.meta?.appReviewApproved === true;
      return {
        state: reviewed ? 'live' : 'draft_only',
        detail: reviewed
          ? `Live as @${me.username ?? account.handle}.`
          : `Connected as @${me.username ?? account.handle}. Public publishing rides the same Meta App Review as Instagram.`,
        supportedFormats: this.constraints.supportedFormats,
        nextAction: reviewed ? undefined : 'Flip to live once Meta App Review lands.',
      };
    } catch (err) {
      const error = err as PublishError;
      return { state: error.kind === 'auth' ? 'error' : 'pending_auth', detail: error.message, supportedFormats: [] };
    }
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const userId = account.platformUserId ?? (account.meta?.threadsUserId as string | undefined);
    if (!userId) throw new PublishError('No Threads user id on the account.', 'permanent');

    const { text } = composeCaption(item, this.constraints);
    const asset = assets[0];

    const fields: Record<string, string> = { text };
    if (!asset) {
      fields.media_type = 'TEXT';
    } else if (asset.kind === 'video') {
      fields.media_type = 'VIDEO';
      fields.video_url = asset.publicUrl;
    } else {
      fields.media_type = 'IMAGE';
      fields.image_url = asset.publicUrl;
      if (asset.altText) fields.alt_text = asset.altText;
    }

    const container = (await this.post(`/${userId}/threads`, fields, account)) as { id?: string };
    if (!container.id) throw new PublishError('Threads container had no id.', 'malformed_response');

    const published = (await this.post(
      `/${userId}/threads_publish`,
      { creation_id: container.id },
      account,
    )) as { id?: string };

    if (!published.id) return { mode: 'direct', malformedResponse: true, raw: published };

    const permalink = await this.get(`/${published.id}?fields=permalink`, account)
      .then((r) => (r as { permalink?: string }).permalink)
      .catch(() => undefined);

    return { mode: 'direct', platformPostId: published.id, permalink, raw: published };
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const response = (await this.get(
      `/${publication.platformPostId}/insights?metric=views,likes,replies,reposts,quotes,shares`,
      account,
    )) as { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };

    const read = (name: string) => response.data?.find((d) => d.name === name)?.values?.[0]?.value;
    return {
      impressions: read('views'),
      likes: read('likes'),
      comments: read('replies'),
      shares: (read('reposts') ?? 0) + (read('quotes') ?? 0) || undefined,
      raw: response,
    };
  }

  async listComments(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<PlatformComment[]> {
    const response = (await this.get(
      `/${publication.platformPostId}/replies?fields=id,text,username,timestamp`,
      account,
    )) as { data?: Array<{ id: string; text: string; username?: string; timestamp?: string }> };

    return (response.data ?? []).map((r) => ({
      platformCommentId: r.id,
      authorHandle: r.username ? `@${r.username}` : undefined,
      body: r.text,
      postedAt: r.timestamp ? new Date(r.timestamp) : undefined,
    }));
  }

  private get(path: string, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${API}${path}`,
      { headers: { authorization: `Bearer ${account.tokens.accessToken}` } },
      `Threads GET ${path}`,
    );
  }

  private post(
    path: string,
    fields: Record<string, string>,
    account: PublishAccount,
  ): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${API}${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(fields),
      },
      `Threads POST ${path}`,
    );
  }
}
