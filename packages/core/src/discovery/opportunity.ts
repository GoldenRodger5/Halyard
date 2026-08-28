/**
 * Turning a discovered signal into a content opportunity — or refusing to. §254.
 *
 * ## The gap this fills
 *
 * `freshness.ts` decays a signal and `rankSignals` orders them. Nothing decided
 * whether a signal was *worth making content about*, which is a different
 * question with different answers: a trend can be fresh, highly ranked, and
 * completely wrong for the brand, or right for the brand and impossible to
 * build because the evidence does not exist.
 *
 * ## Every refusal is a distinct outcome
 *
 * Four ways to say no, and they are not interchangeable. "Off-brand" is a
 * permanent no; "already covered" is a no for now; "unbuildable" is a no until
 * the product ships something; "stale" is a no that fixes itself by being
 * dropped. Collapsing them into one `false` is how a discovery system becomes
 * a thing that rejects everything for reasons nobody can act on.
 *
 * ## No invented evidence
 *
 * A signal with no source is not scored, it is refused. Gotcha 9 applies to
 * trends exactly as it applies to metrics: a trend Halyard cannot point at is
 * a trend Halyard made up.
 */

export type OpportunityVerdict = 'build' | 'watch' | 'covered' | 'unbuildable' | 'off_brand' | 'stale' | 'unevidenced';

export interface DiscoveredSignal {
  id: string;
  /** What was observed, in the words it was observed in. */
  title: string;
  /** Where it came from. Absent means it cannot be used at all. */
  source: string | null;
  sourceUrl?: string | null;
  platform?: string | null;
  observedAt: Date;
  /** 0..1, how confident the collector is that this is real. */
  confidence: number;
  /** Terms the signal is about. */
  terms: string[];
}

/**
 * Named `SignalAssessment` rather than `OpportunityInput`: the strategy layer
 * already exports an `OpportunityInput`, and two different shapes with one
 * name in one barrel is how a caller ends up passing a strategy opportunity to
 * a discovery assessor and getting a plausible answer to the wrong question.
 */
export interface SignalAssessment {
  signal: DiscoveredSignal;
  /** Terms the brand will not touch. A permanent no. */
  forbiddenTerms?: string[];
  /** Terms that describe what the product can actually evidence. */
  capableTerms?: string[];
  /** Topics already covered recently, lowercased. */
  recentTopics?: string[];
  /** How stale is too stale, in days, for this source. */
  maxAgeDays?: number;
  now?: Date;
}

export interface Opportunity {
  verdict: OpportunityVerdict;
  /** 0..1. Only meaningful when the verdict is `build` or `watch`. */
  score: number;
  reason: string;
  /** The provenance, carried so a concept built from this can cite it. */
  evidence: { source: string; url: string | null; observedAt: string; platform: string | null } | null;
}

const DAY = 86_400_000;

export function assessOpportunity(input: SignalAssessment): Opportunity {
  const { signal } = input;
  const now = input.now ?? new Date();

  /*
   * Provenance first, and it is not a score component. A signal Halyard
   * cannot point at is one it made up, and no amount of relevance rescues
   * that.
   */
  if (!signal.source?.trim()) {
    return {
      verdict: 'unevidenced',
      score: 0,
      reason: 'No source recorded. A trend Halyard cannot point at is a trend Halyard invented.',
      evidence: null,
    };
  }

  const evidence = {
    source: signal.source,
    url: signal.sourceUrl ?? null,
    observedAt: signal.observedAt.toISOString(),
    platform: signal.platform ?? null,
  };

  const terms = signal.terms.map((t) => t.toLowerCase());
  const haystack = `${signal.title} ${terms.join(' ')}`.toLowerCase();

  /* Off-brand is permanent, so it is checked before anything that decays. */
  const forbidden = (input.forbiddenTerms ?? []).find((t) => haystack.includes(t.toLowerCase()));
  if (forbidden) {
    return {
      verdict: 'off_brand',
      score: 0,
      reason: `Mentions "${forbidden}", which this brand does not talk about. This does not become true later.`,
      evidence,
    };
  }

  const ageDays = (now.getTime() - signal.observedAt.getTime()) / DAY;
  const maxAge = input.maxAgeDays ?? 21;
  if (ageDays > maxAge) {
    return {
      verdict: 'stale',
      score: 0,
      reason: `Observed ${Math.round(ageDays)} days ago, past the ${maxAge}-day window for this source.`,
      evidence,
    };
  }

  /*
   * Buildable means the product can *evidence* something about it. A trend
   * about air fryers is not buildable by a recipe adapter that has never
   * touched one, and building it anyway means inventing the connection.
   */
  const capable = input.capableTerms ?? [];
  const matched = capable.filter((t) => haystack.includes(t.toLowerCase()));
  if (capable.length > 0 && matched.length === 0) {
    return {
      verdict: 'unbuildable',
      score: 0,
      reason:
        'Nothing the product can demonstrate touches this. Making content anyway would mean ' +
        'inventing a connection between the trend and the product.',
      evidence,
    };
  }

  /* Already covered is a no *for now*, so it keeps a score. */
  const recent = (input.recentTopics ?? []).map((t) => t.toLowerCase());
  const alreadyCovered = recent.some((t) => haystack.includes(t) || terms.some((x) => t.includes(x)));

  /* Freshness, confidence and product fit. Weighted so a stale-but-relevant
     signal outranks a fresh irrelevant one. */
  const freshness = Math.max(0, 1 - ageDays / maxAge);
  const fit = capable.length > 0 ? Math.min(1, matched.length / 2) : 0.5;
  const score = Number((freshness * 0.3 + signal.confidence * 0.3 + fit * 0.4).toFixed(3));

  if (alreadyCovered) {
    return {
      verdict: 'covered',
      score,
      reason: 'This account has posted about it recently; the same take twice is how a feed goes stale.',
      evidence,
    };
  }

  if (score < 0.45) {
    return {
      verdict: 'watch',
      score,
      reason: `Real and on-topic but weak (${score}); worth watching rather than building today.`,
      evidence,
    };
  }

  return {
    verdict: 'build',
    score,
    reason:
      `${matched.length > 0 ? `Touches ${matched.join(', ')}. ` : ''}` +
      `Observed ${Math.round(ageDays)} days ago at confidence ${signal.confidence}.`,
    evidence,
  };
}
