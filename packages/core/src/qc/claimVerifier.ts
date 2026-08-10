/**
 * Gate 2 — Factual verification. v2 Part F.2.
 *
 * Every factual claim must trace to the product_artifact. The copywriter returns
 * claims alongside the copy:
 *
 *   { "body": "...", "claims": [
 *       { "text": "GF flour needs 25 degrees less heat",
 *         "source": "steps[3].updated_note" } ] }
 *
 * This resolves each `source` path against the stored artifact and confirms the
 * claim is actually supported. Unresolvable path, or claim not supported →
 * reject and regenerate.
 *
 * The same principle as RecipeFix's own compliance scanner: do not trust the
 * model's output, verify it deterministically.
 */

export interface Claim {
  text: string;
  /** JSON path into the artifact, e.g. 'ingredients[4].changeReason'. */
  source: string;
}

export type ClaimVerdict =
  | 'verified'
  | 'unresolvable_path'
  | 'unsupported'
  | 'hard_blocked'
  | 'needs_review';

export interface ClaimResult {
  claim: Claim;
  verdict: ClaimVerdict;
  /** 0..1 lexical overlap between the claim and the resolved source text. */
  support: number;
  resolved?: string;
  message: string;
}

export interface ClaimVerificationResult {
  passed: boolean;
  verified: number;
  total: number;
  results: ClaimResult[];
  /** Rendered for the queue: "3/3 verified against artifact". */
  summary: string;
}

/**
 * v2 F.2 — hard blocks regardless of source. A claim in one of these categories
 * cannot be rescued by pointing at an artifact field.
 */
const HARD_BLOCKED_CLAIM_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\b(accurate|verified|exact|precise|guaranteed)\b[^.]{0,30}\b(nutrition|macros|calorie)/i,
    why: 'nutrition accuracy',
  },
  {
    pattern: /\bnutrition\b[^.]{0,20}\b(is|are)\b[^.]{0,20}\b(accurate|verified|exact)\b/i,
    why: 'nutrition accuracy',
  },
  { pattern: /\bperfect\s*1\s*[:-]\s*1\b|\bperfect\s+one[- ]to[- ]one\b/i, why: 'perfect 1:1 substitution' },
  {
    pattern: /\b(safe for (celiacs?|coeliacs?)|allergy[- ]safe|guaranteed (gluten|dairy|nut)[- ]free)\b/i,
    why: 'medical or allergy-safety guarantee',
  },
  { pattern: /\bbetter than\s+\w+\b/i, why: 'competitor comparison' },
];

/** Support threshold. Below this a claim is not considered traceable. */
export const SUPPORT_THRESHOLD = 0.34;
/** Between this and SUPPORT_THRESHOLD the claim is flagged for a human read. */
export const REVIEW_THRESHOLD = 0.22;

/**
 * Resolve a dotted / bracketed path against an object.
 * Returns undefined for any path that does not exist — never throws, because an
 * unresolvable path is a verdict, not an exception.
 */
export function resolvePath(root: unknown, path: string): unknown {
  if (!path) return undefined;
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'it', 'its',
  'this', 'that', 'these', 'those', 'you', 'your', 'we', 'our', 'will', 'can',
  'not', 'so', 'than', 'then', 'more', 'less', 'about', 'into', 'up', 'down',
]);

/** Content words, lower-cased, light stemming so 'strengthens' matches 'strengthen'. */
export function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map(stem);
}

function stem(word: string): string {
  return word
    .replace(/(ies)$/, 'y')
    .replace(/(sses|shes|ches|xes)$/, '')
    .replace(/(ing|ers|ed|es|s)$/, '')
    .replace(/-+$/, '');
}

/**
 * Lexical support: what share of the claim's content words appear in the source,
 * with numbers weighted heavily. "25 degrees" matching matters far more than
 * "flour" matching, because a wrong number is the failure that actually costs
 * something.
 */
export function supportScore(claimText: string, sourceText: string): number {
  const claimTokens = contentTokens(claimText);
  if (claimTokens.length === 0) return 0;
  const sourceTokens = new Set(contentTokens(sourceText));
  const sourceNumbers = new Set(sourceText.match(/\d+(?:[./]\d+)?/g) ?? []);

  let weightTotal = 0;
  let weightMatched = 0;

  for (const token of claimTokens) {
    const isNumber = /^\d/.test(token);
    const weight = isNumber ? 3 : 1;
    weightTotal += weight;
    const matched = isNumber
      ? sourceNumbers.has(token) || sourceTokens.has(token)
      : sourceTokens.has(token);
    if (matched) weightMatched += weight;
  }

  // Any number in the claim that is absent from the source is disqualifying: a
  // fabricated temperature is the exact failure this gate exists to catch.
  const claimNumbers = claimText.match(/\d+(?:[./]\d+)?/g) ?? [];
  for (const n of claimNumbers) {
    if (!sourceNumbers.has(n) && !numberAppearsAsWords(n, sourceText)) return 0;
  }

  return weightTotal === 0 ? 0 : weightMatched / weightTotal;
}

/** '450' also counts as present when the source spells it "four hundred fifty". */
function numberAppearsAsWords(numeral: string, source: string): boolean {
  const words: Record<string, string[]> = {
    '1': ['one'], '2': ['two'], '3': ['three'], '4': ['four'], '5': ['five'],
    '6': ['six'], '7': ['seven'], '8': ['eight'], '9': ['nine'], '10': ['ten'],
    '25': ['twenty five', 'twenty-five'], '450': ['four hundred fifty'],
    '475': ['four hundred seventy five'],
  };
  const candidates = words[numeral];
  if (!candidates) return false;
  const lower = source.toLowerCase();
  return candidates.some((c) => lower.includes(c));
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function verifyClaims(
  claims: Claim[],
  artifact: unknown,
): ClaimVerificationResult {
  const results: ClaimResult[] = claims.map((claim) => {
    const blocked = HARD_BLOCKED_CLAIM_PATTERNS.find((r) => r.pattern.test(claim.text));
    if (blocked) {
      return {
        claim,
        verdict: 'hard_blocked' as const,
        support: 0,
        message: `Hard block: ${blocked.why}. No artifact field can support this claim.`,
      };
    }

    if (!claim.source || !claim.source.trim()) {
      return {
        claim,
        verdict: 'unresolvable_path' as const,
        support: 0,
        message: 'Claim carries no source path. Every factual claim must trace to the artifact.',
      };
    }

    const resolvedValue = resolvePath(artifact, claim.source);
    if (resolvedValue === undefined || resolvedValue === null || stringify(resolvedValue) === '') {
      return {
        claim,
        verdict: 'unresolvable_path' as const,
        support: 0,
        message: `Path '${claim.source}' does not resolve against the artifact.`,
      };
    }

    const resolved = stringify(resolvedValue);
    const support = supportScore(claim.text, resolved);

    if (support >= SUPPORT_THRESHOLD) {
      return {
        claim,
        verdict: 'verified' as const,
        support: Number(support.toFixed(2)),
        resolved,
        message: 'Supported by the artifact.',
      };
    }
    if (support >= REVIEW_THRESHOLD) {
      return {
        claim,
        verdict: 'needs_review' as const,
        support: Number(support.toFixed(2)),
        resolved,
        message: 'Only partly supported by the source field. Read it before approving.',
      };
    }
    return {
      claim,
      verdict: 'unsupported' as const,
      support: Number(support.toFixed(2)),
      resolved,
      message: `Path resolves, but the claim is not supported by what it points at.`,
    };
  });

  const verified = results.filter((r) => r.verdict === 'verified').length;
  const blocking = results.filter(
    (r) => r.verdict === 'unresolvable_path' || r.verdict === 'unsupported' || r.verdict === 'hard_blocked',
  );

  return {
    passed: blocking.length === 0,
    verified,
    total: results.length,
    results,
    summary:
      results.length === 0
        ? 'no claims'
        : `${verified}/${results.length} verified against artifact`,
  };
}
