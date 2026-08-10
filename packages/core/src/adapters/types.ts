/**
 * Platform adapters. v1 §7, superseded in specifics by v2 Part A.
 *
 * There is deliberately no `reply()` method on this interface. v1 §13: the
 * system suggests founder replies for manual sending, it never sends them, and
 * that line is enforced in code rather than policy.
 *
 * An AggregatorAdapter would implement this same interface, which is what makes
 * v2 B.1's hybrid strategy a config change rather than a rewrite.
 */

export type PlatformId = 'x' | 'instagram' | 'tiktok' | 'pinterest' | 'youtube' | 'threads';

export type CapabilityState = 'pending_auth' | 'draft_only' | 'live' | 'error' | 'disabled';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  /** Anything the platform returns that a later call needs (e.g. IG user id). */
  meta?: Record<string, unknown>;
}

export interface CapabilityReport {
  state: CapabilityState;
  detail: string;
  supportedFormats: string[];
  /** What the operator must do next, in plain language, for /accounts. */
  nextAction?: string;
}

export interface PlatformConstraints {
  maxChars: number;
  maxHashtags: number;
  supportedFormats: string[];
  aspectRatios: string[];
  video?: { minSeconds: number; maxSeconds: number; maxBytes?: number; codecs?: string[] };
  image?: { maxBytes?: number; formats?: string[] };
  carousel?: { min: number; max: number; sameAspectRatioRequired?: boolean };
  /** v2 I.2 — where the link goes, and why. */
  linkStrategy: 'in_body' | 'first_reply' | 'bio_only' | 'pin_destination' | 'description';
  linkNote: string;
  /**
   * True when public posting is gated behind a manual review (v2 A.1). Every
   * platform except X is, which is the single most important planning fact in
   * the addendum.
   */
  requiresReviewForPublicPosting: boolean;
  /** v2 E.4 — API-published video cannot carry trending commercial audio. */
  supportsTrendingAudioViaApi: boolean;
  /** Rough cost per publish, USD. Only X charges today. */
  costPerPostUsd?: { withoutLink: number; withLink: number };
}

export interface PublishAsset {
  id: string;
  /** Public URL. Meta cURLs the asset at publish time; signed short-lived URLs fail. */
  publicUrl: string;
  mimeType: string;
  kind: 'image' | 'video' | 'audio';
  width?: number;
  height?: number;
  durationSeconds?: number;
  altText?: string | null;
}

export interface PublishItem {
  id: string;
  platform: PlatformId;
  format: 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';
  body: string;
  title?: string | null;
  altText?: string | null;
  hashtags: string[];
  /** UTM-stamped at schedule time. */
  finalLinkUrl?: string | null;
  /** Pinterest requires one; supplied from account config. */
  boardId?: string | null;
  disclosureText?: string | null;
  requiresAiLabel?: boolean;
}

export interface PublishAccount {
  id: string;
  platform: PlatformId;
  handle: string;
  platformUserId?: string | null;
  capabilityState: CapabilityState;
  tokens: TokenSet;
  linkStrategy?: PlatformConstraints['linkStrategy'];
  meta?: Record<string, unknown>;
}

export interface PublishResult {
  mode: 'direct' | 'draft';
  platformPostId?: string;
  permalink?: string;
  /** Deep link shown in the queue for draft mode: "finish in TikTok". */
  manualPublishUrl?: string;
  /** X carries its link in a first reply; that reply is its own post id. */
  linkReplyPostId?: string;
  raw?: unknown;
  /** Set when the response could not be parsed — never retried (build pack §3). */
  malformedResponse?: boolean;
}

export interface MetricSnapshot {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  videoViews?: number;
  watchTimeSeconds?: number;
  profileVisits?: number;
  linkClicks?: number;
  follows?: number;
  raw?: unknown;
  /**
   * v2 A.5 — Pinterest's terms bar caching most API data, so metric rows carry
   * their own purge deadline rather than living forever.
   */
  purgeAfter?: Date;
}

export interface PlatformComment {
  platformCommentId: string;
  authorHandle?: string;
  authorDisplayName?: string;
  body: string;
  postedAt?: Date;
}

export interface PlatformAdapter {
  platform: PlatformId;
  constraints: PlatformConstraints;

  getAuthUrl(state: string, options: OAuthUrlOptions): string;
  exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet>;
  refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet>;
  verifyCapabilities(account: PublishAccount): Promise<CapabilityReport>;

  publish(
    item: PublishItem,
    assets: PublishAsset[],
    account: PublishAccount,
  ): Promise<PublishResult>;

  collectMetrics(
    publication: { platformPostId: string; permalink?: string | null },
    account: PublishAccount,
  ): Promise<MetricSnapshot>;

  /**
   * Read-only. Comments are surfaced in the inbox for a human to answer; there
   * is no method here that sends anything.
   */
  listComments?(
    publication: { platformPostId: string },
    account: PublishAccount,
  ): Promise<PlatformComment[]>;
}

export interface OAuthClientOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

export interface OAuthUrlOptions extends OAuthClientOptions {
  redirectUri: string;
  codeChallenge?: string;
  scopes?: string[];
}

export interface OAuthExchangeOptions extends OAuthClientOptions {
  redirectUri: string;
  codeVerifier?: string;
}

export class PublishError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'rate_limit' | 'malformed_response' | 'transient' | 'permanent',
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

/** Map an HTTP response to the failure taxonomy in build pack §3. */
export function classifyHttpFailure(status: number, body: unknown): PublishError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'transient';
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  if (/token|credential|expired|unauthor/i.test(text)) return 'auth';
  return 'permanent';
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Every adapter routes its HTTP through here so the failure taxonomy, the
 * Retry-After header and the redaction rules are applied in exactly one place.
 */
export async function platformFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  context: string,
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  const body = await readJson(response);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new PublishError(
      `${context} failed: HTTP ${response.status} ${summarise(body)}`,
      classifyHttpFailure(response.status, body),
      response.status,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
      body,
    );
  }
  return body;
}

function summarise(body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return text.slice(0, 300);
}

/** Compose the caption a platform actually receives from the stored fields. */
export function composeCaption(
  item: PublishItem,
  constraints: PlatformConstraints,
): { text: string; linkForReply?: string } {
  const parts: string[] = [item.body.trim()];

  if (item.requiresAiLabel && item.disclosureText) {
    const already =
      item.body.includes(item.disclosureText) || /#ai(voiceover|generated)\b/i.test(item.body);
    if (!already) parts.push(item.disclosureText.trim());
  }

  const tags = item.hashtags.slice(0, constraints.maxHashtags);
  if (tags.length > 0) parts.push(tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '));

  let linkForReply: string | undefined;
  if (item.finalLinkUrl) {
    switch (constraints.linkStrategy) {
      case 'in_body':
        parts.push(item.finalLinkUrl);
        break;
      case 'first_reply':
        // v2 A.2: a post containing a URL costs $0.20 against $0.015, and link
        // posts are algorithmically deprioritised. The link goes in a reply.
        linkForReply = item.finalLinkUrl;
        break;
      case 'description':
        parts.push(item.finalLinkUrl);
        break;
      case 'pin_destination':
      case 'bio_only':
        break;
    }
  }

  let text = parts.filter(Boolean).join('\n\n');
  if (text.length > constraints.maxChars) text = text.slice(0, constraints.maxChars - 1).trimEnd();
  return { text, linkForReply };
}
