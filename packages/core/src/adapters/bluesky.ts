/**
 * Bluesky. Milestone 31, Part E.
 *
 * Worth adding for one reason: Bluesky has no native scheduling at all, so a
 * third-party tool is the only option, and competition there is thin.
 *
 * It is also the only platform in the set with no review gate and no per-post
 * cost — an app password and the AT Protocol, nothing else. Facets (links and
 * mentions) have to be computed by byte offset, which is the one genuinely
 * fiddly part and the reason a naive integration posts unclickable links.
 */
import {
  PublishError,
  composeCaption,
  platformFetch,
  type CapabilityReport,
  type MetricSnapshot,
  type OAuthClientOptions,
  type OAuthExchangeOptions,
  type PlatformAdapter,
  type PlatformComment,
  type PlatformConstraints,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
  type PublishResult,
  type TokenSet,
} from './types.js';

const DEFAULT_PDS = 'https://bsky.social';

export const BLUESKY_CONSTRAINTS: PlatformConstraints = {
  maxChars: 300,
  maxHashtags: 3,
  supportedFormats: ['text', 'image'],
  aspectRatios: ['1:1', '4:5', '16:9'],
  image: { maxBytes: 1_000_000, formats: ['image/jpeg', 'image/png'] },
  linkStrategy: 'in_body',
  linkNote: 'Links are clickable inline, as long as the facet byte offsets are right.',
  requiresReviewForPublicPosting: false,
  supportsTrendingAudioViaApi: false,
};

/**
 * Bluesky counts *graphemes*, and facet offsets are in UTF-8 *bytes*. Getting
 * either wrong is how a post is rejected or a link renders as plain text.
 */
export function graphemeLength(text: string): number {
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
}

export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string; tag?: string }>;
}

/** Byte offsets for links and hashtags, computed on the encoded string. */
export function detectFacets(text: string): Facet[] {
  const encoder = new TextEncoder();
  const facets: Facet[] = [];

  const byteOffset = (index: number): number => encoder.encode(text.slice(0, index)).length;

  for (const match of text.matchAll(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/g)) {
    const start = match.index ?? 0;
    facets.push({
      index: { byteStart: byteOffset(start), byteEnd: byteOffset(start + match[0].length) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }],
    });
  }

  for (const match of text.matchAll(/(?:^|\s)(#[^\d\s][^\s]*)/g)) {
    const tag = match[1]!;
    const start = (match.index ?? 0) + match[0].indexOf(tag);
    facets.push({
      index: { byteStart: byteOffset(start), byteEnd: byteOffset(start + tag.length) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.slice(1) }],
    });
  }

  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

export class BlueskyAdapter implements PlatformAdapter {
  readonly platform = 'bluesky' as unknown as PlatformAdapter['platform'];
  readonly constraints = BLUESKY_CONSTRAINTS;

  /**
   * Bluesky has no OAuth for this use case: the operator creates an app password
   * in settings and pastes it. Saying so is more useful than a redirect that
   * goes nowhere.
   */
  getAuthUrl(): string {
    return 'https://bsky.app/settings/app-passwords';
  }

  /** `code` here is `handle:app-password`, from the connect form. */
  async exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet> {
    const [identifier, ...rest] = code.split(':');
    const password = rest.join(':');
    if (!identifier || !password) {
      throw new PublishError(
        'Expected handle:app-password. Create an app password at bsky.app/settings/app-passwords.',
        'auth',
      );
    }

    const session = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${DEFAULT_PDS}/xrpc/com.atproto.server.createSession`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      },
      'Bluesky session',
    )) as { accessJwt: string; refreshJwt: string; did: string; handle: string };

    return {
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      // Access JWTs are short-lived; the refresh job keeps them alive.
      expiresAt: new Date(Date.now() + 90 * 60_000),
      scopes: [],
      meta: { did: session.did, handle: session.handle },
    };
  }

  async refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet> {
    if (!tokens.refreshToken) throw new PublishError('No Bluesky refresh token.', 'auth');

    const session = (await platformFetch(
      options.fetchImpl ?? fetch,
      `${DEFAULT_PDS}/xrpc/com.atproto.server.refreshSession`,
      { method: 'POST', headers: { authorization: `Bearer ${tokens.refreshToken}` } },
      'Bluesky refresh',
    )) as { accessJwt: string; refreshJwt: string; did: string };

    return {
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      expiresAt: new Date(Date.now() + 90 * 60_000),
      meta: tokens.meta,
    };
  }

  async verifyCapabilities(account: PublishAccount): Promise<CapabilityReport> {
    try {
      const did = account.platformUserId ?? (account.meta?.did as string | undefined);
      if (!did) throw new PublishError('No DID stored for this account.', 'auth');

      const profile = (await this.get(`app.bsky.actor.getProfile?actor=${did}`, account)) as {
        handle?: string;
        followersCount?: number;
      };

      return {
        state: 'live',
        detail: `Live as @${profile.handle ?? account.handle}. No review gate and no per-post cost, and Bluesky has no native scheduling, so this is the only way to schedule at all.`,
        supportedFormats: this.constraints.supportedFormats,
      };
    } catch (err) {
      return {
        state: (err as PublishError).kind === 'auth' ? 'error' : 'pending_auth',
        detail: (err as Error).message,
        supportedFormats: [],
        nextAction: 'Create an app password at bsky.app/settings/app-passwords and reconnect.',
      };
    }
  }

  async publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult> {
    const did = account.platformUserId ?? (account.meta?.did as string | undefined);
    if (!did) throw new PublishError('No DID stored for this account.', 'permanent');

    const { text } = composeCaption(item, this.constraints);
    if (graphemeLength(text) > this.constraints.maxChars) {
      throw new PublishError(
        `${graphemeLength(text)} graphemes; Bluesky counts graphemes and caps at ${this.constraints.maxChars}.`,
        'permanent',
      );
    }

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      facets: detectFacets(text),
      createdAt: new Date().toISOString(),
      langs: ['en'],
    };

    const images = assets.filter((a) => a.kind === 'image').slice(0, 4);
    if (images.length > 0) {
      const blobs = [];
      for (const asset of images) {
        blobs.push({
          alt: asset.altText ?? item.altText ?? '',
          image: await this.uploadBlob(asset, account),
        });
      }
      record.embed = { $type: 'app.bsky.embed.images', images: blobs };
    }

    const created = (await this.post(
      'com.atproto.repo.createRecord',
      { repo: did, collection: 'app.bsky.feed.post', record },
      account,
    )) as { uri?: string; cid?: string };

    if (!created.uri) return { mode: 'direct', malformedResponse: true, raw: created };

    const rkey = created.uri.split('/').pop();
    return {
      mode: 'direct',
      platformPostId: created.uri,
      permalink: `https://bsky.app/profile/${account.handle.replace(/^@/, '')}/post/${rkey}`,
      raw: created,
    };
  }

  async collectMetrics(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<MetricSnapshot> {
    const response = (await this.get(
      `app.bsky.feed.getPosts?uris=${encodeURIComponent(publication.platformPostId)}`,
      account,
    )) as {
      posts?: Array<{ likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }>;
    };

    const post = response.posts?.[0] ?? {};
    return {
      likes: post.likeCount,
      shares: (post.repostCount ?? 0) + (post.quoteCount ?? 0) || undefined,
      comments: post.replyCount,
      raw: response,
    };
  }

  async listComments(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<PlatformComment[]> {
    const response = (await this.get(
      `app.bsky.feed.getPostThread?uri=${encodeURIComponent(publication.platformPostId)}&depth=1`,
      account,
    )) as {
      thread?: {
        replies?: Array<{
          post?: {
            uri: string;
            author?: { handle?: string; displayName?: string };
            record?: { text?: string; createdAt?: string };
          };
        }>;
      };
    };

    return (response.thread?.replies ?? [])
      .filter((reply) => reply.post)
      .map((reply) => ({
        platformCommentId: reply.post!.uri,
        authorHandle: reply.post!.author?.handle ? `@${reply.post!.author.handle}` : undefined,
        authorDisplayName: reply.post!.author?.displayName,
        body: reply.post!.record?.text ?? '',
        postedAt: reply.post!.record?.createdAt ? new Date(reply.post!.record.createdAt) : undefined,
      }));
  }

  private async uploadBlob(asset: PublishAsset, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    const source = await fetchImpl(asset.publicUrl);
    if (!source.ok) {
      throw new PublishError(`Could not read asset ${asset.id} (HTTP ${source.status}).`, 'transient');
    }

    const bytes = new Uint8Array(await source.arrayBuffer());
    if (bytes.byteLength > (this.constraints.image?.maxBytes ?? 1_000_000)) {
      throw new PublishError(
        `${asset.id} is ${(bytes.byteLength / 1024).toFixed(0)}KB; Bluesky caps blobs at 1MB.`,
        'permanent',
      );
    }

    const uploaded = (await platformFetch(
      fetchImpl,
      `${DEFAULT_PDS}/xrpc/com.atproto.repo.uploadBlob`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': asset.mimeType,
        },
        body: bytes,
      },
      'Bluesky blob upload',
    )) as { blob?: unknown };

    if (!uploaded.blob) throw new PublishError('Bluesky returned no blob ref.', 'malformed_response');
    return uploaded.blob;
  }

  private get(path: string, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${DEFAULT_PDS}/xrpc/${path}`,
      { headers: { authorization: `Bearer ${account.tokens.accessToken}` } },
      `Bluesky ${path}`,
    );
  }

  private post(method: string, body: unknown, account: PublishAccount): Promise<unknown> {
    const fetchImpl = (account.meta?.fetchImpl as typeof fetch | undefined) ?? fetch;
    return platformFetch(
      fetchImpl,
      `${DEFAULT_PDS}/xrpc/${method}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.tokens.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      `Bluesky ${method}`,
    );
  }
}
