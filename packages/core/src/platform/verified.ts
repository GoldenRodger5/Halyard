/**
 * §442. Constants that describe somebody else's product, and when we last looked.
 *
 * ## Why this file exists
 *
 * §438 found a Reels duration cap of 90 seconds and a Shorts cap of 60. Both
 * had been wrong for over a year — Instagram went to three minutes, YouTube
 * went to three minutes in October 2024 — and legal video was being refused as
 * out of bounds the whole time.
 *
 * Three things made it survive:
 *
 * 1. The constant looked like a fact. `maxSeconds: 90` reads as arithmetic, not
 *    as an observation somebody made on a particular day.
 * 2. The same fact lived in three places and only one was corrected.
 *    `youtube.ts` fixed its Shorts number, with a comment explaining why, while
 *    `visualQC.ts` and `instagram.ts` kept theirs.
 * 3. **The test suite defended it.** `gates.test.ts` asserted that a 95-second
 *    Reel *should* be refused. The test agreed with the constant and neither
 *    agreed with the platform, so a green suite was evidence of nothing.
 *
 * The general shape is one this codebase keeps meeting from the other side:
 * usually a rule is right and nothing reads it. Here a rule was read by
 * everything and **the world moved underneath it**. Types cannot catch that and
 * neither can tests written at the same time as the constant.
 *
 * ## What this does about it
 *
 * A constant that encodes a third party's behaviour is a **measurement**, and a
 * measurement without a date is a guess. So each one is registered here with
 * the date it was last checked against the platform and where it lives.
 * `verified.test.ts` fails when one goes a year unchecked — not to be tidy, but
 * because a year is demonstrably long enough for two platforms to triple a
 * limit while everything stayed green.
 *
 * ## What belongs here
 *
 * Only facts about *somebody else's* product that can change without any
 * warning reaching this repository: API limits, ranking behaviour, scopes,
 * pricing. Not editorial choices, not thresholds we picked. `LENGTH_BANDS` is
 * here because it encodes measured platform behaviour; `PACE_FACTORS` is not,
 * because it is a taste we chose and nobody else can change it.
 */

export interface VerifiedConstant {
  /** What it is, in one line an operator can go and check. */
  what: string;
  /** Where it lives. Path plus symbol. */
  where: string;
  /** ISO date, the day somebody actually looked at the platform. */
  verifiedOn: string;
  /** How to check it again: the page, the doc, the console. */
  checkBy: string;
}

/**
 * A year. Long enough not to be noise, short enough that §438 could not happen
 * twice: those constants were eleven and twenty-three months stale.
 */
export const STALE_AFTER_DAYS = 365;

export const VERIFIED_CONSTANTS: VerifiedConstant[] = [
  {
    what: 'Instagram Reels accept up to 180 seconds; past that the piece is accepted and not recommended to non-followers.',
    where: 'packages/core/src/qc/visualQC.ts VIDEO_BOUNDS.instagram, packages/core/src/adapters/instagram.ts INSTAGRAM_CONSTRAINTS.video',
    verifiedOn: '2026-09-01',
    checkBy: 'Instagram Content Publishing API docs, REELS media type',
  },
  {
    what: 'YouTube Shorts are vertical and up to 180 seconds, raised from 60 in October 2024.',
    where: 'packages/core/src/qc/visualQC.ts VIDEO_BOUNDS.youtube, packages/core/src/adapters/youtube.ts limitsFor',
    verifiedOn: '2026-09-01',
    checkBy: 'YouTube Help: Shorts requirements',
  },
  {
    what: 'TikTok accepts up to 600 seconds through the Content Posting API.',
    where: 'packages/core/src/qc/visualQC.ts VIDEO_BOUNDS.tiktok, packages/core/src/adapters/tiktok.ts',
    verifiedOn: '2026-09-01',
    checkBy: 'TikTok Content Posting API docs, video constraints',
  },
  {
    what: 'Trending commercial audio cannot be attached through the TikTok posting API, which is why inbox upload exists.',
    where: 'packages/core/src/adapters/tiktok.ts supportsTrendingAudioViaApi',
    verifiedOn: '2026-09-01',
    checkBy: 'TikTok Content Posting API docs, music attribution',
  },
  {
    what: 'The per-platform length bands: what each platform rewards, as distinct from what it accepts.',
    where: 'packages/core/src/creative/length.ts LENGTH_BANDS',
    verifiedOn: '2026-09-01',
    checkBy: 'docs/DIRECTION_SPEC.md Part 1 carries the sources for every number',
  },
  {
    what: 'X charges roughly $0.015 a post without a link and $0.20 with one, and returns 402 when credits are depleted.',
    where: 'CLAUDE.md gotcha 11, packages/core/src/adapters/x.ts',
    verifiedOn: '2026-09-01',
    checkBy: 'X developer portal, billing page',
  },
  {
    what: 'An Instagram Creator account cannot be published to by any API, however approved the app.',
    where: 'packages/core/src/platform/strategy.ts instagram norms',
    verifiedOn: '2026-09-01',
    checkBy: 'Instagram Graph API docs, account type requirements',
  },
];

/** How many days ago a constant was checked. */
export function daysSinceVerified(constant: VerifiedConstant, now = new Date()): number {
  const then = new Date(`${constant.verifiedOn}T00:00:00Z`).getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** The ones that have gone unchecked long enough to be suspect. */
export function staleConstants(now = new Date()): VerifiedConstant[] {
  return VERIFIED_CONSTANTS.filter((c) => daysSinceVerified(c, now) > STALE_AFTER_DAYS);
}
