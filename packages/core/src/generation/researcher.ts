/**
 * §344. The researcher — find the facts before anybody writes them.
 *
 * Every sourced format asks the writer to cite what it says, and nothing ever
 * gave the writer a source. So it invented URLs, the citation gate fetched them,
 * they returned 404, and the piece was refused — three times, then abandoned.
 *
 * That is not a model failure and no amount of retrying fixes it. **An agent
 * asked to remember something it was never told will confabulate**, reliably
 * and confidently, because producing a plausible URL is easier than admitting
 * it has none. The Kinolog quiz failed this way on every attempt.
 *
 * ## The inversion
 *
 * Today: write → cite → verify → refuse. The invention happens first and the
 * check happens last, which is the most expensive possible ordering — a whole
 * draft is discarded because one URL was wrong.
 *
 * Here: find → verify → **then** write from what survived. A source that cannot
 * be read never reaches the writer, so a writer given five verified facts
 * cannot cite a sixth that does not exist. The gate downstream stays, because
 * defence in depth is cheap and a writer can still misattribute a real source
 * to the wrong claim.
 *
 * ## Why a model at all
 *
 * Choosing *what is worth researching* about a subject is judgement, and so is
 * reading a page and deciding whether it supports a claim. Fetching the page and
 * checking the words appear in it is not — that is the verifier's job, and it
 * runs on the model's proposals rather than instead of them.
 *
 * Nothing here knows what a recipe or a film is. It researches a subject.
 */
import { STRATEGY_MODEL, type LlmClient } from './llm.js';

export const RESEARCH_PROMPT_VERSION = 'researcher.v1';

/** A fact with somewhere it can be read. */
export interface SourcedFact {
  /** The claim, in one sentence, as a piece could state it. */
  claim: string;
  /** Where it can be read. A real URL, verified before this is returned. */
  sourceUrl: string;
  /** What the page says, so a writer can check the claim against it. */
  support: string;
  /** How the claim can be put to a viewer. */
  shape: 'year' | 'number' | 'name' | 'yes_no' | 'term' | 'technique';
}

export interface ResearchRequest {
  /** What to research, in the words the piece will use. */
  subject: string;
  /** What the product is, so research is relevant to its audience. */
  productContext: string;
  /** How many verified facts the caller needs. */
  want: number;
  /**
   * Domains a source may come from.
   *
   * Empty means anywhere. A caller that cares — and a sourced format should —
   * passes the kinds of place its claims can defensibly come from, because
   * "a blog agreed with me" is not a source and is very easy to find.
   */
  preferDomains?: string[];
  /**
   * §401. Facts this account has already published, so research finds others.
   *
   * The same subject produced the same facts every time — `research` had a
   * subject and no memory, so gluten always came back as Beccari and 1728. The
   * account said the same thing twice, which is the repetition a viewer
   * actually notices.
   *
   * In the **request**, not as a filter afterwards. Asking for ten facts and
   * discarding the seven already used leaves three, then none, and eventually a
   * piece that cannot be written. Told up front, the model proposes different
   * ones — which is what a researcher who kept notes would do.
   *
   * Never a licence to invent: every fact still goes through `verifySource`.
   * Novelty is a preference among *verified* facts.
   */
  avoid?: string[];
}

export interface ResearchResult {
  facts: SourcedFact[];
  /** Proposals that did not survive verification, and why. */
  rejected: Array<{ claim: string; url: string; because: string }>;
  costUsd: number;
}

const SYSTEM = [
  'You research facts for a short social video. Every fact you give must be checkable by a',
  'stranger following a link.',
  '',
  'Rules:',
  '',
  '- Give the URL of a page you are confident exists and contains the claim. Prefer stable,',
  '  well-known pages: encyclopaedia entries, standards bodies, government and university',
  '  pages, established reference sites, the primary source itself.',
  '',
  '- NEVER construct a URL from a pattern. A guessed slug on a real domain is worse than no',
  '  source: it looks right, resolves to nothing, and takes a reader with it.',
  '',
  '- If you are not confident a page exists, omit the fact. Returning four checkable facts is',
  '  a complete success; returning six with two invented is a failure.',
  '',
  '- The `support` field must be roughly what the page says, in your own words. It is checked',
  '  against the page, so a paraphrase that drifts from the source will be rejected.',
  '',
  '- Prefer facts that are specific and surprising. "Bread contains gluten" is checkable and',
  '  worthless. "Gluten was first isolated in 1728" is both.',
  '',
  '- `shape` is how a viewer could be asked about it: a `year`, a `number`, a `name`, a',
  '  `yes_no`, a `term`, or a `technique`. This decides how the fact can be used, so be exact.',
  '',
  'Reply with JSON only:',
  '{"facts":[{"claim":"one sentence","sourceUrl":"https://...","support":"what the page says",',
  '  "shape":"year|number|name|yes_no|term|technique"}]}',
].join('\n');

/**
 * Propose facts. **Unverified** — the caller must check them.
 *
 * Split from verification on purpose: this half needs a model and a network
 * call, the other half needs only a network call, and keeping them apart means
 * the verification can be tested without a model and reused by anything else
 * that has a claim and a URL.
 */
export async function proposeFacts(
  request: ResearchRequest,
  llm: LlmClient,
): Promise<{ facts: SourcedFact[]; costUsd: number }> {
  const domains = request.preferDomains?.length
    ? `\nPrefer sources from: ${request.preferDomains.join(', ')}.`
    : '';

  /*
   * §401. Capped at twelve. A prompt carrying forty near-identical lines spends
   * its context restating one thing, and the most recent are the ones a viewer
   * would still remember.
   */
  const used = request.avoid?.slice(0, 12) ?? [];
  const avoid = used.length
    ? `\n\nThis account has already published these facts. Do not propose them ` +
      `again, and do not propose a restatement of one:\n` +
      used.map((claim) => `- ${claim}`).join('\n') +
      `\n\nIf the subject genuinely has nothing else worth saying, return fewer ` +
      `facts rather than repeating one or stretching to something you cannot source.`
    : '';

  const reply = await llm.complete({
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Product: ${request.productContext}\n` +
          `Subject: ${request.subject}\n` +
          /*
           * Over-ask, because verification will reject some. A caller wanting
           * five facts and given exactly five gets fewer than five whenever any
           * source fails, which is most of the time.
           */
          `Give up to ${Math.ceil(request.want * 2)} facts.${domains}${avoid}`,
      },
    ],
    maxTokens: 1600,
    /* Low: this is recall, and invention is the failure being designed out. */
    temperature: 0.2,
    model: STRATEGY_MODEL,
    promptVersion: RESEARCH_PROMPT_VERSION,
  });

  return { facts: parseFacts(reply.text), costUsd: reply.costUsd };
}

export function parseFacts(text: string): SourcedFact[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return [];

  let raw: { facts?: unknown };
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as { facts?: unknown };
  } catch {
    return [];
  }

  const shapes = ['year', 'number', 'name', 'yes_no', 'term', 'technique'];
  return (Array.isArray(raw.facts) ? raw.facts : [])
    .map((entry) => {
      const fact = entry as Record<string, unknown>;
      return {
        claim: String(fact.claim ?? '').trim(),
        sourceUrl: String(fact.sourceUrl ?? '').trim(),
        support: String(fact.support ?? '').trim(),
        shape: (shapes.includes(String(fact.shape))
          ? String(fact.shape)
          : 'term') as SourcedFact['shape'],
      };
    })
    .filter((fact) => fact.claim.length > 0 && /^https?:\/\//i.test(fact.sourceUrl));
}

/**
 * §344. Reasons a proposed source is not usable, before anything is fetched.
 *
 * Cheap checks first: a URL that cannot be right is not worth a network call,
 * and the failure modes are recognisable. Every pattern here is one a model
 * actually produces when it is guessing.
 */
export function screenSource(url: string): { ok: boolean; because?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, because: 'not a URL' };
  }

  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, because: 'not http(s)' };

  /*
   * A search results page is not a source. It is a model saying "look it up",
   * and it resolves with a 200, so the fetch check passes and the citation is
   * meaningless.
   */
  if (/\/search|\/results|[?&]q=|[?&]query=/i.test(url)) {
    return { ok: false, because: 'a search page is not a source' };
  }

  /* Placeholder hosts a model reaches for when it has nothing. */
  if (/example\.(com|org|net)|localhost|test\.|\.invalid/i.test(parsed.hostname)) {
    return { ok: false, because: 'a placeholder host' };
  }

  /*
   * A bare domain cannot support a specific claim. "According to britannica.com"
   * is the shape of a citation without being one.
   */
  if (parsed.pathname === '/' || parsed.pathname === '') {
    return { ok: false, because: 'a home page cannot support a specific claim' };
  }

  return { ok: true };
}

export interface SourceVerdict {
  ok: boolean;
  status: number | null;
  /** How much of the support text was found on the page, 0..1. */
  overlap: number;
  because: string;
}

/**
 * Read the page and decide whether it says what was claimed.
 *
 * Two failures are separated because they mean different things: a page that
 * does not resolve is an **invented** source, and a page that resolves without
 * supporting the claim is a **misattributed** one. The first is the model
 * confabulating; the second is it remembering a real page and the wrong thing
 * about it.
 */
export async function verifySource(
  fact: SourcedFact,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<SourceVerdict> {
  const screen = screenSource(fact.sourceUrl);
  if (!screen.ok) return { ok: false, status: null, overlap: 0, because: screen.because! };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(fact.sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Halyard/1.0 (source verification)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        overlap: 0,
        because: `the page returned ${response.status}, so it does not exist as cited`,
      };
    }

    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    /*
     * The distinctive words of the claim and its support. Short words are
     * skipped because every page contains them, and a match on "the" is not
     * evidence of anything.
     */
    const terms = [...new Set(`${fact.claim} ${fact.support}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4))];

    if (terms.length === 0) {
      return { ok: false, status: response.status, overlap: 0, because: 'nothing distinctive to check' };
    }

    const found = terms.filter((term) => text.includes(term)).length;
    const overlap = found / terms.length;

    /*
     * Half. A page supporting a claim contains most of its distinctive words;
     * a page a model half-remembers contains a few. Set from the real Kinolog
     * run, where a genuinely supporting page matched 3 of 4 terms and a
     * misattributed one matched 1 of 3.
     */
    if (overlap < 0.5) {
      return {
        ok: false,
        status: response.status,
        overlap,
        because: `the page exists but only ${Math.round(overlap * 100)}% of the claim's terms appear on it`,
      };
    }

    return { ok: true, status: response.status, overlap, because: 'the page supports the claim' };
  } catch (error) {
    return {
      ok: false,
      status: null,
      overlap: 0,
      because: `the page could not be read: ${(error as Error).message.split('\n')[0]}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Propose, verify, and return only what survived.
 *
 * The whole point: a writer given these cannot cite a source that does not
 * exist, because it was never handed one.
 */
export async function research(
  request: ResearchRequest,
  llm: LlmClient,
  fetchImpl: typeof fetch = fetch,
): Promise<ResearchResult> {
  const { facts, costUsd } = await proposeFacts(request, llm);

  const kept: SourcedFact[] = [];
  const rejected: ResearchResult['rejected'] = [];

  /*
   * Sequential rather than parallel. These are other people's servers, a burst
   * of simultaneous requests from one client is the behaviour that gets a
   * crawler blocked, and a research step is not on a latency budget.
   */
  for (const fact of facts) {
    if (kept.length >= request.want) break;
    const verdict = await verifySource(fact, fetchImpl);
    if (verdict.ok) kept.push(fact);
    else rejected.push({ claim: fact.claim, url: fact.sourceUrl, because: verdict.because });
  }

  return { facts: kept, rejected, costUsd };
}
