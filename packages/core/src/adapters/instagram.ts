/**
 * Instagram. v2 Part A.3.
 *
 * Publishing is a two-step Graph API call: POST a media container to
 * /{ig-user-id}/media, then publish via /{ig-user-id}/media_publish. Carousels
 * create N children then a parent. Reels add a polling step because the video
 * has to finish processing first.
 *
 * Three traps encoded here:
 *   · Media must be on a publicly accessible server at publish time, because
 *     Meta cURLs it. Signed URLs with short expiry do not work.
 *   · Every carousel slide must be built at the same aspect ratio — Instagram
 *     crops slides 2..n to match slide 1. Gate 3 enforces it; this refuses it.
 *   · The Graph API version is pinned explicitly. Meta versions quarterly and
 *     supports each version for roughly two years.
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

/**
 * Pinned deliberately. v2 A.3: "Meta versions the Graph API quarterly and
 * supports each version for roughly two years before sunset. Pin the version
 * explicitly and set a calendar reminder."
 *
 * NEXT REVIEW: 2028-02-01.
 */
export const GRAPH_VERSION = 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
/*
 * §173. Versioned, like every other Graph call this adapter makes.
 *
 * An unversioned dialog resolves to the *oldest* version Meta still serves, which
 * is by definition the one closest to removal — so the login dialog would start
 * failing on Meta's deprecation schedule rather than on any change here, while
 * `GRAPH_VERSION` stayed pinned and correct. Same version, one place.
 */
const AUTHORIZE_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

export const INSTAGRAM_CONSTRAINTS: PlatformConstraints = {
  maxChars: 2200,
  maxHashtags: 8,
  supportedFormats: ['image', 'carousel', 'video', 'story'],
  aspectRatios: ['1:1', '4:5', '9:16'],
  video: { minSeconds: 5, maxSeconds: 90, codecs: ['h264', 'hevc'] },
  image: { formats: ['image/jpeg', 'image/png'] },
  carousel: { min: 2, max: 10, sameAspectRatioRequired: true },
  linkStrategy: 'bio_only',
  linkNote: 'Captions are not clickable. Link lives in bio and rotates per campaign.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
  delivery: {
    nativeDraft: false,
    privateUpload: false,
    apiScheduling: false,
    requiresCreatorCompletion: false,
    note: 'Publishing is /media then /media_publish. The container is a transient step, invisible to the creator, and expires after 24 hours — not a draft and not a usable unpublished upload.',
  },
};

/** v2 A.3: 100 API-published posts per rolling 24 hours; a carousel counts as one. */
export const INSTAGRAM_DAILY_PUBLISH_LIMIT = 100;

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = 'instagram' as const;
  readonly constraints = INSTAGRAM_CONSTRAINTS;

  getAuthUrl(state: string, options: OAuthUrlOptions): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      state,
      response_type: 'code',
      scope: (options.scopes ?? PLATFORM_SCOPES.instagram)!.join(','),
    });
  }

  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const short = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUri,
          code,
        }),
      { method: 'GET' },
      'Instagram code exchange',
    )) as TokenResponse;

    // Short-lived tokens last an hour. Exchange immediately for the 60-day one,
    // otherwise the connection dies before the first cron run.
    const long = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: options.clientId,
          client_secret: options.clientSecret,
          fb_exchange_token: String(short.access_token),
        }),
      { method: 'GET' },
      'Instagram long-lived token exchange',
    )) as TokenResponse;

    /**
     * Ask Meta which permissions were actually granted.
     *
     * Meta's token response carries no `scope` field — unlike X's — so without
     * this the account persists an empty scope list, and the publish gate
     * (`scopes.includes('instagram_content_publish')`) reports the permission
     * refused when it was granted. Requested is not granted, and Halyard had no
     * evidence of the second.
     *
     * `/me/permissions` is the endpoint Meta provides for exactly this, and it
     * distinguishes `granted` from `declined` — so a permission the user
     * refused is recorded as absent rather than assumed present.
     *
     * A failure here is not fatal to the connection: the token is real and the
     * account should still be saved. It leaves scopes empty, which the gate
     * correctly reads as "no evidence", not as "granted".
     */
    const scopes = await this.grantedPermissions(String(long.access_token), options.fetchImpl);
    return { ...toTokenSet(long), scopes };
  }

  /**
   * The permissions Meta reports as granted for this token.
   *
   * Only `status === 'granted'` is kept. Anything declined or expired is
   * omitted, so the persisted list is evidence of what is actually available
   * rather than a copy of what was asked for.
   */
  async grantedPermissions(accessToken: string, fetchImpl?: typeof fetch): Promise<string[]> {
    try {
      const response = (await platformFetch(
        fetchImpl ?? fetch,
        `${GRAPH}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
        { method: 'GET' },
        'Instagram permission check',
      )) as { data?: Array<{ permission?: string; status?: string }> };

      return (response.data ?? [])
        .filter((entry) => entry.status === 'granted' && typeof entry.permission === 'string')
        .map((entry) => entry.permission as string);
    } catch {
      // Unreachable or refused. Returning nothing keeps the state honestly
      // unknown; inventing the requested list here would defeat the gate.
      return [];
    }
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    const refreshed = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: options.clientId,
          client_secret: options.clientSecret,
          fb_exchange_token: tokens.accessToken,
        }),
      { method: 'GET' },
      'Instagram token refresh',
    )) as TokenResponse;
    return { ...toTokenSet(refreshed), meta: tokens.meta };
  }

  /**
   * A Meta token commonly reaches several Pages, each with its own Instagram
   * Professional account. Picking the wrong one is silent until the first post
   * appears on a business account you forgot you administered, so all of them
   * are returned and the operator chooses.
   */
  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    const pages = (await this.get(
      '/me/accounts?fields=name,instagram_business_account{id,username,name,profile_picture_url,followers_count}',
      account,
    )) as {
      data?: Array<{
        name?: string;
        instagram_business_account?: {
          id?: string;
          username?: string;
          name?: string;
          profile_picture_url?: string;
          followers_count?: number;
        };
      }>;
    };

    const linked = (pages.data ?? [])
      .filter((p) => p.instagram_business_account?.id)
      .map((p) => ({ page: p.name, ig: p.instagram_business_account! }));

    if (linked.length === 0) {
      throw new PublishError(
        'This Facebook account administers no Page with a linked Instagram Professional account. ' +
          'In the Instagram app: Settings → Account type and tools → Switch to professional account, ' +
          'then link it to a Facebook Page under Settings → Page.',
        'permanent',
      );
    }

    const [first, ...rest] = linked;
    return {
      platformUserId: first!.ig.id!,
      handle: first!.ig.username ?? first!.ig.id!,
      displayName: first!.ig.name,
      avatarUrl: first!.ig.profile_picture_url,
      followerCount: first!.ig.followers_count,
      detail: `Linked to the Facebook Page "${first!.page ?? 'unnamed'}".`,
      alternatives: rest.map((r) => ({
        platformUserId: r.ig.id!,
        handle: r.ig.username ?? r.ig.id!,
        displayName: r.ig.name,
        detail: `Page "${r.page ?? 'unnamed'}"`,
      })),
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const igUserId = requireIgUserId(account);
      /**
       * `account_type` is deliberately not requested.
       *
       * It is not a field on the Instagram *Business* node reached through
       * Facebook Login — it belongs to the Instagram Login / Basic Display
       * APIs — so asking for it made Meta reject the whole call with
       * `(#100) Tried accessing nonexisting field (account_type)`. Nothing here
       * ever read the value; it was dead in the request and fatal to it, which
       * is why a correctly connected account sat at `pending_auth`.
       *
       * Found by running the existing connection test against the live
       * @recipe.fix account on 2026-08-19.
       */
      const profile = (await this.get(
        `/${igUserId}?fields=username,media_count`,
        account,
      )) as { username?: string };

      const scopes = account.tokens.scopes ?? [];
      const canPublish = scopes.includes('instagram_content_publish');

      if (!canPublish) {
        return {
          state: 'pending_auth',
          detail: 'Connected, but instagram_content_publish was not granted.',
          supportedFormats: [],
          nextAction: 'Reconnect and accept the content-publishing permission.',
        };
      }

      // Dev-mode apps can publish to the developer's own account immediately;
      // anything beyond 25 test users needs Meta App Review. Halyard cannot tell
      // review status from the API, so the operator flips this on /accounts when
      // approval lands (v1 §8).
      const reviewed = account.meta?.appReviewApproved === true;
      return {
        state: reviewed ? 'live' : 'draft_only',
        detail: reviewed
          ? `Live as @${profile.username ?? account.handle}.`
          : `Connected as @${profile.username ?? account.handle}. Publishing works against your own account in dev mode; public use needs Meta App Review (2 to 4 weeks per submission).`,
        supportedFormats: this.constraints.supportedFormats,
        nextAction: reviewed ? undefined : 'Submit Meta App Review, then flip this account to live.',
      };
    } catch (err) {
      const error = err as PublishError;
      return {
        state: error.kind === 'auth' ? 'error' : 'pending_auth',
        detail: error.message,
        supportedFormats: [],
        nextAction: 'Check the Facebook Page link and the Instagram Professional account.',
      };
    }
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const igUserId = requireIgUserId(account);
    const { text } = composeCaption(item, this.constraints);

    if (assets.length === 0) {
      throw new PublishError('Instagram requires media. A text-only post is not possible.', 'permanent');
    }
    for (const asset of assets) {
      assertPublicUrl(asset);
    }

    let containerId: string;

    if (item.format === 'carousel') {
      if (assets.length < 2) {
        throw new PublishError('A carousel needs at least two slides.', 'permanent');
      }
      assertUniformAspectRatio(assets);

      const childIds: string[] = [];
      for (const asset of assets) {
        const child = (await this.post(
          `/${igUserId}/media`,
          {
            ...mediaFieldsFor(asset),
            is_carousel_item: 'true',
          },
          account,
        )) as { id?: string };
        if (!child.id) throw new PublishError('Carousel child container had no id.', 'malformed_response');
        childIds.push(child.id);
      }

      const parent = (await this.post(
        `/${igUserId}/media`,
        { media_type: 'CAROUSEL', children: childIds.join(','), caption: text },
        account,
      )) as { id?: string };
      if (!parent.id) throw new PublishError('Carousel parent container had no id.', 'malformed_response');
      containerId = parent.id;
    } else if (item.format === 'video') {
      const asset = assets[0]!;
      const created = (await this.post(
        `/${igUserId}/media`,
        {
          media_type: 'REELS',
          video_url: asset.publicUrl,
          caption: text,
          ...(item.requiresAiLabel ? { ai_generated: 'true' } : {}),
        },
        account,
      )) as { id?: string };
      if (!created.id) throw new PublishError('Reels container had no id.', 'malformed_response');
      containerId = created.id;
      await this.waitForContainer(containerId, account);
    } else {
      const asset = assets[0]!;
      const created = (await this.post(
        `/${igUserId}/media`,
        { ...mediaFieldsFor(asset), caption: text },
        account,
      )) as { id?: string };
      if (!created.id) throw new PublishError('Media container had no id.', 'malformed_response');
      containerId = created.id;
    }

    const published = (await this.post(
      `/${igUserId}/media_publish`,
      { creation_id: containerId },
      account,
    )) as { id?: string };

    if (!published.id) {
      return { mode: 'direct', malformedResponse: true, raw: published };
    }

    const permalink = await this.get(`/${published.id}?fields=permalink`, account)
      .then((r) => (r as { permalink?: string }).permalink)
      .catch(() => undefined);

    return { mode: 'direct', platformPostId: published.id, permalink, raw: published };
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const metrics = 'impressions,reach,saved,likes,comments,shares,profile_visits,follows,video_views';
    const response = (await this.get(
      `/${publication.platformPostId}/insights?metric=${metrics}`,
      account,
    )) as { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };

    const read = (name: string): number | undefined =>
      response.data?.find((d) => d.name === name)?.values?.[0]?.value;

    return {
      impressions: read('impressions'),
      reach: read('reach'),
      likes: read('likes'),
      comments: read('comments'),
      shares: read('shares'),
      saves: read('saved'),
      profileVisits: read('profile_visits'),
      follows: read('follows'),
      videoViews: read('video_views'),
      raw: response,
    };
  }

  async listComments(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<PlatformComment[]> {
    const response = (await this.get(
      `/${publication.platformPostId}/comments?fields=id,text,username,timestamp`,
      account,
    )) as { data?: Array<{ id: string; text: string; username?: string; timestamp?: string }> };

    return (response.data ?? []).map((c) => ({
      platformCommentId: c.id,
      authorHandle: c.username ? `@${c.username}` : undefined,
      body: c.text,
      postedAt: c.timestamp ? new Date(c.timestamp) : undefined,
    }));
  }

  /**
   * Reels containers report FINISHED, IN_PROGRESS, ERROR or EXPIRED. Publishing
   * before FINISHED fails, so this polls with a ceiling rather than hoping.
   */
  private async waitForContainer(
    containerId: string,
    account: PublishAccount,
    timeoutMs = 5 * 60_000,
    intervalMs = 5_000,
  ): Promise<void> {
    const sleep = (account.meta?.sleep as ((ms: number) => Promise<void>) | undefined) ??
      ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const status = (await this.get(
        `/${containerId}?fields=status_code,status`,
        account,
      )) as { status_code?: string; status?: string };

      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new PublishError(
          `Instagram container ${containerId} ended as ${status.status_code}: ${status.status ?? ''}`,
          'permanent',
        );
      }
      if (Date.now() > deadline) {
        throw new PublishError(
          `Instagram container ${containerId} did not finish processing within ${timeoutMs / 1000}s.`,
          'transient',
        );
      }
      await sleep(intervalMs);
    }
  }

  private get(path: string, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const separator = path.includes('?') ? '&' : '?';
    return platformFetch(
      fetchImpl,
      `${GRAPH}${path}${separator}access_token=${encodeURIComponent(account.tokens.accessToken)}`,
      { method: 'GET' },
      `Instagram GET ${path}`,
    );
  }

  private post(
    path: string,
    fields: Record<string, string>,
    account: PublishAccount,
  ): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const body = new URLSearchParams({ ...fields, access_token: account.tokens.accessToken });
    return platformFetch(
      fetchImpl,
      `${GRAPH}${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      },
      `Instagram POST ${path}`,
    );
  }
}

function mediaFieldsFor(asset: PublishAsset): Record<string, string> {
  if (asset.kind === 'video') return { media_type: 'REELS', video_url: asset.publicUrl };
  const fields: Record<string, string> = { image_url: asset.publicUrl };
  if (asset.altText) fields.alt_text = asset.altText;
  return fields;
}

export function requireIgUserId(account: PublishAccount): string {
  const id = account.platformUserId ?? (account.meta?.igUserId as string | undefined);
  if (!id) {
    throw new PublishError(
      'No Instagram user id on the account. Reconnect so the linked Page and IG Professional account are discovered.',
      'permanent',
    );
  }
  return id;
}

export function assertPublicUrl(asset: PublishAsset): void {
  const url = asset.publicUrl;
  if (!/^https:\/\//i.test(url)) {
    throw new PublishError(`Asset ${asset.id} is not served over HTTPS.`, 'permanent');
  }
  // Meta cURLs the URL at publish time. A signed URL with a short expiry is the
  // single most common cause of a container that never finishes.
  if (/[?&](x-amz-expires|token|signature|se=|sig=|expires)=/i.test(url)) {
    throw new PublishError(
      `Asset ${asset.id} looks like a signed URL. Meta fetches the media itself; use a public Storage URL.`,
      'permanent',
    );
  }
}

export function assertUniformAspectRatio(assets: PublishAsset[]): void {
  const known = assets.filter((a) => a.width && a.height);
  if (known.length < 2) return;
  const first = known[0]!.width! / known[0]!.height!;
  const offenders = known
    .map((a, i) => ({ i, ratio: a.width! / a.height! }))
    .filter((a) => Math.abs(a.ratio - first) / first > 0.005);
  if (offenders.length > 0) {
    throw new PublishError(
      `Carousel slides ${offenders.map((o) => o.i + 1).join(', ')} do not match slide 1's aspect ratio. Instagram would crop them.`,
      'permanent',
    );
  }
}
