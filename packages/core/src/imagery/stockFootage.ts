/**
 * §478. Real motion, from somewhere real.
 *
 * ## The gap this fills
 *
 * Every video this system has produced is a stack of stills with a slow push.
 * The architecture has expected footage from the start — `real_footage` is a
 * media source, `footage` is a screenplay ground, `hasFootage` gates it — and
 * nothing has ever supplied any, because the only source anyone imagined was
 * the operator filming something. `hasFootage` has been `false` on every piece
 * ever staged.
 *
 * ## Why stock, and not generated video
 *
 * Two ways to put motion under a line. Generate it — animate our own still with
 * an image-to-video model — or license a clip somebody filmed. The generated
 * route keeps the subject exact and **looks generated**, which is the one
 * quality the operator has asked this system never to have. The licensed route
 * is what a real food account actually does: a clip of flour being sifted under
 * a card is b-roll, and b-roll is the native grammar of the medium.
 *
 * Pexels, because its licence permits commercial use without attribution, its
 * library is large enough that §444's continuity rotation has something to
 * rotate through, and its API returns portrait clips by orientation — which is
 * the only orientation short video needs.
 *
 * ## What it may and may not carry
 *
 * A stock clip is **illustration**. It is somebody else's kitchen, and it can
 * no more evidence a claim about the product than a generated still can. So it
 * carries `licensed` provenance and `canEvidence: false`, and the media
 * director's rule that a `demo` or `proof` beat may only carry evidence applies
 * to it exactly as it applies to a generated photograph.
 *
 * ## When it is absent
 *
 * No key, no footage, said plainly — the same shape as every other integration
 * here. The pipeline falls back to photographs, which is what it did before,
 * and `hasFootage` stays honestly false rather than becoming a promise the
 * render cannot keep.
 */

export interface StockClip {
  /** Pexels' own id, for attribution and for never choosing it twice. */
  id: string;
  /** A direct, downloadable file URL. */
  url: string;
  width: number;
  height: number;
  durationSeconds: number;
  /** Who filmed it. Not required by the licence; kept because it is true. */
  photographer: string;
  /** The page a person could open to see the licence for themselves. */
  pageUrl: string;
}

export interface StockFootageClient {
  /**
   * Portrait clips for a subject, best first.
   *
   * `avoid` is clip ids already used on this account, so a piece does not carry
   * the same sifting shot as the one before it — the same reason `chooseShot`
   * takes a recency list.
   */
  search(
    subject: string,
    options?: {
      want?: number;
      avoid?: readonly string[];
      /**
       * The beat's length. A clip at least this long plays through without
       * looping; shorter ones are kept but ranked after, since a loop seam in
       * a six-second beat is visible and a longer clip simply is not.
       */
      minSeconds?: number;
    },
  ): Promise<StockClip[]>;
}

const PEXELS_API = 'https://api.pexels.com/videos/search';

/**
 * Short video wants a clip that fits under one beat and is genuinely portrait.
 *
 * Under three seconds cuts off before a line is read; over twenty is a
 * download nobody needs, since a beat holds six. And a "portrait" result from a
 * search API is sometimes square or nearly so, which letterboxes on a phone.
 */
const MIN_SECONDS = 3;
const MAX_SECONDS = 20;
const MIN_ASPECT = 1.4;

interface PexelsVideoFile {
  id: number;
  quality: string | null;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
}

export class PexelsFootageClient implements StockFootageClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey = process.env.PEXELS_API_KEY, fetchImpl: typeof fetch = fetch) {
    const key = apiKey?.trim();
    if (!key) {
      throw new Error(
        'PEXELS_API_KEY is not set, so no footage can be found. A free key at pexels.com/api enables it.',
      );
    }
    this.apiKey = key;
    this.fetchImpl = fetchImpl;
  }

  async search(
    subject: string,
    options: { want?: number; avoid?: readonly string[]; minSeconds?: number } = {},
  ): Promise<StockClip[]> {
    const want = options.want ?? 3;
    const avoid = new Set(options.avoid ?? []);
    const params = new URLSearchParams({
      query: subject,
      orientation: 'portrait',
      size: 'medium',
      per_page: String(Math.min(30, want * 5)),
    });
    const response = await this.fetchImpl(`${PEXELS_API}?${params}`, {
      headers: { authorization: this.apiKey },
    });
    if (!response.ok) {
      throw new Error(`Pexels search failed: HTTP ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { videos?: PexelsVideo[] };

    const clips: StockClip[] = [];
    for (const video of body.videos ?? []) {
      if (avoid.has(String(video.id))) continue;
      if (video.duration < MIN_SECONDS || video.duration > MAX_SECONDS) continue;
      if (video.height / Math.max(1, video.width) < MIN_ASPECT) continue;

      /*
       * The file to download: an mp4, portrait, the largest that is still a
       * sensible size. Pexels lists several renditions per clip and the biggest
       * is often 4K, which is a hundred megabytes for a six-second beat.
       */
      /*
       * The file to download: an mp4, portrait, the largest that is still a
       * sensible size. Pexels lists several renditions per clip and the
       * biggest is often 4K, which is a hundred megabytes for a six-second
       * beat.
       *
       * §504 considered taking a *smaller* rendition to speed the render up,
       * and rejected it: the frame is 1080 wide, Pexels' next size down is
       * 540, and a 2× upscale is visibly soft behind type. The render was
       * timing out because its asset timeout was too short for decoding video
       * at all, which is where that was fixed. Picture quality is not the
       * thing to trade for it.
       */
      const file = (video.video_files ?? [])
        .filter((f) => f.file_type === 'video/mp4' && f.width && f.height && f.height >= f.width)
        .filter((f) => (f.height ?? 0) <= 1920)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
      if (!file) continue;

      clips.push({
        id: String(video.id),
        url: file.link,
        width: file.width ?? video.width,
        height: file.height ?? video.height,
        durationSeconds: video.duration,
        photographer: video.user?.name ?? 'Unknown',
        pageUrl: video.url,
      });
    }

    /* Long enough first, Pexels' own relevance order within each half. */
    const min = options.minSeconds ?? 0;
    const fits = clips.filter((c) => c.durationSeconds >= min);
    const short = clips.filter((c) => c.durationSeconds < min);
    return [...fits, ...short].slice(0, want);
  }
}

/**
 * A client, or an honest null.
 *
 * Null is a real state and callers must treat it as "no footage exists", never
 * as an error to retry — an account without a key is not broken, it makes
 * pieces out of photographs.
 */
export function createStockFootageClient(): StockFootageClient | null {
  try {
    return new PexelsFootageClient();
  } catch {
    return null;
  }
}
