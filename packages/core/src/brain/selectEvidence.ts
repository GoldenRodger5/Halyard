/**
 * §322. Which pages an agent is shown, when it cannot be shown all of them.
 *
 * `MAX_EVIDENCE_PER_AGENT` is 6 and Kinolog's site produced 8 pages, sliced
 * `order by collected_at desc`. So two pages were dropped **by when they
 * happened to be fetched**, which has nothing to do with what is in them — and
 * the brain came back with no pricing facts at all despite `/pricing` having
 * been collected with 6,027 characters of prices, limits and plan names. The
 * operator's question was whether the agents had "grabbed the features, goal,
 * audience, payment, sub features"; the answer was no, and this is why.
 *
 * Worse, one of the six slots went to `https://kinolog.app` and another to
 * `https://kinolog.app/` — the same page, fetched twice, because nothing
 * normalised the URL. A duplicate does not merely waste a slot: it displaces a
 * page that had something new in it.
 *
 * ## Ranked, not recent
 *
 * A page's worth to a product-understanding agent is knowable without reading
 * it: a pricing page is where the money is described, an about page is where
 * the mission is, and a login page — 326 characters of "Sign in" — cannot
 * contribute a fact whatever else is competing with it.
 *
 * Deterministic and explainable, so an operator asking "why did it not know
 * about the price" gets an answer rather than a shrug.
 */

export interface EvidenceCandidate {
  id: string;
  sourceUrl: string | null;
  title: string | null;
  body: string;
  collectedAt: Date;
}

/**
 * Path fragments that mark a page as carrying a particular kind of fact.
 *
 * Ordered by how much a *product understanding* depends on them. Pricing first
 * because it is the one thing a marketing system cannot infer and must never
 * guess — a wrong price is a wrong claim on a public post.
 */
const VALUABLE = [
  { match: /pricing|plans?$|upgrade|subscri/i, weight: 100, why: 'prices and plan limits' },
  { match: /^\/?$|^\/index/i, weight: 90, why: 'the landing page' },
  { match: /features?|how-it-works|product/i, weight: 80, why: 'what it does' },
  { match: /about|manifesto|why/i, weight: 70, why: 'what it is for' },
  { match: /compare|vs-|alternatives?/i, weight: 60, why: 'how it positions against others' },
  { match: /faq|help|docs?|support/i, weight: 50, why: 'what users ask' },
  { match: /blog|changelog|news/i, weight: 30, why: 'what is changing' },
];

/**
 * Pages that cannot contribute a product fact however long they are.
 *
 * Not merely low-value — *structurally* incapable. A privacy policy describes
 * data handling in legal language, and a fact drawn from one would be a claim
 * about compliance that no marketing post should ever make.
 */
const WORTHLESS = [
  { match: /login|signin|sign-in|register|signup|sign-up/i, why: 'an auth form has no facts in it' },
  { match: /privacy|terms|legal|cookie/i, why: 'legal text is not a product description' },
  { match: /\/(reset|verify|confirm)/i, why: 'a transactional page' },
];

export interface EvidenceChoice {
  candidate: EvidenceCandidate;
  score: number;
  why: string;
}

/**
 * Normalise a URL so the same page fetched twice is one page.
 *
 * Trailing slash, default ports, `www.`, the fragment, and tracking parameters.
 * Everything here is a difference that cannot change what the page says.
 */
export function canonicalUrl(url: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '');
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) parsed.searchParams.delete(key);
    }
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.hostname}${path}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Choose the pages worth reasoning over, best first.
 *
 * Deduplicates by canonical URL, then by content: two different URLs serving
 * identical text are one page, which is common with a site that renders the
 * same shell at `/` and `/home`.
 */
export function selectEvidence(
  candidates: EvidenceCandidate[],
  limit: number,
): EvidenceChoice[] {
  const seenUrl = new Set<string>();
  const seenBody = new Set<string>();
  const scored: EvidenceChoice[] = [];

  for (const candidate of candidates) {
    const canonical = canonicalUrl(candidate.sourceUrl);
    if (canonical && seenUrl.has(canonical)) continue;

    /*
     * Identical text under two URLs is one page. The length is part of the
     * fingerprint: comparing only a prefix means two long pages that happen to
     * share an opening — a common header, a shared shell — are treated as
     * duplicates and one of them is silently discarded.
     */
    const fingerprint = `${candidate.body.length}:${candidate.body.trim().slice(0, 2000)}`;
    if (candidate.body.length > 200 && seenBody.has(fingerprint)) continue;

    let path = '/';
    try {
      path = new URL(candidate.sourceUrl ?? '').pathname;
    } catch {
      path = candidate.sourceUrl ?? '/';
    }

    const dead = WORTHLESS.find((w) => w.match.test(path));
    if (dead) continue;

    const valuable = VALUABLE.find((v) => v.match.test(path));
    /*
     * Length matters and is not the whole story: a 6,000-character pricing page
     * outranks a 9,000-character blog post, because one of them is about the
     * product and the other is about a topic. Capped so a very long page cannot
     * outrank a purpose-built one on bulk alone.
     */
    const substance = Math.min(20, Math.round(candidate.body.length / 500));
    const score = (valuable?.weight ?? 40) + substance;

    seenUrl.add(canonical);
    seenBody.add(fingerprint);
    scored.push({
      candidate,
      score,
      why: valuable ? valuable.why : 'a product page with no obvious role',
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
