/**
 * The strategic platform layer — timing, cadence, norms, audience behaviour.
 *
 * `PLATFORM_COVERAGE.md` §1 names the gap this fills exactly: mechanically the
 * per-platform coverage is real, but strategically there is *"one brain wearing
 * seven hats"*. At generation time the only things that differed per platform
 * were the format, the hashtag ceiling and a prompt variant. What to say, when
 * to say it and how often was decided once and dressed for each destination.
 *
 * ## Every claim carries its basis
 *
 * `HALYARD_IMPLEMENTATION_PLAN.md` §6 is explicit, and it applies the moment
 * strategic knowledge enters the system rather than only in the phase that
 * names it:
 *
 *   > Do not invent "best practices" as measured facts until Halyard has its
 *   > own data. Separate: platform fact / industry heuristic / Halyard
 *   > empirical finding.
 *
 * So a norm is not a number in a table. It is a claim with a **basis**, and the
 * three bases are not interchangeable. A platform fact can be checked against
 * documentation; an industry heuristic is a widely-held belief this system has
 * not measured; a Halyard empirical finding requires our own data, and this
 * system has published nothing, so **no norm here carries that basis**. When
 * one legitimately does, it will be because a scorer produced it.
 *
 * ## Strategy consumes capability and cannot route around it
 *
 * `strategyFor` takes resolved capabilities as an input it cannot fabricate.
 * A recommendation for an action that is `unsupported`, `unknown`, `declared`
 * or blocked is withheld, with the capability's own reason carried through — so
 * "we are not recommending Reels here" arrives attached to *why*, rather than
 * as a silent absence.
 */
import type { PlatformId } from '../adapters/types.js';
import {
  isActionable,
  type CapabilityAction,
  type CapabilityResolution,
} from './capability.js';

/**
 * Where a strategic claim comes from.
 *
 * The whole reason this type exists is that the three are routinely conflated,
 * and the conflation always runs one way: a heuristic somebody read once starts
 * being cited as a measurement.
 */
export type NormBasis =
  /** Documented by the platform, or structurally true of it. */
  | 'platform_fact'
  /** Widely believed, not measured by this system. Most norms are these. */
  | 'industry_heuristic'
  /** Measured from Halyard's own published results. None exist yet. */
  | 'halyard_empirical';

export interface PlatformNorm {
  claim: string;
  basis: NormBasis;
  /** Why it is believed, and what would change it. */
  why: string;
}

/**
 * §445. The one thing this platform's distribution actually turns on.
 *
 * Every platform here has been getting the same piece with a different caption,
 * which is what a scheduler does rather than what a social team does. The
 * difference between them is not tone, it is **what they count** — and that
 * changes the piece rather than the wrapper around it:
 *
 * - `completion` (TikTok) ranks on finishing, so length costs more here than
 *   anywhere and the payoff is withheld to the last third.
 * - `saves` (Reels) ranks on keeping, so the payoff must be worth returning to
 *   — a number, a rule, a list — and legible with the sound off, because most
 *   of that audience never turns it on.
 * - `post_view_engagement` (Shorts) ranks on what happens *after* the watch, so
 *   the close is a question and the title carries the search terms.
 * - `replies` (X, Threads) ranks on conversation, so the copy opens a question
 *   it does not answer.
 * - `search` (Pinterest) ranks on being found, so the words are the asset.
 * - `chronological_reach` (Bluesky) does not rank at all, so timing is the
 *   whole lever.
 *
 * These are not moods. Each names a different thing to optimise, and what
 * follows from it is written per platform as `signalBrief`.
 */
export const PRIMARY_SIGNALS = [
  'completion',
  'saves',
  'post_view_engagement',
  'replies',
  'search',
  'chronological_reach',
] as const;
export type PrimarySignal = (typeof PRIMARY_SIGNALS)[number];

export interface PlatformStrategy {
  platform: PlatformId;
  /** How the audience arrives at content here. Drives everything below. */
  discovery: 'feed' | 'search_index' | 'following_graph' | 'recommendation_engine';
  /** §445. What this platform counts. */
  primarySignal: PrimarySignal;
  /**
   * What making the piece for that signal means, for a writer.
   *
   * Written as instructions rather than description, because this reaches a
   * prompt. "Reels reward saves" is a fact about the platform; "the payoff has
   * to be worth keeping — a number, a rule, a list somebody would come back to"
   * is something a writer can act on, and they are not the same sentence.
   */
  signalBrief: string[];
  /** What a person is doing when they encounter a post here. */
  audienceBehaviour: PlatformNorm;
  /** When posting tends to land, and how confident that is. */
  timing: PlatformNorm;
  /** How often, and the shape of the risk at either extreme. */
  cadence: PlatformNorm;
  /** Conventions a native post follows here and nowhere else. */
  conventions: PlatformNorm[];
  /** What you give up by choosing this platform for a piece. */
  tradeoffs: PlatformNorm[];
  /** Formats worth making here, in preference order. */
  preferredFormats: string[];
}

/**
 * The per-platform strategic model.
 *
 * Seven platforms, matching the adapters that exist. Reddit appears in the
 * architecture's specialist list and has no adapter, no account and no route to
 * publish — so it is deliberately absent rather than present and empty, which
 * would be a strategy for a platform Halyard cannot reach.
 */
export const PLATFORM_STRATEGIES: Record<PlatformId, PlatformStrategy> = {
  x: {
    platform: 'x',
    discovery: 'following_graph',
    primarySignal: 'replies',
    signalBrief: [
      'Open a question this post does not answer. A reply is worth more here than a like.',
      'One idea. A thread of caveats is a thread nobody replies to.',
      'The link goes in the first reply, never the body.',
    ],
    audienceBehaviour: {
      claim: 'Read in short bursts, mostly by people who already follow the account.',
      basis: 'industry_heuristic',
      why: 'The graph decides reach far more than the algorithm does for small accounts. Unmeasured here.',
    },
    timing: {
      claim: 'Weekday mornings in the audience timezone.',
      basis: 'industry_heuristic',
      why: 'Widely reported, never measured by Halyard. Treat as a starting position, not a finding.',
    },
    cadence: {
      claim: 'Daily is sustainable; several a day is normal and not penalised.',
      basis: 'industry_heuristic',
      why: 'Text is cheap here, which is exactly why the cadence ceiling exists — see DEFAULT_CADENCE.',
    },
    conventions: [
      {
        claim: 'A link in the post body suppresses reach, so the link goes in the first reply.',
        basis: 'platform_fact',
        why: 'Encoded in X_CONSTRAINTS.linkStrategy as first_reply, and priced: a post with a body link costs ~$0.20 against ~$0.015 without.',
      },
    ],
    tradeoffs: [
      {
        claim: 'Highest posting cost per unit of reach of any platform here.',
        basis: 'platform_fact',
        why: 'X charges per post through the API. Recorded in X_CONSTRAINTS.costPerPostUsd.',
      },
    ],
    preferredFormats: ['text', 'image'],
  },
  instagram: {
    platform: 'instagram',
    discovery: 'recommendation_engine',
    primarySignal: 'saves',
    signalBrief: [
      'The payoff has to be worth keeping: a number, a rule, a list somebody would come back to.',
      'Assume the sound is off. Every claim has to be legible on screen, not only spoken.',
      'The first frame is the thumbnail and decides whether anything else is read.',
    ],
    audienceBehaviour: {
      claim: 'Browsed visually; the first frame decides whether anything else is read.',
      basis: 'industry_heuristic',
      why: 'Consistent with the visual-slop gate already rejecting static openings. Not measured here.',
    },
    timing: {
      claim: 'Evenings and weekends in the audience timezone.',
      basis: 'industry_heuristic',
      why: 'Commonly reported. Halyard has published nothing, so this is a prior, not a result.',
    },
    cadence: {
      claim: 'Three to five short videos a week; below three the account is deprioritised.',
      basis: 'industry_heuristic',
      why: 'The rationale already encoded in DEFAULT_CADENCE for video. Widely held, unmeasured here.',
    },
    conventions: [
      {
        claim: 'Carousels are read as a sequence: the last card carries the payoff.',
        basis: 'industry_heuristic',
        why: 'Shapes how carousel_6 is written. Not a measured result.',
      },
      {
        claim: 'A Creator account cannot be published to by any API, however approved the app.',
        basis: 'platform_fact',
        why: 'Documented by Meta, and the reason /setup-kit flags it before an account is created rather than after.',
      },
    ],
    tradeoffs: [
      {
        claim: 'No clickable link in a post; the link lives in the bio.',
        basis: 'platform_fact',
        why: 'INSTAGRAM_CONSTRAINTS.linkStrategy is bio_only, which is why /l/<product> exists at all.',
      },
    ],
    preferredFormats: ['video', 'carousel', 'image'],
  },
  threads: {
    platform: 'threads',
    discovery: 'recommendation_engine',
    primarySignal: 'replies',
    signalBrief: [
      'Posts that open a question outperform posts that close one.',
      'Conversational register. A press release does not get replies.',
    ],
    audienceBehaviour: {
      claim: 'Conversational; posts that open a question outperform posts that close one.',
      basis: 'industry_heuristic',
      why: 'Widely reported of Threads specifically. Unmeasured here.',
    },
    timing: {
      claim: 'Follows Instagram’s rhythm, since the audience largely overlaps.',
      basis: 'industry_heuristic',
      why: 'Threads inherits its handle and much of its graph from Instagram.',
    },
    cadence: {
      claim: 'Daily text is sustainable.',
      basis: 'industry_heuristic',
      why: 'Same shape as X. Not measured.',
    },
    conventions: [
      {
        claim: 'Links are permitted in the body and do not visibly suppress reach.',
        basis: 'platform_fact',
        why: 'THREADS_CONSTRAINTS.linkStrategy is in_body — the practical difference from X.',
      },
    ],
    tradeoffs: [
      {
        claim: 'The handle is inherited from Instagram and cannot be changed afterwards.',
        basis: 'platform_fact',
        why: 'Which is why /setup-kit orders Instagram first.',
      },
    ],
    preferredFormats: ['text', 'image'],
  },
  pinterest: {
    platform: 'pinterest',
    discovery: 'search_index',
    primarySignal: 'search',
    signalBrief: [
      'People arrive searching for a solution. Say what it solves, in their words.',
      'The words are the asset. A beautiful pin nobody searches for is not found.',
    ],
    audienceBehaviour: {
      claim: 'People arrive searching for a solution, not browsing a feed.',
      basis: 'platform_fact',
      why: 'Pinterest is structurally a search index. It is the reason its cadence ceiling is 35 a week where text is 14.',
    },
    timing: {
      claim: 'Timing matters least here of any platform.',
      basis: 'platform_fact',
      why: 'A pin surfaces on search, so it accrues over months rather than in the hour after posting.',
    },
    cadence: {
      claim: 'High volume works here and nowhere else.',
      basis: 'industry_heuristic',
      why: 'Already encoded in DEFAULT_CADENCE for pin, with the same reasoning.',
    },
    conventions: [
      {
        claim: 'A pin must be filed to a board that matches its dietary signals.',
        basis: 'platform_fact',
        why: 'Boards are the taxonomy the search index uses. A pin that cannot be filed is refused at draft time.',
      },
    ],
    tradeoffs: [
      {
        claim: 'Slowest feedback of any platform: results accrue over months.',
        basis: 'platform_fact',
        why: 'A search index does not produce a same-day signal, so scoring here needs a longer window.',
      },
    ],
    preferredFormats: ['pin', 'image'],
  },
  tiktok: {
    platform: 'tiktok',
    discovery: 'recommendation_engine',
    primarySignal: 'completion',
    signalBrief: [
      'Completion decides reach. Shorter is better here than anywhere, and every second has to earn itself.',
      'Withhold the payoff until the last third. A piece that answers in the first line has no reason to be finished.',
      'End near where it began, so a replay reads as continuation. Replays are the strongest watch signal there is.',
      'Something on screen changes at least every twelve seconds.',
    ],
    audienceBehaviour: {
      claim: 'Reach is decided almost entirely by retention in the first seconds, not by followers.',
      basis: 'industry_heuristic',
      why: 'The premise behind the payoff verifier and the static-open check. Not measured by Halyard.',
    },
    timing: {
      claim: 'Weakest timing dependence of the video platforms.',
      basis: 'industry_heuristic',
      why: 'A recommendation engine redistributes over days. Unmeasured here.',
    },
    cadence: {
      claim: 'Three to five a week; consistency matters more than volume.',
      basis: 'industry_heuristic',
      why: 'Same rule as the video cadence already encoded.',
    },
    conventions: [
      {
        claim: 'API-published video cannot carry trending commercial audio.',
        basis: 'platform_fact',
        why: 'TIKTOK_CONSTRAINTS.supportsTrendingAudioViaApi is false — a real strategic loss, stated rather than discovered later.',
      },
    ],
    tradeoffs: [
      {
        claim: 'Publishing through the API without an approved audit reaches nobody.',
        basis: 'platform_fact',
        why: 'Unreviewed access is SELF_ONLY and requires a private account.',
      },
    ],
    preferredFormats: ['video'],
  },
  youtube: {
    platform: 'youtube',
    discovery: 'search_index',
    primarySignal: 'post_view_engagement',
    signalBrief: [
      'Half the audience arrived from a search, so they have already decided to watch. Use the room.',
      'The title carries the search terms. It does work captions do elsewhere.',
      'Close on a question. What happens after the watch is what ranks here.',
    ],
    audienceBehaviour: {
      claim: 'Half search, half recommendation; titles do work that captions do elsewhere.',
      basis: 'industry_heuristic',
      why: 'Consistent with YouTube requiring a title where other platforms do not. Unmeasured here.',
    },
    timing: {
      claim: 'Timing matters little; the index does the distributing.',
      basis: 'industry_heuristic',
      why: 'Shorts are redistributed over days rather than in the posting hour.',
    },
    cadence: {
      claim: 'Consistency over volume.',
      basis: 'industry_heuristic',
      why: 'Same video cadence rule.',
    },
    conventions: [
      {
        claim: 'The description carries the link, and it is clickable.',
        basis: 'platform_fact',
        why: 'YOUTUBE_CONSTRAINTS.linkStrategy is description — one of only two platforms here with a working outbound link.',
      },
    ],
    tradeoffs: [
      {
        claim: 'Alt text is not carried at all.',
        basis: 'platform_fact',
        why: 'Recorded in TRANSPORT_DEFAULTS.md: YouTube sends no alt text by either route.',
      },
    ],
    preferredFormats: ['video'],
  },
  bluesky: {
    platform: 'bluesky',
    discovery: 'following_graph',
    primarySignal: 'chronological_reach',
    signalBrief: [
      'Chronological, so nothing recovers a bad posting time. Timing is the whole lever.',
      'Longer text is tolerated here and nowhere else in this set.',
    ],
    audienceBehaviour: {
      claim: 'Small, chronological, and unusually tolerant of longer text.',
      basis: 'industry_heuristic',
      why: 'Widely reported of Bluesky. Halyard has measured nothing.',
    },
    timing: {
      claim: 'Chronological, so timing matters more here than on any algorithmic feed.',
      basis: 'platform_fact',
      why: 'A chronological timeline shows a post to people online at that moment and few others.',
    },
    cadence: {
      claim: 'Daily is sustainable.',
      basis: 'industry_heuristic',
      why: 'Same shape as X, at lower cost.',
    },
    conventions: [
      {
        claim: 'Links work in the body with no reach penalty.',
        basis: 'platform_fact',
        why: 'BLUESKY_CONSTRAINTS.linkStrategy is in_body.',
      },
    ],
    tradeoffs: [
      {
        claim: 'Smallest audience of any platform here.',
        basis: 'platform_fact',
        why: 'Offset by being one of only two platforms that can publish publicly today without a review.',
      },
    ],
    preferredFormats: ['text', 'image'],
  },
};

export interface FormatRecommendation {
  platform: PlatformId;
  format: string;
  /** Why this format, in the platform's own terms. */
  rationale: string;
  /** The basis of the strongest claim behind it, carried through honestly. */
  basis: NormBasis;
}

export interface WithheldRecommendation {
  platform: PlatformId;
  format: string;
  /** The capability verdict that stopped it, verbatim. */
  reason: string;
  action: CapabilityAction;
}

export interface StrategyResult {
  recommended: FormatRecommendation[];
  withheld: WithheldRecommendation[];
}

/** Which capability an intended format actually depends on. */
const FORMAT_REQUIRES: Record<string, CapabilityAction> = {
  video: 'video',
  short_video: 'short_video',
  carousel: 'carousel',
  image: 'publish',
  text: 'publish',
  pin: 'publish',
};

/**
 * What to make for a platform, given what that account can actually do.
 *
 * The capability map is an input rather than something this function fetches,
 * so there is no path by which strategy can consult a cached, optimistic or
 * absent capability and proceed anyway. A missing entry is treated as unknown
 * and withholds the recommendation — the same direction of failure the rest of
 * the system takes.
 *
 * Withheld recommendations are **returned, not dropped.** An operator reading
 * "no video recommended for TikTok" needs the reason attached, or the only
 * available conclusion is that Halyard forgot.
 */
export function strategyFor(
  platform: PlatformId,
  capabilities: Map<CapabilityAction, CapabilityResolution>,
): StrategyResult {
  const strategy = PLATFORM_STRATEGIES[platform];
  const recommended: FormatRecommendation[] = [];
  const withheld: WithheldRecommendation[] = [];

  for (const format of strategy.preferredFormats) {
    const action = FORMAT_REQUIRES[format] ?? 'publish';
    const resolution = capabilities.get(action);

    if (!resolution) {
      withheld.push({
        platform,
        format,
        action,
        reason: `No capability has been resolved for ${action} on ${platform}, so nothing can be recommended.`,
      });
      continue;
    }

    // `isActionable` admits `verified` alone. A declared-but-unprobed capability
    // is not a basis for telling an operator to make something.
    if (!isActionable(resolution.verdict)) {
      withheld.push({ platform, format, action, reason: resolution.reason });
      continue;
    }

    const strongest = strategy.conventions[0] ?? strategy.cadence;
    recommended.push({
      platform,
      format,
      rationale: `${strategy.audienceBehaviour.claim} ${strongest.claim}`,
      basis: strongest.basis,
    });
  }

  return { recommended, withheld };
}

/**
 * Every claim behind a platform's strategy, with its basis.
 *
 * Exported so the UI can show *why* a strategy says what it does, and so the
 * proportion resting on unmeasured heuristics is visible rather than implied.
 */
export function claimsFor(platform: PlatformId): PlatformNorm[] {
  const s = PLATFORM_STRATEGIES[platform];
  return [s.audienceBehaviour, s.timing, s.cadence, ...s.conventions, ...s.tradeoffs];
}

/**
 * How much of a platform's strategy is actually measured.
 *
 * Currently zero everywhere, and that is the honest answer until Halyard has
 * published something and scored it. Surfacing the count stops a screen full of
 * confident strategic language from reading as evidence.
 */
export function basisBreakdown(platform: PlatformId): Record<NormBasis, number> {
  const out: Record<NormBasis, number> = {
    platform_fact: 0,
    industry_heuristic: 0,
    halyard_empirical: 0,
  };
  for (const claim of claimsFor(platform)) out[claim.basis] += 1;
  return out;
}
