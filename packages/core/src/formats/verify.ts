/**
 * §282. Checking a citation, rather than checking that one was offered.
 *
 * §279's `looksCitable` asks whether the *shape* of a citation is right. That
 * catches "studies show" and nothing else. The failure that actually damages an
 * account is a **confident, well-formed, invented** citation: a plausible URL
 * that does not exist, or a real URL that says nothing about the claim.
 *
 * This is the deterministic half of the answer. It cannot judge whether a source
 * is *correct* — no code can — but it can establish two things that rule out
 * almost every fabricated citation:
 *
 * 1. **The source resolves.** A hallucinated URL 404s.
 * 2. **The source mentions what is being claimed.** The distinctive terms of
 *    the claim — a year, a surname, a technical noun — appear in the page.
 *
 * A citation that fails either is rejected. One that passes both is *supported*,
 * which is a weaker word than *true* and deliberately so: `verified` here means
 * "a real page exists and it talks about this", and the piece is still a
 * person's judgement to approve.
 *
 * ## Why the terms and not the whole claim
 *
 * Matching whole sentences fails on paraphrase, which is what honest citation
 * looks like. Matching *distinctive* terms — the ones that would not appear by
 * chance — is the check that a page about the right subject passes and a page
 * about something else does not.
 */

/** Words too common to prove anything. Matching on these would pass any page. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
  'from', 'as', 'is', 'was', 'were', 'are', 'be', 'been', 'it', 'its', 'this', 'that',
  'these', 'those', 'has', 'have', 'had', 'not', 'no', 'you', 'your', 'they', 'their',
  'which', 'who', 'what', 'when', 'where', 'why', 'how', 'can', 'will', 'would', 'about',
  'into', 'than', 'then', 'them', 'there', 'here', 'more', 'most', 'some', 'one', 'two',
  'first', 'also', 'because', 'been', 'being', 'over', 'after', 'before', 'other',
]);

/**
 * The terms in a claim that would not appear on an unrelated page.
 *
 * Years and capitalised names are the strongest signals in exactly the kind of
 * factual claim these formats make — "identified in 1728 by Beccari" — so they
 * are kept whatever their length. Everything else has to be a reasonably long
 * word that is not a stopword.
 */
export function distinctiveTerms(claim: string): string[] {
  const terms = new Set<string>();

  for (const year of claim.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) ?? []) terms.add(year);

  /* Capitalised words that are not merely sentence-initial. */
  for (const match of claim.matchAll(/(?<!^)(?<![.!?]\s)\b([A-Z][a-z]{2,})\b/g)) {
    const word = match[1]!;
    if (!STOPWORDS.has(word.toLowerCase())) terms.add(word.toLowerCase());
  }

  for (const word of claim.toLowerCase().match(/\b[a-z][a-z-]{5,}\b/g) ?? []) {
    if (!STOPWORDS.has(word)) terms.add(word);
  }

  return [...terms];
}

export interface CitationEvidence {
  /** Did the source resolve at all? */
  resolved: boolean;
  /** HTTP status, when there was one. */
  status: number | null;
  /** Terms from the claim that appear in the source. */
  matched: string[];
  /** Terms that do not. */
  missing: string[];
}

export type CitationVerdict =
  | 'supported'
  | 'unsupported'
  | 'unreachable'
  | 'not_a_url'
  /**
   * §360. The source resolves and this cannot read it.
   *
   * A PDF answers 200 and `textFromHtml` finds nothing in it, so the term match
   * scores zero and the old code reported *"the source does not mention this
   * claim"* — which is a statement about the page, and it is false. The page may
   * say exactly that. What is true is that the checker cannot see inside it.
   *
   * Kept apart from `unsupported` because the two ask the writer for different
   * things: `unsupported` means find a different fact, `unreadable` means cite
   * the same fact from a page that can be read.
   */
  | 'unreadable';

export interface CitationCheck {
  verdict: CitationVerdict;
  evidence: CitationEvidence;
  /** One line an operator reads. */
  reason: string;
}

/**
 * How much of the claim a source has to mention.
 *
 * Not all of it: an honest source paraphrases, and a page about Beccari and 1728
 * need not repeat every noun in the sentence written about it. Half of the
 * distinctive terms is enough to establish the page is about this subject, and
 * low enough not to punish good writing.
 */
export const MIN_TERM_COVERAGE = 0.5;

/** Whether the citation is a URL this can actually go and read. */
export function citationUrl(citation: string): string | null {
  const match = citation.match(/https?:\/\/[^\s)>\]"']+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Judge a fetched source against the claim it is cited for.
 *
 * Pure: the fetching happens in the worker, and this decides. Same split as
 * every other gate — perception outside, judgement here, testable without a
 * network.
 */
export function judgeCitation(input: {
  claim: string;
  status: number | null;
  /** The source's text, already stripped of markup. Null when unreachable. */
  sourceText: string | null;
  /** The `content-type` the source answered with, when there was one. */
  contentType?: string | null;
}): CitationCheck {
  const terms = distinctiveTerms(input.claim);

  if (input.status === null || input.sourceText === null) {
    return {
      verdict: 'unreachable',
      evidence: { resolved: false, status: input.status, matched: [], missing: terms },
      reason:
        input.status === null
          ? 'The source could not be fetched, so nothing about it is established.'
          : `The source returned HTTP ${input.status}.`,
    };
  }

  if (input.status < 200 || input.status >= 300) {
    return {
      verdict: 'unreachable',
      evidence: { resolved: false, status: input.status, matched: [], missing: terms },
      reason: `The source returned HTTP ${input.status}, so it does not exist as cited.`,
    };
  }

  /*
   * §360. Before the term match, because a format this cannot read scores zero
   * matches and would otherwise be reported as a page that is about something
   * else. HTML and plain text are readable; a PDF, an image or an office
   * document is not, and saying so is the honest answer.
   */
  const type = (input.contentType ?? '').toLowerCase();
  const readable = !type || type.includes('html') || type.includes('text/plain') || type.includes('xml');
  if (!readable) {
    return {
      verdict: 'unreadable',
      evidence: { resolved: true, status: input.status, matched: [], missing: terms },
      reason: `The source resolves but is ${type.split(';')[0]}, which cannot be read here — cite a page rather than a file.`,
    };
  }

  const haystack = input.sourceText.toLowerCase();
  const matched = terms.filter((t) => haystack.includes(t));
  const missing = terms.filter((t) => !haystack.includes(t));

  /*
   * A claim with no distinctive terms cannot be checked this way. Reported as
   * unsupported rather than passed: an unverifiable claim in a format that
   * requires verification is exactly what this exists to stop.
   */
  if (terms.length === 0) {
    return {
      verdict: 'unsupported',
      evidence: { resolved: true, status: input.status, matched: [], missing: [] },
      reason: 'The claim has no distinctive terms, so no source could confirm it.',
    };
  }

  const coverage = matched.length / terms.length;
  if (coverage >= MIN_TERM_COVERAGE) {
    return {
      verdict: 'supported',
      evidence: { resolved: true, status: input.status, matched, missing },
      reason: `The source resolves and mentions ${matched.length} of ${terms.length} distinctive terms.`,
    };
  }

  return {
    verdict: 'unsupported',
    evidence: { resolved: true, status: input.status, matched, missing },
    reason: `The source resolves but mentions only ${matched.length} of ${terms.length} distinctive terms (${missing.slice(0, 4).join(', ')} absent), so it does not appear to be about this claim.`,
  };
}

/** Strip markup and script so the term match reads what a person would read. */
export function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}
