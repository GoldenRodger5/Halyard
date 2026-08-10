/**
 * Regeneration that learns. Milestone 27, Part G, and the operating model's
 * "my taste should become legible to me, not just to it."
 *
 * Every rejection already carries a reason. This is where the pattern across
 * them gets named — after ten rejections in a category, the system says what
 * they have in common and offers to make it a rule.
 *
 * Two stages on purpose: a cheap deterministic pass finds the obvious clusters
 * without spending a call, and the model is only asked when the reasons do not
 * share vocabulary.
 */
import { extractJson, DRAFT_MODEL, type LlmClient } from './llm.js';

export interface RejectionRecord {
  contentItemId: string;
  category: string;
  reason: string;
  rejectedAt: Date;
}

export interface RejectionCluster {
  pattern: string;
  category: string;
  occurrences: number;
  exampleIds: string[];
  /** A slop-filter rule the operator can accept with one click, if one fits. */
  suggestedRule: string | null;
}

/** v2 G.4's threshold, reused: below this, differences are noise. */
export const CLUSTER_THRESHOLD = 10;

/**
 * Recurring vocabulary in rejection reasons, mapped to the rule it implies.
 * These are the complaints an operator actually types, not a taxonomy invented
 * for the schema.
 */
const KNOWN_PATTERNS: Array<{
  match: RegExp;
  pattern: string;
  rule: string | null;
}> = [
  {
    match: /\b(ad|advert|salesy|sales-y|promo|markety|marketing)\b/i,
    pattern: 'reads like an ad',
    rule: 'Reject copy whose only claim is that the product is good. Every post needs a mechanism or a number.',
  },
  {
    match: /\b(generic|could be any|vague|nothing specific|no specifics?)\b/i,
    pattern: 'too generic to be about anything',
    rule: 'Reject copy with no specific number, ingredient, or named failure mode.',
  },
  {
    match: /\b(mechanism|why|explain|reason)\b.*\b(missing|no|absent|lacking)\b|\bno mechanism\b/i,
    pattern: 'states a fact without the mechanism',
    rule: 'Every claim about a transformation must say why it works, not only that it does.',
  },
  {
    match: /\b(hype|overclaim|exaggerat|too strong|oversell)\w*\b/i,
    pattern: 'overclaims',
    rule: null,
  },
  {
    match: /\b(boring|flat|dull|no tension|forgettable)\b/i,
    pattern: 'no tension in the hook',
    rule: 'Reject a hook with no withheld information and no named problem.',
  },
  {
    match: /\b(long|wordy|rambl|too much)\w*\b/i,
    pattern: 'too long for the format',
    rule: null,
  },
  {
    match: /\b(not my voice|doesn'?t sound like me|not how i)\b/i,
    pattern: 'not the founder voice',
    rule: null,
  },
  {
    match: /\b(cta|call to action|asking|link in bio)\b/i,
    pattern: 'unnecessary call to action',
    rule: 'Most posts have no CTA. Reject a CTA on anything that is not a launch.',
  },
];

/**
 * The cheap pass. Groups by shared vocabulary and returns anything that recurs.
 * No model call, so this can run on every rejection.
 */
export function clusterRejections(
  rejections: RejectionRecord[],
  minOccurrences = 3,
): RejectionCluster[] {
  const buckets = new Map<string, { category: string; ids: string[]; rule: string | null }>();

  for (const rejection of rejections) {
    const known = KNOWN_PATTERNS.find((p) => p.match.test(rejection.reason));
    if (!known) continue;

    const key = `${rejection.category}::${known.pattern}`;
    const bucket = buckets.get(key) ?? { category: rejection.category, ids: [], rule: known.rule };
    bucket.ids.push(rejection.contentItemId);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      pattern: key.split('::')[1]!,
      category: bucket.category,
      occurrences: bucket.ids.length,
      exampleIds: bucket.ids.slice(0, 5),
      suggestedRule: bucket.rule,
    }))
    .filter((cluster) => cluster.occurrences >= minOccurrences)
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Whether it is worth telling the operator anything yet. Below the threshold the
 * honest answer is "not enough rejections to see a pattern".
 */
export function shouldSurfaceClusters(rejections: RejectionRecord[], category: string): boolean {
  return rejections.filter((r) => r.category === category).length >= CLUSTER_THRESHOLD;
}

export const CLUSTER_PROMPT_VERSION = 'rejection_clusters.v1';

/**
 * The expensive pass, for reasons that share no vocabulary. Only called once the
 * threshold is met, and only for rejections the cheap pass could not place.
 */
export async function inferRejectionPattern(
  rejections: RejectionRecord[],
  llm: LlmClient,
): Promise<RejectionCluster[]> {
  if (rejections.length < 3) return [];

  const response = await llm.complete({
    system: `An operator has been rejecting generated social posts and giving a one-line
reason each time. Find what the rejections have in common.

You are looking for the operator's taste, stated as a rule. Be specific: "too
generic" is not useful, "states that a swap works without saying what it does
chemically" is.

Two or three patterns at most. If the reasons genuinely have nothing in common,
say so with an empty array rather than inventing a theme.

Reply with JSON only:
{"clusters":[{"pattern":"one line, in the operator's own terms","occurrences":n,"suggested_rule":"a rule the copy filter could enforce, or null"}]}`,
    messages: [
      {
        role: 'user',
        content: rejections
          .map((r) => `[${r.category}] ${r.reason}`)
          .join('\n')
          .slice(0, 4000),
      },
    ],
    model: DRAFT_MODEL,
    maxTokens: 700,
    promptVersion: CLUSTER_PROMPT_VERSION,
  });

  const parsed = extractJson<{
    clusters?: Array<{ pattern?: string; occurrences?: number; suggested_rule?: string | null }>;
  }>(response.text);

  return (parsed.clusters ?? [])
    .filter((c) => c.pattern)
    .map((c) => ({
      pattern: c.pattern!,
      category: rejections[0]?.category ?? 'all',
      occurrences: c.occurrences ?? rejections.length,
      exampleIds: rejections.slice(0, 5).map((r) => r.contentItemId),
      suggestedRule: c.suggested_rule ?? null,
    }));
}

/**
 * The sentence the dashboard shows. Written to be read once and understood, not
 * to be complete.
 */
export function clusterSummary(cluster: RejectionCluster): string {
  return `Your last ${cluster.occurrences} rejections in ${cluster.category} cluster around one thing: ${cluster.pattern}.`;
}
