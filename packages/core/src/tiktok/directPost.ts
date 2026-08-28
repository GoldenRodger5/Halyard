/**
 * TikTok Direct Post: what the creator chose, and whether it may be sent.
 *
 * §179. TikTok's Content Posting API rules are mostly *UX* rules, and they are
 * the ones app review actually checks. An integration can call the right
 * endpoint with the right token and still be rejected because the privacy level
 * was defaulted rather than chosen, or because a Duet toggle was on for a
 * creator who has Duet disabled.
 *
 * Halyard's adapter previously hard-coded `privacy_level: 'PUBLIC_TO_EVERYONE'`
 * with all three interaction toggles false. That is a silent default on the one
 * decision TikTok requires a human to make, and it would have failed review even
 * though the request itself was well formed.
 *
 * So the choices are modelled as data, captured in the UI, validated here, and
 * refused at the adapter when absent. This module is pure: no I/O, no dates it
 * did not receive, so every rule below is directly testable.
 *
 * Rules are drawn from TikTok's Content Posting API documentation for Direct
 * Post and its UX requirements for unaudited and audited clients.
 */

/** The subset of `/v2/post/publish/creator_info/query/` that drives the UI. */
export interface TikTokCreatorInfo {
  creatorNickname: string;
  creatorUsername?: string | null;
  creatorAvatarUrl?: string | null;
  /** Privacy levels this creator may actually choose. Never assume the full set. */
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

/** Exactly what a human chose on the TikTok panel, plus the consent they gave. */
export interface TikTokPostOptions {
  /** One of `creatorInfo.privacyLevelOptions`. No default is ever supplied. */
  privacyLevel: string | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** The master commercial-content disclosure switch. Off unless turned on. */
  commercialContent: boolean;
  /** "Your own brand" — promotes the creator's own business. */
  brandOrganic: boolean;
  /** "Branded content" — a paid partnership with someone else. */
  brandedContent: boolean;
  /** ISO timestamp of the music-usage confirmation. Null until confirmed. */
  musicConfirmedAt: string | null;
  /** ISO timestamp of the creator_info this panel was rendered from. */
  creatorInfoFetchedAt: string | null;
}

/** The state a fresh panel opens in: nothing chosen, nothing consented. */
export function emptyTikTokOptions(): TikTokPostOptions {
  return {
    /*
     * `null`, not 'PUBLIC_TO_EVERYONE'. TikTok requires the creator to make this
     * choice; pre-selecting the most public option is the specific thing the
     * guidance calls out, and it is also the least safe possible default.
     */
    privacyLevel: null,
    allowComment: false,
    allowDuet: false,
    allowStitch: false,
    commercialContent: false,
    brandOrganic: false,
    brandedContent: false,
    musicConfirmedAt: null,
    creatorInfoFetchedAt: null,
  };
}

export interface TikTokValidationProblem {
  field: keyof TikTokPostOptions | 'creatorInfo' | 'video';
  /** Shown to the operator. Says what to do, not what is wrong internally. */
  message: string;
}

/**
 * Every reason this post may not be sent yet.
 *
 * Returns all of them rather than the first, because a panel that reveals one
 * problem at a time makes the operator submit repeatedly to discover the rest.
 */
export function validateTikTokPost(input: {
  options: TikTokPostOptions;
  creatorInfo: TikTokCreatorInfo | null;
  /** Duration of the video being posted, when known. */
  videoDurationSec?: number | null;
}): TikTokValidationProblem[] {
  const { options, creatorInfo, videoDurationSec } = input;
  const problems: TikTokValidationProblem[] = [];

  if (!creatorInfo) {
    /*
     * Not a validation failure so much as a refusal to guess. TikTok requires the
     * panel to be built from a *current* creator_info, so with none there is no
     * legitimate set of choices to check against.
     */
    return [
      {
        field: 'creatorInfo',
        message:
          'TikTok has not said what this account may post yet. Refresh the creator information before posting.',
      },
    ];
  }

  if (!options.privacyLevel) {
    problems.push({ field: 'privacyLevel', message: 'Choose who can see this post.' });
  } else if (!creatorInfo.privacyLevelOptions.includes(options.privacyLevel)) {
    /*
     * The options are per creator and change — a private account cannot post
     * publicly. Sending one TikTok did not offer is rejected at the API, so it is
     * caught here where the message can be useful.
     */
    problems.push({
      field: 'privacyLevel',
      message: `TikTok is not currently offering "${options.privacyLevel}" for this account. Choose one of the available options.`,
    });
  }

  /* A creator-level block is not something a Halyard toggle may override. */
  if (options.allowComment && creatorInfo.commentDisabled) {
    problems.push({ field: 'allowComment', message: 'This account has comments turned off on TikTok.' });
  }
  if (options.allowDuet && creatorInfo.duetDisabled) {
    problems.push({ field: 'allowDuet', message: 'This account has Duet turned off on TikTok.' });
  }
  if (options.allowStitch && creatorInfo.stitchDisabled) {
    problems.push({ field: 'allowStitch', message: 'This account has Stitch turned off on TikTok.' });
  }

  if (options.commercialContent && !options.brandOrganic && !options.brandedContent) {
    problems.push({
      field: 'commercialContent',
      message:
        'Say what kind of commercial content this is: promoting your own brand, a paid partnership, or both.',
    });
  }

  /*
   * TikTok forbids branded content on a private post — a paid partnership nobody
   * can see is a disclosure that does not disclose.
   */
  if (options.brandedContent && options.privacyLevel === 'SELF_ONLY') {
    problems.push({
      field: 'privacyLevel',
      message: 'Branded content cannot be posted privately. Choose a visibility other than "Only me".',
    });
  }

  if (!options.musicConfirmedAt) {
    problems.push({
      field: 'musicConfirmedAt',
      message: "Confirm you agree to TikTok's Music Usage Confirmation before posting.",
    });
  }

  if (
    typeof videoDurationSec === 'number' &&
    videoDurationSec > creatorInfo.maxVideoPostDurationSec
  ) {
    problems.push({
      field: 'video',
      message: `This video is ${Math.round(videoDurationSec)}s. TikTok allows up to ${creatorInfo.maxVideoPostDurationSec}s for this account.`,
    });
  }

  return problems;
}

export function canPostToTikTok(input: Parameters<typeof validateTikTokPost>[0]): boolean {
  return validateTikTokPost(input).length === 0;
}

/**
 * `post_info` for `/v2/post/publish/video/init/`.
 *
 * Halyard's toggles read "allow", TikTok's read "disable". Translating in one
 * place keeps the inversion from being re-derived — and getting it backwards
 * would silently publish with the opposite of what the creator chose.
 */
export function toTikTokPostInfo(
  options: TikTokPostOptions,
  title: string,
): Record<string, unknown> {
  if (!options.privacyLevel) {
    throw new Error('TikTok post_info requires a privacy level chosen by the creator.');
  }
  return {
    title,
    privacy_level: options.privacyLevel,
    disable_comment: !options.allowComment,
    disable_duet: !options.allowDuet,
    disable_stitch: !options.allowStitch,
    /*
     * Both toggles are sent only when the creator declared commercial content;
     * TikTok treats them as the disclosure, and sending them otherwise would
     * label an ordinary post as an ad.
     */
    brand_content_toggle: options.commercialContent ? options.brandedContent : false,
    brand_organic_toggle: options.commercialContent ? options.brandOrganic : false,
  };
}

/** Parse `/v2/post/publish/creator_info/query/` into the shape the UI needs. */
export function parseCreatorInfo(response: unknown): TikTokCreatorInfo | null {
  const data = (response as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') return null;

  const nickname = data.creator_nickname;
  if (typeof nickname !== 'string') return null;

  const privacy = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.filter((p): p is string => typeof p === 'string')
    : [];

  return {
    creatorNickname: nickname,
    creatorUsername: typeof data.creator_username === 'string' ? data.creator_username : null,
    creatorAvatarUrl: typeof data.creator_avatar_url === 'string' ? data.creator_avatar_url : null,
    privacyLevelOptions: privacy,
    /* Absent means "not disabled"; only an explicit `true` blocks a control. */
    commentDisabled: data.comment_disabled === true,
    duetDisabled: data.duet_disabled === true,
    stitchDisabled: data.stitch_disabled === true,
    maxVideoPostDurationSec:
      typeof data.max_video_post_duration_sec === 'number' ? data.max_video_post_duration_sec : 0,
  };
}

/**
 * Where a publish attempt actually stands, from `/v2/post/publish/status/fetch/`.
 *
 * §179. Accepting an init response is not publishing. TikTok returns a
 * `publish_id` immediately and then downloads, transcodes and posts
 * asynchronously, so a post recorded as published at init time is a post that
 * might never exist. `failed_reason` decides whether a retry can help.
 */
export type TikTokPublishState =
  | 'initialized'
  | 'processing'
  | 'published'
  | 'failed_retryable'
  | 'failed_permanent';

const PERMANENT_FAILURES = new Set([
  'picture_size_check_failed',
  'video_pull_failed',
  'photo_pull_failed',
  'auth_removed',
  'privacy_level_check_failed',
  'file_format_check_failed',
  'duration_check_failed',
  'frame_rate_check_failed',
  'picture_number_check_failed',
  'video_ratio_check_failed',
  'spam_risk_too_many_posts',
  'spam_risk_user_banned_from_posting',
  'spam_risk_text',
  'spam_risk',
  'unaudited_client_can_only_post_to_private_accounts',
]);

export function interpretPublishStatus(input: {
  status: string;
  failReason?: string | null;
}): TikTokPublishState {
  const status = (input.status ?? '').toUpperCase();
  const reason = (input.failReason ?? '').toLowerCase();

  if (status === 'PUBLISH_COMPLETE') return 'published';
  if (status === 'FAILED') {
    /*
     * Unknown reasons are treated as retryable on purpose: a transient failure
     * mis-classified as permanent loses a post silently, while a permanent one
     * mis-classified as retryable costs a bounded number of retries and then
     * surfaces. The cheaper mistake is the recoverable one.
     */
    return PERMANENT_FAILURES.has(reason) ? 'failed_permanent' : 'failed_retryable';
  }
  if (status === 'PROCESSING_UPLOAD' || status === 'PROCESSING_DOWNLOAD') return 'processing';
  return 'initialized';
}

/**
 * The URL TikTok will be asked to pull the video from.
 *
 * §179. TikTok fetches the file itself and will only fetch from a URL prefix the
 * developer verified — for Halyard, the production origin. It follows no
 * redirects and sends no credentials, so the only URL that works is one served
 * directly from that origin: `/media/<assetId>`.
 *
 * Returns null rather than a guess when there is no usable base. Handing TikTok
 * a Supabase URL, a localhost URL or a relative path all fail, and they fail
 * *at TikTok*, minutes later, as an opaque `video_pull_failed`.
 */
export function tiktokMediaUrl(baseUrl: string | null | undefined, assetId: string): string | null {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return null;
  if (!/^https:\/\//i.test(base)) return null;
  if (/localhost|127\.0\.0\.1|\[::1\]|\.local(?::|\/|$)/i.test(base)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) return null;
  return `${base}/media/${assetId}`;
}

/**
 * Whether a URL is one TikTok can actually fetch, given the verified prefix.
 *
 * Used as a refusal at publish time. The failure this prevents is the quiet one:
 * TikTok accepts the request, returns a `publish_id`, and only fails later when
 * its fetcher cannot reach the file — by which point the operator has been told
 * the post was sent.
 */
export function isTikTokFetchableUrl(url: string, verifiedPrefix: string | null | undefined): boolean {
  const prefix = (verifiedPrefix ?? '').trim().replace(/\/+$/, '');
  if (!prefix) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return url.startsWith(`${prefix}/`);
  } catch {
    return false;
  }
}
