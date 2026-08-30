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
 *
 * ## §360. Each source is read once per run
 *
 * The first real quiz generation fetched `en.wikipedia.org/wiki/Tortilla_soup`
 * eight times and `vegansociety.com/go-vegan/definition-veganism` five, because
 * a rewrite re-checks every slot and several facts share a source. The page
 * cannot have changed between two fetches ten seconds apart, so every repeat
 * was a wasted eight-second budget — and the run then died on the handler's
 * 300s timeout with the verification loop still going.
 *
 * The cache is per call site, not module-global: a long-lived worker holding
 * pages across jobs would eventually verify a claim against a page that has
 * since changed, which is the failure this whole module exists to prevent.
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

/** One fetched source, kept for the length of a single run. */
interface FetchedSource {
  status: number | null;
  text: string | null;
  contentType: string | null;
}

/** A per-run store of pages already read. Build one with `newSourceCache`. */
export type SourceCache = Map<string, FetchedSource>;

export function newSourceCache(): SourceCache {
  return new Map();
}

export async function checkCitation(
  ctx: HandlerContext,
  input: { claim: string; citation: string },
  fetchImpl: typeof fetch = fetch,
  cache?: SourceCache,
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

  const cached = cache?.get(url);
  if (cached) {
    /*
     * Judged again, not returned again. Two different claims citing one page
     * get two different answers, and only the reading is shared.
     */
    const check = judgeCitation({
      claim: input.claim,
      status: cached.status,
      sourceText: cached.text,
      contentType: cached.contentType,
    });
    ctx.log('citation checked', {
      url,
      verdict: check.verdict,
      status: cached.status,
      matched: check.evidence.matched.length,
      missing: check.evidence.missing.length,
      reread: false,
    });
    return check;
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

    const contentType = response.headers.get('content-type');
    const raw = await response.text();
    const clipped = raw.slice(0, CITATION_MAX_BYTES);
    const text = textFromHtml(clipped);
    cache?.set(url, { status: response.status, text, contentType });

    const check = judgeCitation({
      claim: input.claim,
      status: response.status,
      sourceText: text,
      contentType,
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
    /*
     * A failure is cached too. A host that timed out once will time out again,
     * and spending the eight seconds a second time buys nothing.
     */
    cache?.set(url, { status: null, text: null, contentType: null });
    const check = judgeCitation({ claim: input.claim, status: null, sourceText: null });
    ctx.log('citation unreachable', { url, reason: (err as Error).message });
    return check;
  } finally {
    clearTimeout(timer);
  }
}
