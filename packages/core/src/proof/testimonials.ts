/**
 * Social proof, verified. Milestone 45.
 *
 * Fabricated social proof is the one unrecoverable content failure. Everything
 * else this system can get wrong is embarrassing; inventing a person's words is
 * a different category, and it cannot be walked back once it is published.
 *
 * So a testimonial is verified exactly the way a factual claim is: it resolves
 * to a stored row, verbatim, or it does not go out. There is deliberately no
 * "close enough" path and no rephrasing step.
 */

export type ProofSource =
  | 'app_store'
  | 'play_store'
  | 'user_feedback'
  | 'beta_feedback'
  | 'comment'
  | 'email';

export type ConsentState = 'not_asked' | 'granted' | 'declined' | 'public_by_default';

export interface StoredProof {
  id: string;
  source: ProofSource;
  sourceId: string;
  sourceUrl?: string | null;
  authorDisplay?: string | null;
  rating?: number | null;
  title?: string | null;
  /** Verbatim, as stored. */
  body: string;
  consentState: ConsentState;
}

export interface QuotedTestimonial {
  /** The text as it appears in the draft. */
  quote: string;
  /** How the draft attributes it. */
  attribution?: string | null;
  /** The row it claims to come from. */
  proofId?: string | null;
}

export type TestimonialVerdict =
  | { ok: true; proof: StoredProof; trimmed: boolean; note: string }
  | { ok: false; rule: string; message: string; fix: string };

/**
 * Normalise for comparison without licensing a rewrite.
 *
 * Whitespace, smart quotes and a trailing full stop are typography rather than
 * content. Anything beyond that is an edit, and an edit to someone's words is
 * exactly what this is here to catch.
 */
export function normaliseQuote(value: string): string {
  return value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * The one legal edit: dropping words from the middle or the ends, marked with
 * an ellipsis. Everything between the markers must still appear verbatim, in
 * order, in the source.
 */
export function isMarkedTrim(quote: string, source: string): boolean {
  if (!/\.\.\.|…/.test(quote)) return false;

  const segments = quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((segment) => normaliseQuote(segment))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return false;

  const haystack = normaliseQuote(source);
  let cursor = 0;
  for (const segment of segments) {
    const at = haystack.indexOf(segment, cursor);
    if (at === -1) return false;
    cursor = at + segment.length;
  }
  return true;
}

/**
 * Verify one quoted testimonial against the rows actually stored.
 *
 * Fails closed on every ambiguity: no row, no match, an unconsented name, a
 * rating that does not match. There is no verdict that means "probably fine".
 */
export function verifyTestimonial(
  testimonial: QuotedTestimonial,
  stored: StoredProof[],
): TestimonialVerdict {
  const quote = testimonial.quote.trim();
  if (quote.length === 0) {
    return {
      ok: false,
      rule: 'proof.empty',
      message: 'An empty quote was presented as a testimonial.',
      fix: 'Remove it, or quote a real row from /social-proof.',
    };
  }

  const candidates = testimonial.proofId
    ? stored.filter((row) => row.id === testimonial.proofId)
    : stored;

  if (candidates.length === 0) {
    return {
      ok: false,
      rule: 'proof.no_source',
      message: testimonial.proofId
        ? `This post quotes social proof ${testimonial.proofId}, which is not in the database.`
        : 'This post contains a quoted testimonial with no source row attached.',
      fix: 'Attach it from /social-proof. A testimonial that does not resolve to a stored row never publishes — this is the rule that stops invented praise.',
    };
  }

  const normalised = normaliseQuote(quote);

  for (const proof of candidates) {
    const source = normaliseQuote(proof.body);
    const exact = source.includes(normalised);
    const trimmed = !exact && isMarkedTrim(quote, proof.body);

    if (!exact && !trimmed) continue;

    // Consent governs the name, not the quote. A public App Store review is
    // already published under that handle; an email is not.
    const namesAuthor = Boolean(
      testimonial.attribution &&
        proof.authorDisplay &&
        testimonial.attribution.toLowerCase().includes(proof.authorDisplay.toLowerCase()),
    );
    const consentedToName =
      proof.consentState === 'granted' || proof.consentState === 'public_by_default';

    if (namesAuthor && !consentedToName) {
      return {
        ok: false,
        rule: 'proof.no_consent',
        message: `This post names ${proof.authorDisplay}, whose consent state is "${proof.consentState}".`,
        fix: 'Attribute it the way the platform shows it, or ask for consent and record it on /social-proof. A private message is not a public quote.',
      };
    }

    return {
      ok: true,
      proof,
      trimmed,
      note: trimmed
        ? 'Matches the stored review with a marked trim, which is the only edit permitted.'
        : 'Matches the stored review verbatim.',
    };
  }

  return {
    ok: false,
    rule: 'proof.not_verbatim',
    message:
      'The quote does not appear in the review it claims to come from. Even a small rewrite of ' +
      'someone else’s words is a fabrication.',
    fix: 'Quote it exactly, or use "..." to mark what was cut. Nothing else counts as the same sentence.',
  };
}

/**
 * Find quoted passages in a draft.
 *
 * Deliberately generous: it is better to ask about a quotation that turns out to
 * be the product's own words than to miss one that is someone else's.
 */
export function extractQuotes(body: string): string[] {
  const quotes: string[] = [];

  // Explicit escapes, not literal characters. Writing the curly quotes inline
  // is how this silently matched nothing: an editor or a formatter turns them
  // into straight quotes, the class collapses to a duplicate of the next
  // pattern, and every quoted testimonial passes the gate unexamined.
  const CURLY = /[\u201C\u201F]([^\u201C\u201D\u201F]{12,400})[\u201D]/g;
  const STRAIGHT = /"([^"]{12,400})"/g;

  for (const match of body.matchAll(CURLY)) quotes.push(match[1]!.trim());
  for (const match of body.matchAll(STRAIGHT)) quotes.push(match[1]!.trim());

  return [...new Set(quotes)];
}

export interface ProofQCInput {
  body: string;
  /** Rows attached to this item, in the order they were attached. */
  attached: StoredProof[];
  /** Every row available, so an unattached but real quote can still resolve. */
  available?: StoredProof[];
}

export interface ProofQCResult {
  passed: boolean;
  findings: Array<{ rule: string; message: string; fix: string; quote: string }>;
  verified: number;
  summary: string;
}

/**
 * The slop rule the milestone asks for: reject any quoted testimonial that does
 * not resolve to a real row.
 *
 * This is an error rather than a warning. Every other gate in the system has
 * warnings; this one does not, because there is no version of publishing an
 * invented testimonial that is acceptable.
 */
export function runProofQC(input: ProofQCInput): ProofQCResult {
  const quotes = extractQuotes(input.body);
  if (quotes.length === 0) {
    return { passed: true, findings: [], verified: 0, summary: 'no quoted testimonial' };
  }

  const stored = [...input.attached, ...(input.available ?? [])];
  const findings: ProofQCResult['findings'] = [];
  let verified = 0;

  for (const quote of quotes) {
    const verdict = verifyTestimonial(
      { quote, proofId: input.attached.length === 1 ? input.attached[0]!.id : null },
      stored,
    );
    if (verdict.ok) {
      verified++;
      continue;
    }
    findings.push({ rule: verdict.rule, message: verdict.message, fix: verdict.fix, quote });
  }

  return {
    passed: findings.length === 0,
    findings,
    verified,
    summary:
      findings.length === 0
        ? `${verified}/${quotes.length} quotes verified against stored rows`
        : `failed — ${findings[0]!.message}`,
  };
}
