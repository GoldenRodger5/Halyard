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
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from './types.js';

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
  maxChars: 5000,
  maxHashtags: 5,
  supportedFormats: ['video'],
  aspectRatios: ['9:16', '16:9'],
  video: { minSeconds: 3, maxSeconds: 60, codecs: ['h264'] },
  linkStrategy: 'description',
  linkNote: 'Description, first line, above the fold.',
  requiresReviewForPublicPosting: true,
  supportsTrendingAudioViaApi: false,
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
      const audited = account.meta?.complianceAuditPassed === true;
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

    const audited = account.meta?.complianceAuditPassed === true;
    const privacyStatus = audited && account.capabilityState === 'live' ? 'public' : 'private';

    // Shorts: vertical 9:16 under 60 seconds, with #Shorts in the title.
    const isShort =
      (asset.durationSeconds ?? 0) <= 60 &&
      (asset.width ?? 0) > 0 &&
      (asset.height ?? 1) > (asset.width ?? 0);

    const baseTitle = (item.title ?? item.body.split('\n')[0] ?? 'Untitled').slice(0, 90);
    const title = isShort && !/#shorts/i.test(baseTitle) ? `${baseTitle} #Shorts` : baseTitle;

    const descriptionParts = [
      item.finalLinkUrl ?? '',
      item.body,
      item.requiresAiLabel && item.disclosureText ? item.disclosureText : '',
    ].filter(Boolean);

    const metadata = {
      snippet: {
        title,
        description: descriptionParts.join('\n\n').slice(0, this.constraints.maxChars),
        tags: item.hashtags.slice(0, this.constraints.maxHashtags),
        categoryId: '26', // Howto & Style
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
        // v2 Part C / EU AI Act Article 50: declare synthetic content natively
        // where the platform offers a toggle.
        ...(item.requiresAiLabel ? { containsSyntheticMedia: true } : {}),
      },
    };

    const videoId = await this.resumableUpload(asset, metadata, account);
    if (!videoId) return { mode: 'direct', malformedResponse: true };

    return {
      mode: privacyStatus === 'public' ? 'direct' : 'draft',
      platformPostId: videoId,
      permalink: `https://www.youtube.com/watch?v=${videoId}`,
      manualPublishUrl:
        privacyStatus === 'private'
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
