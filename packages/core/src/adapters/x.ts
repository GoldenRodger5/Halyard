/**
 * X. v2 Part A.2.
 *
 * The only platform with no review gate, and the only one that charges per post.
 * Two things follow from the February 2026 pay-per-use change, and both are
 * encoded here rather than left to discipline:
 *
 *   1. The link never goes in the post body. A post containing a URL costs $0.20
 *      against $0.015 without one — 13× — and link posts are algorithmically
 *      deprioritised anyway. `linkStrategy: 'first_reply'`.
 *   2. There is no conversation-discovery code anywhere in Halyard. Reading is
 *      $0.005 per third-party post, which puts automated reply-hunting at
 *      $30–75/month before writing anything. v2 A.2 recommends doing it manually
 *      in the app, so this adapter reads only its own posts' metrics.
 */
import {
  PLATFORM_SCOPES,
  buildAuthUrl,
  toTokenSet,
  type TokenResponse,
} from './oauth.js';
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
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from './types.js';

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const API = 'https://api.x.com/2';
const UPLOAD = 'https://api.x.com/2/media/upload';

export const X_CONSTRAINTS: PlatformConstraints = {
  maxChars: 280,
  maxHashtags: 2,
  supportedFormats: ['text', 'image', 'video'],
  aspectRatios: ['1:1', '16:9', '4:5', '9:16'],
  video: { minSeconds: 1, maxSeconds: 140, maxBytes: 512 * 1024 * 1024 },
  image: { maxBytes: 5 * 1024 * 1024, formats: ['image/jpeg', 'image/png', 'image/webp'] },
  linkStrategy: 'first_reply',
  linkNote:
    'Link goes in the first reply, not the post. $0.20 per link post against $0.015 without, and link posts are deprioritised.',
  requiresReviewForPublicPosting: false,
  supportsTrendingAudioViaApi: false,
  costPerPostUsd: { withoutLink: 0.015, withLink: 0.2 },
};

export class XAdapter implements PlatformAdapter {
  readonly platform = 'x' as const;
  readonly constraints = X_CONSTRAINTS;

  getAuthUrl(state: string, options: OAuthUrlOptions): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      response_type: 'code',
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      scope: (options.scopes ?? PLATFORM_SCOPES.x)!.join(' '),
      state,
      code_challenge: options.codeChallenge,
      code_challenge_method: options.codeChallenge ? 'S256' : undefined,
    });
  }

  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
    });
    if (options.codeVerifier) body.set('code_verifier', options.codeVerifier);

    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: basicAuth(options.clientId, options.clientSecret),
        },
        body,
      },
      'X token exchange',
    )) as TokenResponse;

    return toTokenSet(response);
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    if (!tokens.refreshToken) {
      throw new PublishError('X token has no refresh token; reconnect the account.', 'auth');
    }
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: basicAuth(options.clientId, options.clientSecret),
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          client_id: options.clientId,
        }),
      },
      'X token refresh',
    )) as TokenResponse;
    return toTokenSet(response);
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const me = (await this.get('/users/me', account)) as { data?: { id: string; username: string } };
      return {
        state: 'live',
        detail: `Connected as @${me.data?.username ?? account.handle}. No review gate on X; posting is live and billed per call.`,
        supportedFormats: this.constraints.supportedFormats,
      };
    } catch (err) {
      const error = err as PublishError;
      return {
        state: error.kind === 'auth' ? 'error' : 'pending_auth',
        detail: error.message,
        supportedFormats: [],
        nextAction: 'Reconnect the X account.',
      };
    }
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const { text, linkForReply } = composeCaption(item, this.constraints);

    const mediaIds: string[] = [];
    for (const asset of assets) {
      mediaIds.push(await this.uploadMedia(asset, account));
    }

    const payload: Record<string, unknown> = { text };
    if (mediaIds.length > 0) payload.media = { media_ids: mediaIds };

    const posted = (await this.post('/tweets', payload, account)) as {
      data?: { id?: string; text?: string };
    };

    const postId = posted?.data?.id;
    if (!postId) {
      // build pack §3: success with unknown id. Flag for reconciliation, never
      // retry — a retry here is exactly how you double-post.
      return { mode: 'direct', malformedResponse: true, raw: posted };
    }

    let linkReplyPostId: string | undefined;
    if (linkForReply) {
      const reply = (await this.post(
        '/tweets',
        { text: linkForReply, reply: { in_reply_to_tweet_id: postId } },
        account,
      )) as { data?: { id?: string } };
      linkReplyPostId = reply?.data?.id;
    }

    return {
      mode: 'direct',
      platformPostId: postId,
      permalink: `https://x.com/${account.handle.replace(/^@/, '')}/status/${postId}`,
      linkReplyPostId,
      raw: posted,
    };
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    // Reading your *own* post is $0.001, against $0.005 for a third-party post.
    // Halyard only ever does the former.
    const response = (await this.get(
      `/tweets/${publication.platformPostId}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`,
      account,
    )) as {
      data?: {
        public_metrics?: Record<string, number>;
        non_public_metrics?: Record<string, number>;
        organic_metrics?: Record<string, number>;
      };
    };

    const pub = response.data?.public_metrics ?? {};
    const nonPublic = response.data?.non_public_metrics ?? {};
    const organic = response.data?.organic_metrics ?? {};

    return {
      impressions: nonPublic.impression_count ?? organic.impression_count,
      likes: pub.like_count,
      comments: pub.reply_count,
      shares: pub.retweet_count ?? pub.quote_count,
      linkClicks: nonPublic.url_link_clicks ?? organic.url_link_clicks,
      profileVisits: nonPublic.user_profile_clicks ?? organic.user_profile_clicks,
      videoViews: organic.video_views,
      raw: response,
    };
  }

  async listComments(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<PlatformComment[]> {
    const response = (await this.get(
      `/tweets/search/recent?query=conversation_id:${publication.platformPostId}&tweet.fields=created_at,author_id&expansions=author_id`,
      account,
    )) as {
      data?: Array<{ id: string; text: string; created_at?: string; author_id?: string }>;
      includes?: { users?: Array<{ id: string; username: string; name?: string }> };
    };

    const users = new Map((response.includes?.users ?? []).map((u) => [u.id, u]));
    return (response.data ?? [])
      .filter((t) => t.id !== publication.platformPostId)
      .map((t) => ({
        platformCommentId: t.id,
        authorHandle: t.author_id ? `@${users.get(t.author_id)?.username ?? t.author_id}` : undefined,
        authorDisplayName: t.author_id ? users.get(t.author_id)?.name : undefined,
        body: t.text,
        postedAt: t.created_at ? new Date(t.created_at) : undefined,
      }));
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async uploadMedia(asset: PublishAsset, account: PublishAccount): Promise<string> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const source = await fetchImpl(asset.publicUrl);
    if (!source.ok) {
      throw new PublishError(
        `Could not read asset ${asset.id} from storage (HTTP ${source.status}).`,
        'transient',
      );
    }
    const blob = await source.blob();
    const form = new FormData();
    form.set('media', blob);
    form.set('media_category', asset.kind === 'video' ? 'tweet_video' : 'tweet_image');

    const uploaded = (await platformFetch(
      fetchImpl,
      UPLOAD,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${account.tokens.accessToken}` },
        body: form,
      },
      'X media upload',
    )) as { data?: { id?: string }; media_id_string?: string };

    const mediaId = uploaded.data?.id ?? uploaded.media_id_string;
    if (!mediaId) throw new PublishError('X media upload returned no media id.', 'malformed_response');

    if (asset.altText) {
      await platformFetch(
        fetchImpl,
        `${API}/media/metadata`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${account.tokens.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ id: mediaId, metadata: { alt_text: { text: asset.altText } } }),
        },
        'X alt text',
      ).catch(() => undefined); // Alt text failing must not sink the post.
    }

    return mediaId;
  }

  private get(path: string, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${API}${path}`,
      { headers: { authorization: `Bearer ${account.tokens.accessToken}` } },
      `X GET ${path}`,
    );
  }

  private post(path: string, body: unknown, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${API}${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      `X POST ${path}`,
    );
  }
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/**
 * v2 A.2 cost model, exposed so the dashboard can show what a day of posting
 * actually costs rather than leaving it as a surprise on the invoice.
 */
export function estimateXCostUsd(posts: { hasLink: boolean }[]): number {
  return posts.reduce(
    (total, p) => total + (p.hasLink ? X_CONSTRAINTS.costPerPostUsd!.withLink : X_CONSTRAINTS.costPerPostUsd!.withoutLink),
    0,
  );
}
