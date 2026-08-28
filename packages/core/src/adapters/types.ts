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

export type PlatformId =
  | 'x'
  | 'instagram'
  | 'tiktok'
  | 'pinterest'
  | 'youtube'
  | 'threads'
  | 'bluesky';

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
  /** What the platform's API can actually receive short of a public post. §156. */
  delivery: DeliveryCapability;
}

/**
 * What a platform's API can receive that is not a public post.
 *
 * §156. Three things get called "draft" and they are not the same, so they are
 * three fields rather than one enum:
 *
 * - **`nativeDraft`** — the platform holds an object the *creator* sees in
 *   their own app and finishes there. TikTok's inbox upload is the only one
 *   among the platforms here. Halyard cannot publish it afterwards; the person
 *   does, inside TikTok.
 * - **`privateUpload`** — the content really exists on the platform, private,
 *   and **Halyard can still publish it** over the API. YouTube's
 *   `privacyStatus: private` is this. Calling it a draft would promise the
 *   creator a draft in their app, which is not what it is.
 * - **`apiScheduling`** — the platform itself holds a publish time. YouTube's
 *   `publishAt` is the only one here, and it requires the video to be private
 *   and never previously published.
 *
 * A two-step media container — Instagram, Threads — is **none of these**. It is
 * a transient step inside publishing: the creator never sees it, it expires
 * (24 hours on Instagram), and it exists only to be published seconds later.
 * Recording it as an unpublished upload would invent a capability.
 *
 * Every value here is a statement about the **API**, taken from the platform's
 * current official documentation and cited in `docs/PLATFORM_COVERAGE.md`. A
 * platform whose web UI offers drafts but whose API does not is `false`.
 */
export interface DeliveryCapability {
  nativeDraft: boolean;
  privateUpload: boolean;
  apiScheduling: boolean;
  /**
   * The creator must open the platform and finish the post themselves.
   * Only meaningful with `nativeDraft`; Halyard has no way to complete it.
   */
  requiresCreatorCompletion: boolean;
  /** One line an operator can act on, and the reason the flags above are what they are. */
  note: string;
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
  /**
   * The variant within the format, as chosen at draft time. §199.
   *
   * `video` is the same word for a TikTok, a Reel, a YouTube Short and a
   * twelve-minute YouTube upload, and those are not the same job — different
   * lengths, different titles, different descriptions, different feeds. The
   * subtype is what tells an adapter which one it is being asked for; without
   * it the only signal is the shape of the file, which cannot express intent.
   *
   * Free text on the row, so adapters narrow it themselves and treat anything
   * unrecognised as absent rather than guessing.
   */
  formatSubtype?: string | null;
  body: string;
  title?: string | null;
  altText?: string | null;
  hashtags: string[];
  /** Halyard's content category, where a platform maps it to one of its own. */
  category?: string | null;
  /** BCP-47, when known. YouTube uses it for `snippet.defaultLanguage`. */
  language?: string | null;
  /**
   * When the item is due, for platforms that schedule server-side.
   *
   * Halyard's own scheduler is what normally fires a publish, so this is only
   * meaningful where the *platform* can hold a post and release it later —
   * YouTube's `status.publishAt` today. Absent means publish on arrival.
   */
  scheduledAt?: Date | null;
  /** UTM-stamped at schedule time. */
  finalLinkUrl?: string | null;
  /** Pinterest requires one; supplied from account config. */
  boardId?: string | null;
  disclosureText?: string | null;
  requiresAiLabel?: boolean;
  /**
   * The TikTok Direct Post choices a human made, when the destination is TikTok.
   *
   * §179. Carried on the item rather than derived at publish time because TikTok
   * requires them to be *chosen*, and a value computed by the publisher is by
   * definition not a choice. Absent means the panel was never completed, and the
   * adapter refuses rather than supplying a default.
   */
  tiktokOptions?: import('../tiktok/directPost.js').TikTokPostOptions | null;
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
  /**
   * What actually happened at the platform. §156.
   *
   * `draft` is a *native draft* the creator finishes in their own app.
   * `private` is real content the platform holds unpublished, which Halyard
   * can still publish. YouTube reported its private uploads as `draft`, which
   * told the operator to go and finish something that needed no finishing.
   * Neither is `published`, and neither moves Halyard's own approval state.
   */
  mode: 'direct' | 'draft' | 'private';
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

/**
 * Who a freshly authorised token actually belongs to.
 *
 * Connecting the wrong account — because a browser was already signed in as
 * someone else — is the most common failure in this flow, and it is invisible
 * until the first post lands on the wrong feed. So the identity is fetched and
 * shown before any token is written to the accounts table.
 */
export interface PlatformIdentity {
  platformUserId: string;
  /** Without the leading @. */
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
  /** Anything else worth seeing on the confirmation screen. */
  detail?: string;
  /** More than one identity is reachable with this token (Meta pages, YouTube brand channels). */
  alternatives?: Array<{ platformUserId: string; handle: string; displayName?: string; detail?: string }>;
}

export interface PlatformAdapter {
  platform: PlatformId;
  constraints: PlatformConstraints;

  getAuthUrl(state: string, options: OAuthUrlOptions): string;
  exchangeCode(code: string, options: OAuthExchangeOptions): Promise<TokenSet>;
  refresh(tokens: TokenSet, options: OAuthClientOptions): Promise<TokenSet>;
  verifyCapabilities(account: PublishAccount): Promise<CapabilityReport>;

  /** Called between the token exchange and the token being saved. */
  fetchIdentity(account: PublishAccount): Promise<PlatformIdentity>;

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
   * What this creator is currently allowed to post, where the platform says so.
   *
   * §179. TikTok only. Its Content Posting API requires the publishing UI to be
   * built from a live `creator_info/query` response — available privacy levels,
   * whether comments, Duet or Stitch are disabled on the account, the maximum
   * video duration — rather than from anything Halyard remembers. Optional
   * because no other platform exposes an equivalent, and inventing one for them
   * would mean inventing the answer.
   */
  creatorInfo?(account: PublishAccount): Promise<unknown>;

  /**
   * Where an accepted publish request actually got to.
   *
   * §179. TikTok again: `publish()` returns a `publish_id` the moment the request
   * is accepted, and the post is downloaded, transcoded and published
   * afterwards. Recording that receipt as a publication would mark posts live
   * that never appeared.
   */
  fetchStatus?(publishId: string, account: PublishAccount): Promise<string>;

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
