/**
 * Why this, why now, why here. §210.
 *
 * Halyard could already choose *what* to make and *how to tell it*. What it
 * could not do was say why it had chosen either. `ideas` records a topic,
 * `content_items` records a platform, `slots` records a time — and nothing
 * anywhere records the reasoning that connected them, so "why did Halyard make
 * this post" was answerable only by inference from three tables that each hold
 * one third of the answer.
 *
 * §3.3 of the specification asks for the missing layer: select the opportunity,
 * define the objective and audience, choose platform and account, decide
 * whether to create or reuse, pick a timing window, avoid fatigue, and **assign
 * an expected outcome and measurement plan**.
 *
 * That last clause is the one that makes the rest worth storing. A decision
 * with no measurement plan cannot be wrong later, and a decision that cannot be
 * wrong teaches nothing — which is precisely the loop §204 exists to close.
 *
 * ## Deterministic, and refusing
 *
 * Every input here is already a number or a stored fact: the opportunity's
 * decayed worth (§206), the account's mix (§208), what performance has
 * established (§204), when the account last posted. The decision is arithmetic
 * over them, so it is identical on identical input and an operator can disagree
 * with a specific term rather than with a vibe.
 *
 * It returns `null` when the account cannot publish, when the opportunity has
 * decayed, or when posting now would breach spacing. A strategy layer that
 * always produces a plan is a queue filler.
 */
import { actionableInsights, type Insight } from '../learning/insights.js';
import { portfolioPreferences, type PortfolioReport } from '../social/portfolio.js';

/**
 * What a piece of content is *for*. §19 of the specification.
 *
 * The objective changes the hook, the CTA, the destination and the measurement,
 * so it is chosen before any of them rather than inferred afterwards.
 */
export const CONTENT_OBJECTIVES = [
  'awareness',
  'engagement',
  'education',
  'traffic',
  'conversion',
  'retention',
  'follower_growth',
  'product_promotion',
] as const;

export type ContentObjective = (typeof CONTENT_OBJECTIVES)[number];

/** How the content should come into being. §7. */
export type CreationMode = 'create' | 'reuse' | 'remix' | 'adapt';

export interface StrategyOpportunity {
  id: string;
  summary: string;
  source: string;
  /** Present worth after decay, from `discovery/freshness`. */
  effectiveValue: number;
  /** Where it was observed, when platform-specific. */
  platform?: string | null;
}

export interface StrategyAccount {
  id: string;
  platform: string;
  capabilityState: string;
  /** When this account last published anything. Null means never. */
  lastPublishedAt?: Date | null;
  /** Minimum hours between posts on this account. */
  minHoursBetweenPosts?: number;
}

export interface StrategyInput {
  opportunity: StrategyOpportunity;
  account: StrategyAccount;
  portfolio?: PortfolioReport;
  insights?: Insight[];
  /** Objective, when a campaign or the operator has already fixed one. */
  objective?: ContentObjective;
  now?: Date;
}

export interface MeasurementPlan {
  /**
   * The one number this post is judged on.
   *
   * One, not a dashboard. A decision measured against six metrics is a decision
   * that can always be argued to have succeeded.
   */
  primaryMetric: string;
  /**
   * What would count as success, when there is enough history to say.
   *
   * **Null is the normal state early on**, and it is deliberately not a guessed
   * number: a threshold invented before any measurement would be met or missed
   * for reasons unrelated to the content, and would then be learned from.
   */
  successThreshold: number | null;
  /** When the result should be looked at. Sooner than the metric stabilises is noise. */
  reviewAfter: Date;
  basis: string;
}

export interface StrategyDecision {
  accountId: string;
  platform: string;
  opportunityId: string;
  objective: ContentObjective;
  /** Why this is worth making now rather than later or never. */
  whyNow: string;
  audience: string;
  creationMode: CreationMode;
  /** Treatments the portfolio and performance argue for, strongest first. */
  preferredTreatments: string[];
  /** Treatments to avoid, and the reason is in the rationale. */
  avoidTreatments: string[];
  timing: { earliest: Date; latest: Date; reason: string };
  measurement: MeasurementPlan;
  /** 0..1. How much of this decision rests on evidence rather than default. */
  confidence: number;
  rationale: string;
  /** Everything this decision rests on, for the lineage §12 requires. */
  evidence: string[];
}

export interface StrategyRefusal {
  refused: true;
  reason: string;
}

const DEFAULT_MIN_HOURS = 18;
const HOUR = 3_600_000;

/**
 * The metric that actually reflects an objective.
 *
 * Not interchangeable. Judging an education post on link clicks measures the
 * wrong thing and then teaches the wrong lesson, which is worse than not
 * measuring it — §204 will happily learn from a badly chosen metric.
 */
export function metricFor(objective: ContentObjective): string {
  switch (objective) {
    case 'awareness':
      return 'impressions';
    case 'engagement':
      return 'engagement_rate';
    case 'education':
      return 'completion_rate';
    case 'traffic':
      return 'link_clicks';
    case 'conversion':
      return 'activated_users';
    case 'retention':
      return 'returning_viewers';
    case 'follower_growth':
      return 'follows';
    case 'product_promotion':
      return 'link_clicks';
  }
}

/**
 * How long before the number means anything, by metric.
 *
 * Short-form impressions settle in a day; a conversion signal needs a week
 * because the person has to come back and do something. Reviewing sooner
 * produces a verdict on incomplete data that then becomes a belief.
 */
function reviewDaysFor(metric: string): number {
  if (metric === 'activated_users' || metric === 'returning_viewers') return 7;
  if (metric === 'link_clicks' || metric === 'follows') return 3;
  return 2;
}

/** Objective inferred from the opportunity's own source, when nobody fixed one. */
function inferObjective(opportunity: StrategyOpportunity): ContentObjective {
  switch (opportunity.source) {
    case 'changelog':
    case 'product_activity':
      return 'product_promotion';
    case 'trend':
      return 'awareness';
    case 'seasonal':
      return 'engagement';
    case 'performance':
      return 'retention';
    case 'submission':
      return 'engagement';
    case 'editorial':
    default:
      return 'education';
  }
}

/**
 * Decide, or refuse and say why.
 *
 * The refusals come first and are not soft: an account that cannot publish, an
 * opportunity that has decayed to nothing, and a post that would land too close
 * to the last one are all reasons to make no plan at all. Producing one anyway
 * is how a queue fills with content nobody chose.
 */
export function decideStrategy(input: StrategyInput): StrategyDecision | StrategyRefusal {
  const now = input.now ?? new Date();
  const { account, opportunity } = input;

  if (account.capabilityState !== 'live' && account.capabilityState !== 'draft_only') {
    return { refused: true, reason: `Account is ${account.capabilityState}; it cannot publish.` };
  }

  if (opportunity.effectiveValue <= 0) {
    return { refused: true, reason: 'The opportunity has decayed past being worth acting on.' };
  }

  if (opportunity.platform && opportunity.platform !== account.platform) {
    return {
      refused: true,
      reason: `Observed on ${opportunity.platform}; this account is ${account.platform}.`,
    };
  }

  const minHours = account.minHoursBetweenPosts ?? DEFAULT_MIN_HOURS;
  const sinceLast = account.lastPublishedAt
    ? (now.getTime() - account.lastPublishedAt.getTime()) / HOUR
    : Infinity;
  /*
   * Spacing is a refusal rather than a later scheduling nudge. The alternative
   * is a decision that exists but cannot be acted on, which reads to every
   * downstream reader as work waiting to happen.
   */
  const earliest =
    sinceLast >= minHours
      ? now
      : new Date(account.lastPublishedAt!.getTime() + minHours * HOUR);

  const objective = input.objective ?? inferObjective(opportunity);
  const metric = metricFor(objective);

  const prefs = input.portfolio
    ? portfolioPreferences(input.portfolio, 'treatment')
    : { avoid: [], prefer: [] };

  /*
   * Performance-backed treatments, strongest first. Only beliefs that have
   * earned the right to be acted on — `actionableInsights` drops observed notes
   * and anything stale (§204, §206).
   */
  const usable = actionableInsights(input.insights ?? [], now).filter(
    (i) => i.feature === 'creative_type',
  );
  const winners = usable
    .filter((i) => i.lift > 0)
    .sort((a, b) => b.lift * b.confidence - a.lift * a.confidence)
    .map((i) => i.featureValue);
  const losers = usable.filter((i) => i.lift < 0).map((i) => i.featureValue);

  const preferredTreatments = [...new Set([...winners, ...prefs.prefer])].filter(
    (t) => !prefs.avoid.includes(t),
  );
  const avoidTreatments = [...new Set([...prefs.avoid, ...losers])];

  /*
   * Creation mode. Reuse is not offered here: nothing in this input describes
   * an existing asset, and claiming otherwise would be inventing one. Remix and
   * adapt become available when the caller can pass prior work — the union
   * exists so that is an argument change rather than a redesign.
   */
  const creationMode: CreationMode = 'create';

  /* Confidence is what fraction of the decision rested on evidence. */
  const evidenceTerms = [
    opportunity.effectiveValue > 0,
    Boolean(input.portfolio && input.portfolio.window > 0),
    usable.length > 0,
    Boolean(account.lastPublishedAt),
  ];
  const confidence =
    Math.round((evidenceTerms.filter(Boolean).length / evidenceTerms.length) * 100) / 100;

  const reviewDays = reviewDaysFor(metric);

  const evidence = [
    `signal:${opportunity.id}`,
    ...(input.portfolio ? [`portfolio:${input.portfolio.window}`] : []),
    ...usable.map((i) => `insight:${i.feature}=${i.featureValue}`),
  ];

  const whyNow =
    opportunity.effectiveValue > 0.5
      ? `The opportunity is still current (worth ${opportunity.effectiveValue.toFixed(2)} after decay).`
      : `The opportunity is fading (worth ${opportunity.effectiveValue.toFixed(2)}); acting now or not at all.`;

  const rationaleParts = [
    `${objective} for ${account.platform}, from ${opportunity.source}.`,
    whyNow,
    preferredTreatments.length > 0
      ? `Leaning toward ${preferredTreatments.slice(0, 3).join(', ')}.`
      : 'No treatment preference: nothing measured yet.',
    avoidTreatments.length > 0 ? `Avoiding ${avoidTreatments.join(', ')}.` : '',
    `Judged on ${metric} after ${reviewDays} day${reviewDays === 1 ? '' : 's'}.`,
  ].filter(Boolean);

  return {
    accountId: account.id,
    platform: account.platform,
    opportunityId: opportunity.id,
    objective,
    whyNow,
    /*
     * Audience is stated at the level the inputs support. Inventing a persona
     * from a signal summary would be the kind of confident fiction this whole
     * system is built to avoid.
     */
    audience: `${account.platform} audience for ${opportunity.source} content`,
    creationMode,
    preferredTreatments,
    avoidTreatments,
    timing: {
      earliest,
      latest: new Date(earliest.getTime() + 72 * HOUR),
      reason:
        sinceLast >= minHours
          ? 'Spacing satisfied; publishable as soon as it is ready.'
          : `Held to ${minHours}h after the previous post on this account.`,
    },
    measurement: {
      primaryMetric: metric,
      /* Null, not a guess. See MeasurementPlan. */
      successThreshold: null,
      reviewAfter: new Date(earliest.getTime() + reviewDays * 24 * HOUR),
      basis: `No account baseline for ${metric} yet; the first results establish one.`,
    },
    confidence,
    rationale: rationaleParts.join(' '),
    evidence,
  };
}

export function isRefusal(
  result: StrategyDecision | StrategyRefusal,
): result is StrategyRefusal {
  return (result as StrategyRefusal).refused === true;
}
