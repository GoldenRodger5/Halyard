/**
 * YouTube. v2 Part A.6.
 *
 * Apps created after 28 July 2020 that have not passed a compliance audit can
 * only upload as private. That is not a failure state — it is the expected
 * state on day one, so an unaudited account is `draft_only` and the upload sets
 * privacyStatus: 'private' rather than erroring.
 *
 * Quota, post the June 2026 change: uploads bill to their own daily bucket of
 * roughly 100 calls rather than drawing 1,600 units from the shared 10,000-unit
 * pool. Any guide quoting the 1,600 figure predates December 2025.
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
  type PlatformComment,
  type PlatformConstraints,
  type PlatformIdentity,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from './types.js';
import {
  YOUTUBE_DESCRIPTION_MAX_CHARS,
  YOUTUBE_LONG_FORM_MAX_SECONDS,
  YOUTUBE_TITLE_MAX_CHARS,
  categoryIdFor,
  resolveVariant,
  validateYouTubeUpload,
  type YouTubeVariant,
} from '../youtube/variant.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';

/** v2 A.6 — read 1 unit, search 100, write 50, from a 10,000/day pool. */
export const YOUTUBE_QUOTA_COST = { read: 1, search: 100, write: 50 } as const;
export const YOUTUBE_DAILY_UPLOAD_BUCKET = 100;
/** Resumable upload chunks must be multiples of 256 KB. */
export const YOUTUBE_CHUNK_BYTES = 256 * 1024 * 32; // 8 MB, a multiple of 256 KB

export const YOUTUBE_CONSTRAINTS: PlatformConstraints = {
  maxChars: YOUTUBE_DESCRIPTION_MAX_CHARS,
  maxHashtags: 5,
  supportedFormats: ['video'],
  aspectRatios: ['9:16', '1:1', '16:9'],
  /**
   * The platform envelope, not the Shorts rule. §199.
   *
   * This said `maxSeconds: 60`, which was the Shorts cap until 15 October 2024
   * and was never the YouTube cap. Stated platform-wide it did two things at
   * once: rejected legitimate 90-second Shorts, and made long-form video
   * impossible to express — the one constraint capped the entire platform at a
   * minute. Per-variant limits live in `limitsFor`, enforced by
   * `validateYouTubeUpload`, because they differ by an order of magnitude.
   */
  video: { minSeconds: 1, maxSeconds: YOUTUBE_LONG_FORM_MAX_SECONDS, codecs: ['h264'] },
  linkStrategy: 'description',
  linkNote: 'Description, first line, above the fold.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
  delivery: {
    nativeDraft: false,
    privateUpload: true,
    apiScheduling: true,
    requiresCreatorCompletion: false,
    /**
     * §199 corrected the second half of this note.
     *
     * It claimed a private upload could "later be published via videos.update".
     * That method requires `youtube` or `youtube.force-ssl`, and Halyard
     * requests neither — it holds `youtube.upload`, `youtube.readonly` and
     * `yt-analytics.readonly`. So a private video stays private until a human
     * opens Studio, and the note said otherwise for months.
     *
     * `status.publishAt` at insert *is* reachable on `youtube.upload`, which is
     * what `apiScheduling: true` now honestly refers to.
     */
    note:
      'videos.insert with status.privacyStatus=private is a real private video. status.publishAt schedules it at ' +
      'upload time and requires privacyStatus=private. Flipping an existing private video public needs videos.update, ' +
      'which requires the youtube or youtube.force-ssl scope — Halyard requests neither, so that is Studio work today. ' +
      'There is no draft object.',
  },
};

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube' as const;
  readonly constraints = YOUTUBE_CONSTRAINTS;

  getAuthUrl(state: string, options: OAuthUrlOptions): string {
    return buildAuthUrl(AUTHORIZE_URL, {
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      state,
      scope: (options.scopes ?? PLATFORM_SCOPES.youtube)!.join(' '),
      // Without these two, Google returns no refresh token on a repeat consent
      // and the connection silently dies an hour later.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
  }

  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUri,
          grant_type: 'authorization_code',
        }),
      },
      'YouTube code exchange',
    )) as TokenResponse;
    return toTokenSet(response);
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    if (!tokens.refreshToken) {
      throw new PublishError(
        'Google returned no refresh token. Reconnect with prompt=consent and access_type=offline.',
        'auth',
      );
    }
    const response = (await platformFetch(
      options.fetchImpl ?? fetch,
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: tokens.refreshToken,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          grant_type: 'refresh_token',
        }),
      },
      'YouTube token refresh',
    )) as TokenResponse;
    // Google does not return the refresh token again; keep the one we have.
    const next = toTokenSet(response);
    return { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
  }

  /**
   * A Google account can own a personal channel and any number of brand
   * channels. `mine=true` returns whichever the consent screen selected, so the
   * confirmation step matters more here than anywhere else.
   */
  async fetchIdentity(account: PublishAccount): Promise<PlatformIdentity> {
    const channels = (await this.get(
      '/channels?part=snippet,statistics&mine=true',
      account,
    )) as {
      items?: Array<{
        id: string;
        snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
        statistics?: { subscriberCount?: string };
      }>;
    };

    const items = channels.items ?? [];
    if (items.length === 0) {
      throw new PublishError(
        'This Google account has no YouTube channel. Create one at youtube.com/create_channel, then reconnect.',
        'permanent',
      );
    }

    const [first, ...rest] = items;
    return {
      platformUserId: first!.id,
      handle: first!.snippet?.customUrl?.replace(/^@/, '') ?? first!.id,
      displayName: first!.snippet?.title,
      avatarUrl: first!.snippet?.thumbnails?.default?.url,
      followerCount: first!.statistics?.subscriberCount
        ? Number(first!.statistics.subscriberCount)
        : undefined,
      alternatives: rest.map((c) => ({
        platformUserId: c.id,
        handle: c.snippet?.customUrl?.replace(/^@/, '') ?? c.id,
        displayName: c.snippet?.title,
      })),
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const channels = (await this.get('/channels?part=snippet&mine=true', account)) as {
        items?: Array<{ id: string; snippet?: { title?: string } }>;
      };
      const channel = channels.items?.[0];
      if (!channel) {
        return {
          state: 'error',
          detail: 'The Google account has no YouTube channel.',
          supportedFormats: [],
          nextAction: 'Create a channel on this account, then reconnect.',
        };
      }
      /*
       * §201. Same gate, same reason — but note what this does *not* do: it
       * never reports `live` on its own initiative. There is no API that
       * discloses whether the compliance audit passed, so a capability refresh
       * can only repeat what an operator already declared. Inferring it from a
       * successful upload would be wrong: unaudited uploads succeed too, they
       * are just private.
       */
      const audited =
        account.capabilityState === 'live' || account.meta?.complianceAuditPassed === true;
      return {
        state: audited ? 'live' : 'draft_only',
        detail: audited
          ? `Live on ${channel.snippet?.title ?? channel.id}.`
          : `Connected to ${channel.snippet?.title ?? channel.id}. Until the compliance audit passes, uploads land as private.`,
        supportedFormats: this.constraints.supportedFormats,
        nextAction: audited
          ? undefined
          : 'Submit the YouTube API Services compliance audit with a demo video of the OAuth flow.',
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
    const asset = assets.find((a) => a.kind === 'video');
    if (!asset) throw new PublishError('YouTube requires a video asset.', 'permanent');

    /**
     * §201. The audit gate had no producer, so it could never open.
     *
     * This read `account.meta?.complianceAuditPassed === true`, and **nothing
     * in production sets it.** `meta` is assembled in `publish.ts` from
     * `job.payload.accountMeta`, which only ever appears in tests. So `audited`
     * was always false, and every YouTube upload was private regardless of
     * whether the compliance audit had actually passed. Passing the audit —
     * the whole point of the exercise — would have changed nothing.
     *
     * The producer it needed already exists. `capability_state = 'live'` is
     * exactly "an operator marked this past platform review" (gotcha 5), which
     * for YouTube *is* the compliance audit. Using it makes the audit
     * meaningful and keeps the decision where it belongs: with a person, in one
     * place, for every platform.
     *
     * This does not broaden anything today — YouTube is `draft_only`, so
     * uploads stay private until a human changes that deliberately, and
     * `publishing_enabled` still gates the pipeline above it. The meta flag is
     * still honoured so a test can force the path without a database.
     */
    const audited =
      account.capabilityState === 'live' || account.meta?.complianceAuditPassed === true;
    const privacyStatus = audited && account.capabilityState === 'live' ? 'public' : 'private';

    /**
     * Shorts or long-form. §199.
     *
     * This used to be a boolean computed inline from the asset — vertical and
     * under sixty seconds. That is close to YouTube's own rule but not it (the
     * cap has been three minutes since October 2024, and square counts as
     * vertical), and more importantly it left no way to *intend* long-form. The
     * intent now travels on the item and is reconciled against what YouTube
     * will actually do with the file.
     */
    const declared = (item.formatSubtype === 'long_form' ? 'long_form' : item.formatSubtype === 'short' ? 'short' : null) as
      | YouTubeVariant
      | null;
    const resolution = resolveVariant(declared, asset);
    const variant = resolution.actual;

    /*
     * `#Shorts` stopped being a classifier in October 2024 — aspect ratio and
     * duration decide it now. It stays on Shorts as a discovery signal, and is
     * never appended to long-form, where it would be a lie about the format.
     */
    const room = variant === 'short' ? YOUTUBE_TITLE_MAX_CHARS - ' #Shorts'.length : YOUTUBE_TITLE_MAX_CHARS;
    const baseTitle = (item.title ?? item.body.split('\n')[0] ?? 'Untitled').slice(0, room);
    const title =
      variant === 'short' && !/#shorts/i.test(baseTitle) ? `${baseTitle} #Shorts` : baseTitle;

    /*
     * Long-form leads with the summary and puts the link lower; a Short leads
     * with the link because almost nobody expands the description. The advice
     * in `limitsFor` is what the copywriter is briefed with, and this is the
     * assembly that matches it.
     */
    const disclosure = item.requiresAiLabel && item.disclosureText ? item.disclosureText : '';
    const descriptionParts =
      variant === 'long_form'
        ? [item.body, item.finalLinkUrl ?? '', disclosure]
        : [item.finalLinkUrl ?? '', item.body, disclosure];

    const description = descriptionParts.filter(Boolean).join('\n\n').slice(0, YOUTUBE_DESCRIPTION_MAX_CHARS);
    const tags = item.hashtags.slice(0, this.constraints.maxHashtags).map((t) => t.replace(/^#/, ''));

    /*
     * Scheduling, which the delivery contract has advertised since §156 and
     * which nothing implemented. `status.publishAt` is accepted by
     * `videos.insert` on the upload scope alone; it requires the video to be
     * private, which every unaudited upload already is.
     */
    const publishAt =
      item.scheduledAt && privacyStatus === 'private' && item.scheduledAt.getTime() > Date.now()
        ? item.scheduledAt
        : null;

    const issues = validateYouTubeUpload({
      variant,
      asset,
      title,
      description,
      tags,
      publishAt,
      privacyStatus,
    });
    const blocking = issues.filter((i) => i.severity === 'error');
    if (blocking.length > 0) {
      throw new PublishError(
        blocking.map((i) => `${i.field}: ${i.message}`).join(' '),
        'permanent',
      );
    }

    const metadata = {
      snippet: {
        title,
        description,
        tags,
        // §199. Was hardcoded to Howto & Style for every upload, including
        // founder posts about building the product.
        categoryId: categoryIdFor(item.category),
        ...(item.language ? { defaultLanguage: item.language } : {}),
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
        // v2 Part C / EU AI Act Article 50: declare synthetic content natively
        // where the platform offers a toggle.
        ...(item.requiresAiLabel ? { containsSyntheticMedia: true } : {}),
        ...(publishAt ? { publishAt: publishAt.toISOString() } : {}),
      },
    };

    const videoId = await this.resumableUpload(asset, metadata, account);
    if (!videoId) return { mode: 'direct', malformedResponse: true };

    return {
      /**
       * §156. `private`, not `draft`.
       *
       * A private YouTube video is real content the channel owns and that
       * Halyard can still publish over the API — `videos.update` flips it, and
       * `status.publishAt` schedules it. Reporting it as a draft told the
       * operator to go and finish something that needs no finishing, and hid
       * the fact that Halyard could act on it.
       */
      mode: privacyStatus === 'public' ? 'direct' : 'private',
      platformPostId: videoId,
      permalink: `https://www.youtube.com/watch?v=${videoId}`,
      /*
       * A scheduled private video needs no human at all — YouTube flips it at
       * `publishAt` on its own. Sending the operator to Studio for one would be
       * asking them to finish something already finished.
       */
      manualPublishUrl:
        privacyStatus === 'private' && !publishAt
          ? `https://studio.youtube.com/video/${videoId}/edit`
          : undefined,
    };
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const response = (await this.get(
      `/videos?part=statistics&id=${publication.platformPostId}`,
      account,
    )) as { items?: Array<{ statistics?: Record<string, string> }> };

    const stats = response.items?.[0]?.statistics ?? {};
    const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
    return {
      videoViews: num(stats.viewCount),
      impressions: num(stats.viewCount),
      likes: num(stats.likeCount),
      comments: num(stats.commentCount),
      raw: response,
    };
  }

  async listComments(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<PlatformComment[]> {
    const response = (await this.get(
      `/commentThreads?part=snippet&videoId=${publication.platformPostId}&maxResults=50`,
      account,
    )) as {
      items?: Array<{
        id: string;
        snippet?: {
          topLevelComment?: {
            snippet?: { textOriginal?: string; authorDisplayName?: string; publishedAt?: string };
          };
        };
      }>;
    };

    return (response.items ?? []).map((thread) => {
      const s = thread.snippet?.topLevelComment?.snippet;
      return {
        platformCommentId: thread.id,
        authorDisplayName: s?.authorDisplayName,
        body: s?.textOriginal ?? '',
        postedAt: s?.publishedAt ? new Date(s.publishedAt) : undefined,
      };
    });
  }

  /**
   * Resumable upload: initiate, then PUT chunks in 256 KB multiples. Splitting
   * the upload is what makes a dropped connection resumable instead of fatal.
   */
  private async resumableUpload(
    asset: PublishAsset,
    metadata: unknown,
    account: PublishAccount,
  ): Promise<string | null> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;

    const source = await fetchImpl(asset.publicUrl);
    if (!source.ok) {
      throw new PublishError(`Could not read video asset (HTTP ${source.status}).`, 'transient');
    }
    const bytes = new Uint8Array(await source.arrayBuffer());

    const initiate = await fetchImpl(
      `${UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json',
          'x-upload-content-length': String(bytes.byteLength),
          'x-upload-content-type': asset.mimeType,
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initiate.ok) {
      throw new PublishError(
        `YouTube upload initiation failed: HTTP ${initiate.status}`,
        initiate.status === 401 || initiate.status === 403 ? 'auth' : 'transient',
        initiate.status,
      );
    }

    const sessionUrl = initiate.headers.get('location');
    if (!sessionUrl) throw new PublishError('YouTube returned no resumable session URL.', 'malformed_response');

    for (let offset = 0; offset < bytes.byteLength; offset += YOUTUBE_CHUNK_BYTES) {
      const end = Math.min(offset + YOUTUBE_CHUNK_BYTES, bytes.byteLength);
      const chunk = bytes.subarray(offset, end);
      const response = await fetchImpl(sessionUrl, {
        method: 'PUT',
        headers: {
          'content-length': String(chunk.byteLength),
          'content-range': `bytes ${offset}-${end - 1}/${bytes.byteLength}`,
        },
        body: chunk,
      });

      // 308 means "keep going". 200/201 means the upload completed.
      if (response.status === 308) continue;
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { id?: string } | null;
        return body?.id ?? null;
      }
      throw new PublishError(
        `YouTube chunk upload failed at byte ${offset}: HTTP ${response.status}`,
        response.status >= 500 ? 'transient' : 'permanent',
        response.status,
      );
    }
    return null;
  }

  private get(path: string, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${API}${path}`,
      { headers: { authorization: `Bearer ${account.tokens.accessToken}` } },
      `YouTube GET ${path}`,
    );
  }
}
