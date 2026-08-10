/**
 * What each platform wants on a profile. Milestone 50.
 *
 * Nothing in this repository knew any of this. `PlatformConstraints` describes
 * what a *post* may contain; creating the account is a different set of limits
 * entirely, and it was being left to the operator to discover one rejected form
 * at a time.
 *
 * ## On the numbers
 *
 * Checked 10 August 2026 against each platform's own help documentation. They
 * change without notice, and a limit that has silently tightened produces a bio
 * the platform truncates mid-sentence — so where a value was ambiguous between
 * sources, **the smaller one is recorded here**. Copy generated to fit a
 * conservative limit fits the real one; the reverse is not true.
 *
 * The UI shows the character count against the limit for exactly this reason: if
 * a platform disagrees with this file, the operator sees the disagreement rather
 * than discovering it in a paste box.
 */
import type { PlatformId } from '../adapters/types.js';

export interface ProfileImageSpec {
  width: number;
  height: number;
  /** What the platform calls it, so the operator knows which upload box. */
  label: string;
  /**
   * Fraction of the height at top and bottom that platform chrome may cover.
   * YouTube's banner is the extreme case: 2048×1152 uploaded, ~1235×338 visible
   * on a phone, so anything outside that band is decoration at best.
   */
  safeAreaFraction?: number;
  note?: string;
}

export interface ProfileSpec {
  platform: PlatformId;
  /** Characters allowed in the bio / about / description field. */
  bioMaxChars: number;
  /** Characters allowed in the display name, which is not the handle. */
  displayNameMaxChars: number;
  handle: {
    maxChars: number;
    /** Human description of what characters are legal. */
    rule: string;
    /** True where the handle is not chosen freely (Bluesky uses a domain). */
    derived?: boolean;
  };
  avatar: ProfileImageSpec;
  banner?: ProfileImageSpec;
  /** Whether the profile has a clickable link field at all. */
  linkField: 'one' | 'multiple' | 'none';
  linkNote: string;
}

export const PROFILE_SPECS: Record<PlatformId, ProfileSpec> = {
  x: {
    platform: 'x',
    bioMaxChars: 160,
    displayNameMaxChars: 50,
    handle: { maxChars: 15, rule: 'letters, numbers and underscores' },
    avatar: { width: 400, height: 400, label: 'Profile photo', note: 'Cropped to a circle.' },
    banner: {
      width: 1500,
      height: 500,
      label: 'Header',
      safeAreaFraction: 0.2,
      note: 'The avatar overlaps the lower left. Keep that corner empty.',
    },
    linkField: 'one',
    linkNote: 'One website field. This is where the link-in-bio URL goes.',
  },
  instagram: {
    platform: 'instagram',
    bioMaxChars: 150,
    displayNameMaxChars: 30,
    handle: { maxChars: 30, rule: 'letters, numbers, periods and underscores' },
    avatar: { width: 320, height: 320, label: 'Profile photo', note: 'Cropped to a circle.' },
    linkField: 'multiple',
    linkNote:
      'Up to five links on a Professional account. Halyard still routes through one /l page so clicks are attributable.',
  },
  threads: {
    platform: 'threads',
    bioMaxChars: 150,
    displayNameMaxChars: 30,
    handle: {
      maxChars: 30,
      rule: 'inherited from the linked Instagram account',
      derived: true,
    },
    avatar: { width: 320, height: 320, label: 'Profile photo', note: 'Cropped to a circle.' },
    linkField: 'multiple',
    linkNote: 'Links are separate from Instagram’s despite the shared handle.',
  },
  tiktok: {
    platform: 'tiktok',
    bioMaxChars: 80,
    displayNameMaxChars: 30,
    handle: { maxChars: 24, rule: 'letters, numbers, underscores and periods' },
    avatar: {
      width: 200,
      height: 200,
      label: 'Profile photo',
      note: 'Small and cropped to a circle — a wordmark will not be legible.',
    },
    linkField: 'one',
    linkNote:
      'The website field needs 1,000 followers on a personal account. A Business account has it from the start.',
  },
  youtube: {
    platform: 'youtube',
    bioMaxChars: 1000,
    displayNameMaxChars: 100,
    handle: { maxChars: 30, rule: 'letters, numbers, underscores, hyphens and periods' },
    avatar: { width: 800, height: 800, label: 'Profile picture', note: 'Cropped to a circle.' },
    banner: {
      width: 2048,
      height: 1152,
      label: 'Banner image',
      safeAreaFraction: 0.35,
      note: 'Only the middle band — roughly 1235×338 — is visible on a phone. Everything else is desktop decoration.',
    },
    linkField: 'multiple',
    linkNote: 'Links appear on the channel banner and in the About tab.',
  },
  pinterest: {
    platform: 'pinterest',
    bioMaxChars: 160,
    displayNameMaxChars: 30,
    handle: { maxChars: 30, rule: 'letters and numbers' },
    avatar: { width: 800, height: 800, label: 'Profile photo', note: 'Cropped to a circle.' },
    linkField: 'one',
    linkNote:
      'Claim the website instead of only linking it — a claimed site attributes every Pin back to the profile.',
  },
  bluesky: {
    platform: 'bluesky',
    bioMaxChars: 256,
    displayNameMaxChars: 64,
    handle: {
      maxChars: 253,
      rule: 'a domain — either name.bsky.social or a domain you own',
      derived: true,
    },
    avatar: { width: 400, height: 400, label: 'Avatar', note: 'Cropped to a circle.' },
    banner: { width: 1500, height: 500, label: 'Banner' },
    linkField: 'none',
    linkNote: 'No link field. Links go in the bio text or in posts, which is why they are unfurled.',
  },
};

/**
 * What must be true before Halyard can publish, per platform.
 *
 * Distinct from `REVIEW_GATES`, which is about the developer app. This is about
 * the *account*: an Instagram Creator account cannot be published to by any API
 * regardless of how approved the app is, and finding that out after creating the
 * profile means creating it again.
 */
export interface SetupStep {
  label: string;
  detail: string;
  /** True where skipping it makes API publishing impossible, not merely worse. */
  blocking: boolean;
}

export const SETUP_CHECKLISTS: Record<PlatformId, SetupStep[]> = {
  x: [
    {
      label: 'Use a private browser window',
      detail:
        'A logged-in session in your main profile is the most common way an account ends up connected to the wrong identity.',
      blocking: false,
    },
    {
      label: 'Add the link-in-bio URL to the website field',
      detail: 'Every click Halyard attributes comes through it.',
      blocking: false,
    },
    {
      label: 'Confirm the account can be reached by the developer app',
      detail:
        'The app is a paid tier and is registered separately. /accounts → Connect, then Self-test.',
      blocking: true,
    },
  ],
  instagram: [
    {
      label: 'Switch to a Professional account',
      detail:
        'Settings → Account type → Switch to Professional. A personal account cannot be published to by any API, ever.',
      blocking: true,
    },
    {
      label: 'Choose Business, not Creator',
      detail:
        'Creator accounts lose several publishing capabilities. Business is the type the Content Publishing API supports.',
      blocking: true,
    },
    {
      label: 'Link a Facebook Page',
      detail:
        'The API reaches Instagram through the Page. No Page means no token, whatever the app review says.',
      blocking: true,
    },
    {
      label: 'Add the link-in-bio URL',
      detail: 'Instagram strips links from captions, so the bio is the only route out.',
      blocking: false,
    },
  ],
  threads: [
    {
      label: 'Create the Instagram account first',
      detail: 'Threads inherits the handle. Creating Threads first fixes a handle you may not want.',
      blocking: true,
    },
    {
      label: 'Enable the Threads API in the same Meta app',
      detail: 'It is a separate product toggle from Instagram, on the same app.',
      blocking: true,
    },
  ],
  tiktok: [
    {
      label: 'Switch to a Business account',
      detail:
        'Settings → Account → Switch to Business Account. A personal account has no website field until 1,000 followers.',
      blocking: false,
    },
    {
      label: 'Expect drafts, not published posts',
      detail:
        'Halyard uploads to drafts on purpose. No API can attach trending commercial audio, and audio is a large share of TikTok distribution — you finish these in the app.',
      blocking: false,
    },
  ],
  youtube: [
    {
      label: 'Create a channel, not just a Google account',
      detail: 'A Google account without a channel has nothing to publish to.',
      blocking: true,
    },
    {
      label: 'Verify the channel by phone',
      detail: 'Unverified channels cannot upload videos longer than 15 minutes or use custom thumbnails.',
      blocking: false,
    },
    {
      label: 'Expect private uploads until the compliance audit passes',
      detail:
        'Unaudited API uploads are forced private by YouTube regardless of what is requested. Halyard sends private deliberately rather than being surprised.',
      blocking: false,
    },
  ],
  pinterest: [
    {
      label: 'Create a Business account',
      detail: 'Personal accounts have no API access at all.',
      blocking: true,
    },
    {
      label: 'Claim the website',
      detail:
        'Pinterest → Settings → Claimed accounts. A claimed site attributes every Pin and unlocks the analytics Halyard reads.',
      blocking: false,
    },
    {
      label: 'Create at least one board',
      detail: 'Every Pin needs a board id. Halyard refuses to guess one.',
      blocking: true,
    },
  ],
  bluesky: [
    {
      label: 'Create an app password',
      detail:
        'Settings → App Passwords. Never paste your account password — an app password can be revoked without locking you out.',
      blocking: true,
    },
    {
      label: 'Consider using your own domain as the handle',
      detail:
        'Settings → Handle → I have my own domain. It is free, it verifies the account, and it survives leaving Bluesky.',
      blocking: false,
    },
  ],
};

/** Platforms in the order they should be created, because some depend on others. */
export const CREATION_ORDER: PlatformId[] = [
  'instagram',
  'threads',
  'x',
  'bluesky',
  'tiktok',
  'youtube',
  'pinterest',
];

/**
 * Why that order: Threads inherits Instagram's handle, so Instagram must exist
 * first, and the rest are sorted by how long the platform takes to set up.
 */
export const CREATION_ORDER_NOTE =
  'Instagram first, because Threads inherits its handle and cannot be renamed afterwards. ' +
  'The rest are ordered by how long each takes.';
