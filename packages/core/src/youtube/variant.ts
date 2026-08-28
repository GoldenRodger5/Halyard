/**
 * Shorts and long-form are two different products behind one upload endpoint.
 * §199.
 *
 * `videos.insert` takes the same request either way. What differs is everything
 * around it: how long the video may be, how the title earns a click, how much
 * description is worth writing, and — the part that catches people — **who
 * decides which one it is.**
 *
 * Halyard does not decide. YouTube does, at ingest, from the file itself: since
 * 15 October 2024 any upload that is square or taller and runs three minutes or
 * less is a Short, and nothing in the API can override that. The `#Shorts`
 * hashtag has not been load-bearing since the same date; it survives here as a
 * discovery signal, not as a classifier.
 *
 * So an *intent* of `long_form` carried on a 45-second vertical render is not a
 * setting YouTube will honour — it is a mistake, and one that only shows up
 * after publication when the video appears in the Shorts feed. This module's
 * job is to catch that before the upload, which is why `resolveVariant` returns
 * both what was asked for and what YouTube will actually do.
 *
 * Pure. No network, no clock, no database — every rule here is a fact about
 * YouTube, and the adapter is what turns them into a request.
 */

/** What Halyard means to publish. Carried on the item, chosen at draft time. */
export type YouTubeVariant = 'short' | 'long_form';

/**
 * Three minutes, since 15 October 2024. The adapter shipped with 60 seconds,
 * which was the rule before that date and had two consequences: a legitimate
 * 90-second Short failed validation, and long-form was impossible to express at
 * all because the platform-wide constraint capped every YouTube video at a
 * minute.
 */
export const YOUTUBE_SHORTS_MAX_SECONDS = 180;

/** The ceiling for a verified channel. Unverified accounts are capped at 15 minutes. */
export const YOUTUBE_LONG_FORM_MAX_SECONDS = 12 * 60 * 60;
export const YOUTUBE_UNVERIFIED_MAX_SECONDS = 15 * 60;

/** Hard API limits. Exceeding either is a 400, not a truncation. */
export const YOUTUBE_TITLE_MAX_CHARS = 100;
export const YOUTUBE_DESCRIPTION_MAX_CHARS = 5000;
/** `snippet.tags` is capped by total characters across the array, not by count. */
export const YOUTUBE_TAGS_MAX_TOTAL_CHARS = 500;

/**
 * `snippet.categoryId`. Region-dependent for assignability, but these ids are
 * stable and valid in every region Halyard targets.
 *
 * The adapter hardcoded `'26'` for every upload. That is right for RecipeFix
 * and wrong as an architecture — a founder-persona post about building the
 * product is Science & Technology, and a recipe is not.
 */
export const YOUTUBE_CATEGORIES = {
  film_animation: '1',
  autos: '2',
  music: '10',
  pets: '15',
  sports: '17',
  travel: '19',
  gaming: '20',
  people_blogs: '22',
  comedy: '23',
  entertainment: '24',
  news_politics: '25',
  howto_style: '26',
  education: '27',
  science_technology: '28',
} as const;

export type YouTubeCategory = keyof typeof YOUTUBE_CATEGORIES;

/** Halyard's content categories to YouTube's, so nothing is hardcoded per upload. */
export function categoryIdFor(category: string | null | undefined): string {
  switch (category) {
    case 'founder_insight':
      return YOUTUBE_CATEGORIES.science_technology;
    case 'education':
      return YOUTUBE_CATEGORIES.education;
    case 'community':
      return YOUTUBE_CATEGORIES.people_blogs;
    case 'transformation':
    case 'product':
    default:
      return YOUTUBE_CATEGORIES.howto_style;
  }
}

export interface YouTubeAssetShape {
  width?: number;
  height?: number;
  durationSeconds?: number;
}

/**
 * What YouTube will classify this file as, regardless of what anyone intended.
 *
 * Square counts as vertical for this purpose: the rule is "not landscape", so
 * a 1:1 render lands in the Shorts feed exactly as a 9:16 one does.
 *
 * Unknown dimensions return `false` — an upload whose shape we cannot see is
 * treated as long-form, because guessing "Short" would silently apply a
 * three-minute cap to a video that may not have one.
 */
export function classifiesAsShort(asset: YouTubeAssetShape): boolean {
  const { width = 0, height = 0, durationSeconds } = asset;
  if (width <= 0 || height <= 0) return false;
  if (durationSeconds === undefined) return false;
  return height >= width && durationSeconds <= YOUTUBE_SHORTS_MAX_SECONDS;
}

export interface VariantResolution {
  /** What Halyard meant to publish. */
  intended: YouTubeVariant;
  /** What YouTube will actually treat it as. */
  actual: YouTubeVariant;
  /** True when those two disagree — publishable, but not what was asked for. */
  mismatch: boolean;
  reason: string;
}

/**
 * Reconcile intent with the file.
 *
 * An absent intent is not an error: most of Halyard's YouTube content is
 * vertical Shorts, and inferring from the asset is exactly right when nobody
 * expressed a preference. An intent that *contradicts* the asset is worth
 * surfacing, because the operator asked for something the platform will not do.
 */
export function resolveVariant(
  intended: YouTubeVariant | null | undefined,
  asset: YouTubeAssetShape,
): VariantResolution {
  const actual: YouTubeVariant = classifiesAsShort(asset) ? 'short' : 'long_form';

  if (!intended) {
    return {
      intended: actual,
      actual,
      mismatch: false,
      reason: `No variant declared; YouTube will classify this as ${actual}.`,
    };
  }

  if (intended === actual) {
    return { intended, actual, mismatch: false, reason: `Declared and classified as ${actual}.` };
  }

  const reason =
    intended === 'long_form'
      ? `Declared long-form, but a ${asset.durationSeconds}s video that is ${asset.width}x${asset.height} ` +
        `is square or taller and under ${YOUTUBE_SHORTS_MAX_SECONDS}s, so YouTube will publish it as a Short. ` +
        `Render it landscape, or run it past ${YOUTUBE_SHORTS_MAX_SECONDS}s, to make it long-form.`
      : `Declared a Short, but this asset will not qualify — YouTube only treats square-or-taller video of ` +
        `${YOUTUBE_SHORTS_MAX_SECONDS}s or less as a Short. It will publish as a normal video.`;

  return { intended, actual, mismatch: true, reason };
}

/** Per-variant limits, so validation and the UI read from one place. */
export function limitsFor(variant: YouTubeVariant): {
  maxSeconds: number;
  minSeconds: number;
  titleAdvice: string;
  descriptionAdvice: string;
} {
  return variant === 'short'
    ? {
        maxSeconds: YOUTUBE_SHORTS_MAX_SECONDS,
        minSeconds: 1,
        titleAdvice: 'Under 60 characters. The Shorts feed truncates hard and there is no thumbnail to carry it.',
        descriptionAdvice: 'Two or three lines. Almost nobody expands a Short description.',
      }
    : {
        maxSeconds: YOUTUBE_LONG_FORM_MAX_SECONDS,
        minSeconds: 1,
        titleAdvice: 'Under 70 characters so it survives search and suggested. Front-load the searchable words.',
        descriptionAdvice:
          'First two lines are the above-the-fold summary. Then detail, chapters, and links. This is the SEO surface.',
      };
}

export interface YouTubeValidationInput {
  variant: YouTubeVariant;
  asset: YouTubeAssetShape;
  title: string;
  description: string;
  tags: string[];
  /** Set only when the item is scheduled. Must be in the future. */
  publishAt?: Date | null;
  /** The privacy the upload will use. `publishAt` requires `private`. */
  privacyStatus: 'private' | 'public' | 'unlisted';
  now?: Date;
}

export interface YouTubeValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Everything that would make `videos.insert` fail, said in words an operator can
 * act on.
 *
 * "Invalid request" is what YouTube returns. Which field, and what to do about
 * it, is what a person needs — so each issue names the field and the fix.
 */
export function validateYouTubeUpload(input: YouTubeValidationInput): YouTubeValidationIssue[] {
  const issues: YouTubeValidationIssue[] = [];
  const limits = limitsFor(input.variant);
  const now = input.now ?? new Date();

  if (!input.title.trim()) {
    issues.push({ field: 'title', message: 'YouTube requires a title.', severity: 'error' });
  }
  if (input.title.length > YOUTUBE_TITLE_MAX_CHARS) {
    issues.push({
      field: 'title',
      message: `Title is ${input.title.length} characters; YouTube rejects anything over ${YOUTUBE_TITLE_MAX_CHARS}.`,
      severity: 'error',
    });
  }
  /* `<` and `>` are rejected outright in titles and descriptions. */
  if (/[<>]/.test(input.title)) {
    issues.push({
      field: 'title',
      message: 'Titles cannot contain < or >. YouTube rejects the upload rather than escaping them.',
      severity: 'error',
    });
  }
  if (input.description.length > YOUTUBE_DESCRIPTION_MAX_CHARS) {
    issues.push({
      field: 'description',
      message: `Description is ${input.description.length} characters; the limit is ${YOUTUBE_DESCRIPTION_MAX_CHARS}.`,
      severity: 'error',
    });
  }
  if (/[<>]/.test(input.description)) {
    issues.push({
      field: 'description',
      message: 'Descriptions cannot contain < or >.',
      severity: 'error',
    });
  }

  const tagChars = input.tags.join('').length;
  if (tagChars > YOUTUBE_TAGS_MAX_TOTAL_CHARS) {
    issues.push({
      field: 'tags',
      message: `Tags total ${tagChars} characters; YouTube caps the whole list at ${YOUTUBE_TAGS_MAX_TOTAL_CHARS}.`,
      severity: 'error',
    });
  }

  const duration = input.asset.durationSeconds;
  if (duration !== undefined) {
    if (duration > limits.maxSeconds) {
      issues.push({
        field: 'asset',
        message:
          input.variant === 'short'
            ? `A Short may run ${YOUTUBE_SHORTS_MAX_SECONDS}s; this is ${duration}s. Trim it, or publish it as long-form.`
            : `This is ${duration}s, past the ${limits.maxSeconds}s ceiling.`,
        severity: 'error',
      });
    }
    if (duration < limits.minSeconds) {
      issues.push({ field: 'asset', message: `Video is ${duration}s, too short to upload.`, severity: 'error' });
    }
  }

  if (input.publishAt) {
    if (input.privacyStatus !== 'private') {
      issues.push({
        field: 'publishAt',
        message:
          'Scheduled publishing requires the upload to be private. YouTube rejects publishAt on a public or unlisted video.',
        severity: 'error',
      });
    }
    if (input.publishAt.getTime() <= now.getTime()) {
      issues.push({
        field: 'publishAt',
        message: 'Scheduled time is in the past. YouTube returns invalidPublishAt.',
        severity: 'error',
      });
    }
  }

  const resolution = resolveVariant(input.variant, input.asset);
  if (resolution.mismatch) {
    issues.push({ field: 'variant', message: resolution.reason, severity: 'warning' });
  }

  return issues;
}

/**
 * The scopes each YouTube capability actually needs.
 *
 * Halyard holds `youtube.upload`, `youtube.readonly` and `yt-analytics.readonly`.
 * That is enough to upload and to read; it is **not** enough to change a video
 * after the fact. `videos.update`, `thumbnails.set` and `playlistItems.insert`
 * all require `youtube` or `youtube.force-ssl`, neither of which is requested.
 *
 * This matters because the adapter's own delivery note promised the opposite —
 * that a private upload could later be flipped public over the API. It cannot,
 * with these scopes, and a capability the code claims but cannot perform is the
 * kind of thing gotcha 6 exists to stop.
 */
export const YOUTUBE_SCOPES = {
  upload: 'https://www.googleapis.com/auth/youtube.upload',
  readonly: 'https://www.googleapis.com/auth/youtube.readonly',
  analytics: 'https://www.googleapis.com/auth/yt-analytics.readonly',
  manage: 'https://www.googleapis.com/auth/youtube',
  forceSsl: 'https://www.googleapis.com/auth/youtube.force-ssl',
} as const;

/** Can this token change a video that already exists? */
export function canModifyExistingVideo(scopes: readonly string[]): boolean {
  return scopes.includes(YOUTUBE_SCOPES.manage) || scopes.includes(YOUTUBE_SCOPES.forceSsl);
}

/** Can this token set a custom thumbnail? Same scope requirement as an update. */
export function canSetThumbnail(scopes: readonly string[]): boolean {
  return canModifyExistingVideo(scopes);
}

/**
 * Can this token schedule at upload time?
 *
 * Yes, with nothing more than `youtube.upload` — `status.publishAt` is accepted
 * by `videos.insert`. This is the one piece of scheduling Halyard can do today,
 * and it was never implemented.
 */
export function canScheduleAtUpload(scopes: readonly string[]): boolean {
  return (
    scopes.includes(YOUTUBE_SCOPES.upload) ||
    scopes.includes(YOUTUBE_SCOPES.manage) ||
    scopes.includes(YOUTUBE_SCOPES.forceSsl)
  );
}
