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
import { clockFor, maxPollsFor } from './clock.js';

/**
 * Pinned deliberately. v2 A.3: "Meta versions the Graph API quarterly and
 * supports each version for roughly two years before sunset. Pin the version
 * explicitly and set a calendar reminder."
 *
 * NEXT REVIEW: 2028-02-01.
 */
export const GRAPH_VERSION = 'v23.0';

/*
 * §184. Instagram Login, not Facebook Login.
 *
 * Halyard used Meta's *other* Instagram product: the Facebook Login for
 * Business flow, which authorises against facebook.com, talks to
 * graph.facebook.com, and finds the account by walking `/me/accounts` to a Page
 * with a linked `instagram_business_account`. That flow requires the creator to
 * own a Facebook Page and to have linked it, which is a real obstacle for people
 * who only have Instagram.
 *
 * Instagram Login authorises against instagram.com, talks to
 * graph.instagram.com, and the token *is* the account — `/me` returns it
 * directly, with no Page in the picture. It also has its own app id and secret,
 * distinct from the Meta app's, exactly as Threads does (§173).
 */
const GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;

/** Short-lived code exchange. Note: api.instagram.com, not graph. */
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

/** Long-lived exchange and refresh live on graph, unversioned. */
const GRAPH_ROOT = 'https://graph.instagram.com';
/*
 * Unversioned by design here: Instagram Login's authorize endpoint takes no API
 * version, unlike the Facebook dialog it replaces (§173).
 */
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';

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
    /*
     * §184. A form POST to api.instagram.com, not a GET to graph.facebook.com.
     *
     * Instagram Login's code exchange is the one endpoint in this adapter that
     * lives outside graph.instagram.com, and it takes form-encoded fields rather
     * than query parameters. It also returns something the Facebook flow never
     * did: `permissions`, the list of scopes the user actually granted — so the
     * separate `/me/permissions` round trip that flow needed is gone.
     */
    const short = (await platformFetch(
      options.fetchImpl ?? fetch,
      TOKEN_URL,
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
      'Instagram code exchange',
    )) as TokenResponse & { user_id?: string | number; permissions?: unknown };

    /*
     * Granted, not requested. A user can decline individual permissions on the
     * consent screen, and the publish gate reads this list — recording the
     * requested set here would report a refused permission as available.
     */
    const granted = grantedFrom(short.permissions);

    /*
     * Short-lived tokens last an hour. Exchanged immediately for the 60-day one,
     * otherwise the connection dies before the first cron run.
     */
    const long = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${GRAPH_ROOT}/access_token?` +
        new URLSearchParams({
          grant_type: 'ig_exchange_token',
          client_secret: options.clientSecret,
          access_token: String(short.access_token),
        }),
      { method: 'GET' },
      'Instagram long-lived token exchange',
    )) as TokenResponse;

    /*
     * The long-lived response carries no `permissions` and no `user_id`, so both
     * are carried across from the short-lived one — the same shape of bug §180
     * fixed for Threads, where scopes were silently dropped on the upgrade.
     */
    const upgraded = toTokenSet(long);
    return {
      ...upgraded,
      scopes: upgraded.scopes.length > 0 ? upgraded.scopes : granted,
      meta: { instagramUserId: short.user_id != null ? String(short.user_id) : undefined },
    };
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    /*
     * §184. `ig_refresh_token` takes the long-lived token itself and needs no
     * client secret — unlike the Facebook flow's `fb_exchange_token`. Instagram
     * only refreshes a token that is at least 24 hours old and not yet expired,
     * which the scheduler's lead time already satisfies.
     */
    const refreshed = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${GRAPH_ROOT}/refresh_access_token?` +
        new URLSearchParams({
          grant_type: 'ig_refresh_token',
          access_token: tokens.accessToken,
        }),
      { method: 'GET' },
      'Instagram token refresh',
    )) as TokenResponse;

    const next = toTokenSet(refreshed);
    /* Neither scopes nor the user id come back; both are carried forward. */
    return {
      ...next,
      scopes: next.scopes.length > 0 ? next.scopes : (tokens.scopes ?? []),
      meta: tokens.meta,
    };
  }

  /**
   * Who this token belongs to.
   *
   * §184. One call, and no alternatives. Under Facebook Login a token commonly
   * reached several Pages, each with its own Instagram account, so the adapter
   * listed them all and made the operator choose — picking the wrong one was
   * silent until a post appeared on a business account they had forgotten they
   * administered.
   *
   * Instagram Login has no such ambiguity: the authorisation *is* for one
   * Instagram account, and `/me` returns it. The identity-confirmation screen
   * still shows it and still requires a human to confirm, which is where the
   * protection actually lives (§176).
   */
  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    const me = (await this.get(
      '/me?fields=user_id,username,name,profile_picture_url,followers_count',
      account,
    )) as {
      id?: string;
      user_id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
    };

    /*
     * `user_id` is the Instagram-scoped id used by every publishing endpoint;
     * `id` is the app-scoped one. Preferring `user_id` matters because it is the
     * value `/{ig-user-id}/media` expects.
     */
    const igUserId =
      me.user_id ?? me.id ?? (account.tokens.meta?.instagramUserId as string | undefined);

    if (!igUserId) {
      throw new PublishError(
        'Instagram returned no account id for this token. Reconnect the account.',
        'malformed_response',
      );
    }

    if (!me.username) {
      throw new PublishError(
        'Instagram returned no username for this token. The account may not be a Professional (Business or Creator) account — switch it in the Instagram app under Settings, Account type and tools.',
        'permanent',
      );
    }

    return {
      platformUserId: igUserId,
      handle: me.username,
      displayName: me.name,
      avatarUrl: me.profile_picture_url,
      followerCount: me.followers_count,
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const igUserId = requireIgUserId(account);
      /**
       * `account_type` is deliberately not requested.
       *
       * Under the Facebook Login flow it was not a field on the Instagram
       * Business node at all, so asking for it made Meta reject the whole call
       * with
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

      /*
       * §420. Meta has two scope families that both grant publishing, and
       * checking only one calls a working account unauthorised.
       *
       * *Instagram API with Instagram Login* grants
       * `instagram_business_content_publish`; *Facebook Login for Business*
       * grants `instagram_content_publish`. Which one an account carries
       * depends on the flow it was connected through, and Halyard requests the
       * first — but an account connected earlier, or through Meta's own
       * business surface, holds the second.
       *
       * Found live: @recipe.fix holds `instagram_content_publish`,
       * `instagram_basic`, `instagram_manage_comments` and
       * `instagram_manage_insights`, is connected with a token valid into
       * October, and was written to the database with `supported_formats = {}`
       * — so `generate.ts` skipped it with "account cannot take any format
       * Halyard produces". A connected, publishable account that could not be
       * drafted for.
       *
       * Either family is accepted. The publish path does not care which one
       * granted the permission; the Graph endpoint it calls is the same.
       */
      const scopes = account.tokens.scopes ?? [];
      const canPublish =
        scopes.includes('instagram_business_content_publish') ||
        scopes.includes('instagram_content_publish');

      if (!canPublish) {
        return {
          state: 'pending_auth',
          detail:
            'Connected, but neither instagram_business_content_publish nor ' +
            'instagram_content_publish was granted.',
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
        nextAction: 'Check that the account is an Instagram Professional account and reconnect.',
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
    /*
     * §200. The clock is injected, not read from the ambient one.
     *
     * Both halves of the wait have to come from the same place. When only
     * `sleep` was replaceable, a rehearsal that stubbed it stopped waiting but
     * kept a deadline five real minutes out — so this loop span as fast as the
     * event loop allowed, recording a request every pass, until the heap gave
     * up. `maxPolls` is the second stop, in case a clock is ever injected that
     * does not advance.
     */
    const clock = clockFor(account.meta);
    const deadline = clock.now() + timeoutMs;
    const maxPolls = maxPollsFor(timeoutMs, intervalMs);

    for (let poll = 0; ; poll += 1) {
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
      if (clock.now() > deadline || poll >= maxPolls) {
        throw new PublishError(
          `Instagram container ${containerId} did not finish processing within ${timeoutMs / 1000}s.`,
          'transient',
        );
      }
      await clock.sleep(intervalMs);
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

/**
 * The scopes Instagram reports as granted on the code exchange.
 *
 * §184. Returned as a comma-separated string in practice and as an array in the
 * documentation, so both are accepted; anything else yields an empty list rather
 * than a guess. Empty means "no evidence", which the publish gate correctly
 * refuses on — inventing the requested set here would defeat it.
 */
function grantedFrom(permissions: unknown): string[] {
  if (Array.isArray(permissions)) {
    return permissions.filter((p): p is string => typeof p === 'string' && p.length > 0);
  }
  if (typeof permissions === 'string') {
    return permissions.split(/[\s,]+/).filter(Boolean);
  }
  return [];
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
