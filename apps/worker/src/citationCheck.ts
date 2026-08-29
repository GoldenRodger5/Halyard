/**
 * §282. Going and reading the source.
 *
 * The fetching half of citation verification. `judgeCitation` in core decides;
 * this only goes and gets the page, which is the split every gate here uses —
 * perception at the edge, judgement in a pure function that tests can reach
 * without a network.
 *
 * Deliberately strict about what it will fetch:
 *
 * - **HTTPS and HTTP only.** A `file:` or `data:` citation is not a source.
 * - **A short timeout.** A slow source is an unusable one, and a generation run
 *   cannot hang on somebody's server.
 * - **A size ceiling.** The terms being matched appear early in any page that is
 *   really about the subject, and reading fifty megabytes to find a surname is a
 *   way to be denial-of-serviced by a citation.
 */
import {
  citationUrl,
  judgeCitation,
  textFromHtml,
  type CitationCheck,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';

/** Long enough for a slow server, short enough not to stall a run. */
export const CITATION_TIMEOUT_MS = 8_000;

/** Enough of a page to find a surname and a year in. */
export const CITATION_MAX_BYTES = 512 * 1024;

export async function checkCitation(
  ctx: HandlerContext,
  input: { claim: string; citation: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CitationCheck> {
  const url = citationUrl(input.citation);
  if (!url) {
    /*
     * A named citation with no URL — "Beccari, 1728" — is not checkable by this
     * route. Reported honestly rather than passed: in a format that requires
     * verification, unverifiable is a refusal.
     */
    return {
      verdict: 'not_a_url',
      evidence: { resolved: false, status: null, matched: [], missing: [] },
      reason: 'The citation names a source but gives no link, so nothing could be read.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CITATION_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        /* Identifying, because a scraper that lies about itself is worse. */
        'user-agent': 'Halyard/1.0 (citation verification)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    const raw = await response.text();
    const clipped = raw.slice(0, CITATION_MAX_BYTES);
    const check = judgeCitation({
      claim: input.claim,
      status: response.status,
      sourceText: textFromHtml(clipped),
    });

    ctx.log('citation checked', {
      url,
      verdict: check.verdict,
      status: response.status,
      matched: check.evidence.matched.length,
      missing: check.evidence.missing.length,
    });
    return check;
  } catch (err) {
    const check = judgeCitation({ claim: input.claim, status: null, sourceText: null });
    ctx.log('citation unreachable', { url, reason: (err as Error).message });
    return check;
  } finally {
    clearTimeout(timer);
  }
}
