/**
 * Which format a post should be, for the account it is going to.
 *
 * ## The bug this replaces
 *
 * Generation hardcoded `platform === 'pinterest' ? 'pin' : 'image'`.
 *
 * TikTok's adapter declares `supportedFormats: ['video']`. YouTube's declares
 * `['video']`. Both were therefore issued image drafts, for every post, since
 * generation was written — a format neither platform can accept. It has never
 * surfaced because nothing has published yet, so the first symptom would have
 * been the launch batch failing at the publish step on two platforms at once.
 *
 * The account's capabilities are already recorded, per platform, by the
 * adapter that knows them. Reading them is strictly better than a conditional
 * that has to be remembered every time a platform is added.
 */

export type ContentFormat = 'text' | 'image' | 'carousel' | 'video' | 'story' | 'pin';

/**
 * Preference order when a platform accepts several formats.
 *
 * Video first for platforms that take it, because a moving post outperforms a
 * static one nearly everywhere — but only where the platform treats it as a
 * first-class citizen rather than an option. Instagram and Threads are ordered
 * to image deliberately: their feed posts are still image-led, and a video
 * there costs a render and a voiceover for no measured gain.
 *
 * Pinterest takes `pin`, which is its own thing and not an image.
 */
const PREFERENCE: Record<string, ContentFormat[]> = {
  tiktok: ['video'],
  youtube: ['video'],
  pinterest: ['pin', 'image'],
  instagram: ['image', 'carousel', 'video'],
  threads: ['text', 'image', 'video'],
  x: ['text', 'image', 'video'],
  bluesky: ['text', 'image'],
  facebook: ['image', 'text', 'video'],
};

/** A platform with no declared preference falls back to this order. */
const DEFAULT_PREFERENCE: ContentFormat[] = ['image', 'text', 'video', 'pin', 'carousel'];

export class NoUsableFormatError extends Error {
  constructor(platform: string, supported: string[]) {
    super(
      supported.length === 0
        ? `${platform} reports no supported formats, so there is nothing safe to generate. ` +
            'Reconnect the account so its capabilities are known.'
        : `${platform} supports [${supported.join(', ')}], none of which this system can produce.`,
    );
    this.name = 'NoUsableFormatError';
  }
}

/**
 * Pick the format to generate for an account.
 *
 * Throws rather than defaulting when nothing matches. Defaulting to `image`
 * here is exactly how TikTok ended up with image drafts: a fallback that is
 * always *a* valid value is indistinguishable from a correct one until
 * something tries to publish it.
 */
export function chooseFormat(platform: string, supportedFormats: string[]): ContentFormat {
  const supported = new Set(supportedFormats);
  const order = PREFERENCE[platform] ?? DEFAULT_PREFERENCE;

  for (const candidate of order) {
    if (supported.has(candidate)) return candidate;
  }

  // The platform accepts something, but nothing this system knows how to make.
  throw new NoUsableFormatError(platform, supportedFormats);
}

/** Formats that need a rendered video, and therefore a voiceover. */
export function needsVideo(format: ContentFormat): boolean {
  return format === 'video';
}
