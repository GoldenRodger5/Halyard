/**
 * The account as a body of work, not a queue of posts. §208.
 *
 * Halyard optimised every post independently. `format_cadence` put a weekly
 * floor and ceiling on *formats* and nothing else, so an account could publish
 * five transformations about the same feature with the same hook and violate no
 * rule — each piece individually fine, the sequence monotonous.
 *
 * §6 of the specification asks for the distribution to be tracked across
 * topics, formats, treatments, hooks, CTAs, features demonstrated, and the
 * educational/entertaining/promotional balance, with overuse and undercoverage
 * detected and controlled exploration so the account does not converge
 * prematurely on one template.
 *
 * ## Why this is not a scoring model
 *
 * Distribution is arithmetic. Whether a distribution is *wrong* is a judgement,
 * and the judgement here is deliberately crude and explainable: a dimension is
 * overused when one value takes more than its share of a window, and
 * undercovered when a value the account has declared it cares about is missing
 * from one. No model is asked whether the mix feels right, because the answer
 * would be unauditable and would change between runs on identical input.
 *
 * ## Exploration is budgeted, not random
 *
 * The exploit/explore tension in §6 is handled by reserving a share of the
 * window for values that have *no* measured history. That is different from
 * choosing randomly: it means the account deliberately spends a fixed fraction
 * of its output finding out about things it has never tried, and stops spending
 * it once they are no longer unknown.
 *
 * Pure over rows. No database, no clock of its own.
 */

export interface PortfolioItem {
  contentItemId: string;
  publishedAt: Date;
  platform: string;
  /**
   * The decisions this piece embodied. Open-ended for the same reason
   * `ContentObservation.features` is: a dimension worth balancing tomorrow
   * should not need this file edited.
   */
  dimensions: Record<string, string | null | undefined>;
}

export interface DimensionSlice {
  dimension: string;
  value: string;
  count: number;
  share: number;
  /** Position of the most recent use, 0 being the latest post. Null if unused. */
  lastUsedIndex: number | null;
}

export interface PortfolioFinding {
  dimension: string;
  value: string;
  kind: 'overused' | 'undercovered' | 'unexplored';
  severity: 'warning' | 'error';
  message: string;
  share?: number;
}

export interface PortfolioReport {
  window: number;
  slices: DimensionSlice[];
  findings: PortfolioFinding[];
  /** Values with no appearance in the window, by dimension. */
  gaps: Record<string, string[]>;
  /** How much of the window is currently spent on untried values, 0..1. */
  explorationShare: number;
  summary: string;
}

export interface PortfolioOptions {
  /**
   * Share above which one value is dominating its dimension.
   *
   * Half is deliberately permissive. An account with a genuinely strong format
   * should be allowed to lean on it; the rule is about a template becoming the
   * *only* output, not about enforcing an even spread.
   */
  overuseShare?: number;
  /** Above this it is an error rather than a warning. */
  severeShare?: number;
  /** Values the account has declared it wants covered, by dimension. */
  expected?: Record<string, string[]>;
  /** Share of the window that should go to values with no history. */
  explorationTarget?: number;
}

const DEFAULTS = {
  overuseShare: 0.5,
  severeShare: 0.75,
  explorationTarget: 0.2,
};

/**
 * Count each dimension's values across a window of recent work.
 *
 * `items` is expected newest-first, which is how every caller reads it, and
 * `lastUsedIndex` is meaningful only under that ordering.
 */
export function sliceDimensions(items: PortfolioItem[]): DimensionSlice[] {
  const dimensions = new Set<string>();
  for (const item of items) for (const d of Object.keys(item.dimensions)) dimensions.add(d);

  const slices: DimensionSlice[] = [];
  for (const dimension of dimensions) {
    /* Items where the dimension is recorded at all. An absent value is not a
     * value — counting nulls would make "unknown" look like a creative choice. */
    const known = items.filter(
      (i) => i.dimensions[dimension] !== null && i.dimensions[dimension] !== undefined,
    );
    if (known.length === 0) continue;

    const values = new Set(known.map((i) => String(i.dimensions[dimension])));
    for (const value of values) {
      const matching = known.filter((i) => String(i.dimensions[dimension]) === value);
      const lastUsedIndex = items.findIndex(
        (i) => String(i.dimensions[dimension] ?? '') === value,
      );
      slices.push({
        dimension,
        value,
        count: matching.length,
        share: Math.round((matching.length / known.length) * 1000) / 1000,
        lastUsedIndex: lastUsedIndex === -1 ? null : lastUsedIndex,
      });
    }
  }

  return slices.sort((a, b) => b.share - a.share || a.dimension.localeCompare(b.dimension));
}

/**
 * Where the mix has gone wrong, and where it has gone nowhere.
 *
 * Overuse is measured within a dimension, so a dominant treatment is a finding
 * even when the topics beneath it vary. Undercoverage is only meaningful
 * against a declared expectation — inferring what an account *should* cover
 * from what it has covered would make every account permanently correct.
 */
export function analysePortfolio(
  items: PortfolioItem[],
  options: PortfolioOptions = {},
): PortfolioReport {
  const opts = { ...DEFAULTS, ...options };
  const slices = sliceDimensions(items);
  const findings: PortfolioFinding[] = [];
  const gaps: Record<string, string[]> = {};

  if (items.length === 0) {
    return {
      window: 0,
      slices: [],
      findings: [],
      gaps: {},
      explorationShare: 0,
      summary: 'No published work in the window; nothing to balance.',
    };
  }

  for (const slice of slices) {
    if (slice.share > opts.severeShare) {
      findings.push({
        dimension: slice.dimension,
        value: slice.value,
        kind: 'overused',
        severity: 'error',
        share: slice.share,
        message: `${Math.round(slice.share * 100)}% of recent ${slice.dimension} is "${slice.value}". It is not a preference any more, it is the only output.`,
      });
    } else if (slice.share > opts.overuseShare) {
      findings.push({
        dimension: slice.dimension,
        value: slice.value,
        kind: 'overused',
        severity: 'warning',
        share: slice.share,
        message: `${Math.round(slice.share * 100)}% of recent ${slice.dimension} is "${slice.value}".`,
      });
    }
  }

  for (const [dimension, expected] of Object.entries(opts.expected ?? {})) {
    const present = new Set(
      slices.filter((s) => s.dimension === dimension).map((s) => s.value),
    );
    const missing = expected.filter((v) => !present.has(v));
    if (missing.length > 0) gaps[dimension] = missing;
    for (const value of missing) {
      findings.push({
        dimension,
        value,
        kind: 'undercovered',
        severity: 'warning',
        message: `Nothing in the window covers ${dimension} "${value}".`,
      });
    }
  }

  /*
   * Exploration: the share of the window spent on values that have appeared
   * only once. A value used once is one the account has not learned about yet,
   * which is the operational meaning of "untried" over a bounded window.
   */
  const singletons = slices.filter((s) => s.count === 1).length;
  const totalValues = slices.length || 1;
  const explorationShare = Math.round((singletons / totalValues) * 1000) / 1000;

  if (explorationShare < opts.explorationTarget && items.length >= 5) {
    findings.push({
      dimension: '*',
      value: '*',
      kind: 'unexplored',
      severity: 'warning',
      message: `Only ${Math.round(explorationShare * 100)}% of the mix is untried territory, against a target of ${Math.round(opts.explorationTarget * 100)}%. The account is exploiting what it knows and learning nothing new.`,
    });
  }

  const worst = findings.find((f) => f.severity === 'error') ?? findings[0];
  const summary = worst
    ? worst.message
    : `${items.length} posts, ${slices.length} distinct values across ${new Set(slices.map((s) => s.dimension)).size} dimensions. Balanced.`;

  return {
    window: items.length,
    slices,
    findings,
    gaps,
    explorationShare,
    summary,
  };
}

/**
 * What the next post should lean towards, given the mix.
 *
 * Returns values to *prefer*, not a plan — the strategy layer decides what to
 * make, and this says which way the portfolio is leaning so that decision can
 * account for it. Deliberately no ranking against performance: that is
 * `learned_insights`' job, and combining them here would hide which of the two
 * moved a decision.
 */
export function portfolioPreferences(
  report: PortfolioReport,
  dimension: string,
): { avoid: string[]; prefer: string[] } {
  const avoid = report.findings
    .filter((f) => f.kind === 'overused' && f.dimension === dimension)
    .map((f) => f.value);

  const prefer = [
    ...(report.gaps[dimension] ?? []),
    ...report.slices
      .filter((s) => s.dimension === dimension && s.count === 1)
      .map((s) => s.value),
  ];

  return { avoid, prefer: [...new Set(prefer)].filter((v) => !avoid.includes(v)) };
}
