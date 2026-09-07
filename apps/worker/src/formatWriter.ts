/**
 * §281. Writing a piece to a format, and refusing what does not fill it.
 *
 * The catalogue (§277), the selector (§278), the slot checker (§279) and the
 * slide builder (§280) all existed and connected to each other, and nothing
 * called any of them. This is the hop that makes the family real.
 *
 * The loop is the same bargain the rest of the system strikes: the model
 * *writes*, `checkDraft` *decides*. A draft that leaves slots empty or asserts
 * something with no citation is refused and rewritten with the problems named,
 * up to a finite budget, and then refused for good.
 *
 * ## Why refusing is right for this
 *
 * A half-filled quiz is not a worse quiz, it is a broken one — three questions
 * where five were promised, or a question whose answer card never comes. And an
 * uncited history post is the failure mode that actually damages an account
 * whose whole pitch is knowing what is true. Neither degrades gracefully, so
 * neither is allowed to degrade.
 */
import {
  briefFor,
  bandFor,
  channelForPlatform,
  lengthBudgetFor,
  PLATFORM_STRATEGIES,
  checkDraft,
  expandSlots,
  repairDraft,
  cutToBudget,
  type EditResult,
  type FormatBudget,
  research,
  parseDraft,
  requiresCitation,
  type FormatDraft,
  type PostFormat,
  type SlotProblem,
  type LlmClient,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';
import { openStage } from './stage.js';
import { checkCitation, newSourceCache } from './citationCheck.js';

export const FORMAT_PROMPT_VERSION = 'post_format.v1';

/** How many times a draft may be rewritten before the piece is abandoned. */
export const MAX_FORMAT_ATTEMPTS = 3;

/**
 * §360. How long the whole write may take.
 *
 * The handler's own budget is 300s. The first real quiz generation spent all of
 * it inside this loop — three attempts, each re-fetching every cited source at
 * up to eight seconds — and was killed mid-verification, which produces the
 * worst possible outcome: a dead job, no piece, and no statement of why.
 *
 * Below the handler's limit on purpose. A loop that gives up with thirty
 * seconds to spare can say what it found; one that is killed cannot.
 */
export const FORMAT_WRITE_BUDGET_MS = 240_000;

/**
 * §360. Whether a slot's claim is the fact research already verified.
 *
 * Research (§344) fetches each source and confirms the page says the thing,
 * before a word is written. The writer then turns that fact into a quiz
 * question — *"In what year was gluten first identified?"* — and §282 re-reads
 * the page and term-matches **the question**, which shares almost nothing with
 * it. The source is fine. The claim is fine. The comparison is wrong.
 *
 * So a slot citing a researched URL is judged against the researched *fact*
 * rather than against the page again. The page was read; reading it twice to
 * compare it with a paraphrase only measures how much the writer rewrote.
 *
 * The misattribution hole this could open — a verified URL pinned to an
 * unrelated claim — is what the overlap test closes. Both strings are short and
 * about one thing, so the comparison is fair in a way page-matching is not.
 */
/**
 * §400. Does the piece, where it cites this source, say what the source says?
 *
 * ## What was wrong
 *
 * This compared **one slot** against the researched fact and demanded a third of
 * the fact's words appear in it. For a quiz that is structurally impossible:
 *
 *   fact:     "Jacopo Beccari isolated gluten in 1728 by washing dough until
 *              only the protein remained"
 *   question: "What year was gluten first identified?"   → 1 word of 11  → 9%
 *   answer:   "1728"                                     → 1 word of 11  → 9%
 *
 * Both refused, three attempts, piece abandoned — which is exactly what
 * happened to the first briefed quiz. **A question that shares a third of the
 * fact's words has given away its own answer**, so the rule was rejecting good
 * writing and could only ever be satisfied by bad writing.
 *
 * ## The rule now
 *
 * A citation is carried by *the slots that cite it*, together — a question and
 * its answer are one assertion split across two fields, not two claims. And
 * what a citation actually pins down is the fact's **specifics**: its numbers
 * and its proper nouns. "1728" appearing in the answer is the citation being
 * honoured; the grammar around it is writing, not evidence.
 *
 * So: if the fact has specifics, the citing text must carry at least one. If it
 * has none — a qualitative claim — the word-overlap test still applies, because
 * then wording is all there is to go on.
 *
 * This is not a loosening. A piece that cites a source and says something else
 * still fails: it will carry none of the fact's specifics and share few of its
 * words. What it stops doing is refusing a well-formed question.
 */

/** Numbers and proper nouns — what a citation actually pins down. */
function specificsOf(fact: string): Set<string> {
  const specifics = new Set<string>();
  /* Numbers, including years, ratios and percentages. */
  for (const m of fact.matchAll(/\d[\d.,:/%-]*/g)) {
    const value = m[0].replace(/[.,]$/, '');
    if (value.length > 0) specifics.add(value.toLowerCase());
  }
  /* Proper nouns: capitalised mid-sentence, so a leading word is not counted. */
  for (const m of fact.matchAll(/(?<=[a-z,;)]\s)([A-Z][a-zA-Z-]{2,})/g)) {
    specifics.add(m[1]!.toLowerCase());
  }
  return specifics;
}

function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

export function matchesResearchedFact(citingText: string, factClaim: string): boolean {
  /*
   * The fact pins down something concrete. Carrying any one of those is the
   * citation being honoured — a quiz answer is often the specific and nothing
   * else, which is the correct way to write one.
   */
  const specifics = specificsOf(factClaim);
  const haystack = citingText.toLowerCase();
  for (const specific of specifics) {
    if (haystack.includes(specific)) return true;
  }

  /*
   * §410. A specific is *sufficient*, not *necessary*.
   *
   * This used to `return false` here, so a fact carrying any number or proper
   * noun could only ever be cited by a line that repeated one of them. That
   * refuses accurate paraphrase: a fact about amylopectin retrogradation, cited
   * by "the starch slowly rearranges into a firmer structure", is the same
   * claim written for a viewer and shares no specific at all.
   *
   * Found live — a `history` piece on why bread goes stale was refused three
   * times and abandoned, with the model converging from five unsupported slots
   * to one and being rejected on a line that was true and sourced. It is §400's
   * shape a second time: a rule demanding surface overlap where correspondence
   * of meaning is what a citation actually asserts.
   *
   * The overlap test below is not a weaker bar, it is the *other* bar. A third
   * of the claim's content words is real evidence the slot is about the fact,
   * and a slot that carries neither a specific nor a third of the words is
   * genuinely citing something it does not say.
   */
  const claim = wordsOf(factClaim);
  if (claim.size === 0) return false;
  const slot = wordsOf(citingText);
  let shared = 0;
  for (const word of claim) if (slot.has(word)) shared += 1;
  return shared / claim.size >= 0.34;
}

/**
 * §469. Sources worth reaching for first, most authoritative first.
 *
 * Deliberately short and deliberately not exclusive. A long list reads as a
 * filter to a model and produces refusals; these are the places a food claim is
 * actually settled, and everything else remains allowed.
 *
 * **§470. Every one of these serves readable HTML, and that is the constraint
 * that matters most.** The first version of this list preferred `doi.org` and,
 * through it, journal portals. Measured on the next run: an MDPI article
 * fetched HTTP 200 and matched **zero** of five claim words, three times, and
 * the piece was abandoned — those pages render their text in JavaScript, so the
 * verifier reads navigation furniture and correctly concludes the source does
 * not support the claim.
 *
 * A preferred source that cannot be *verified* is worse than a general one that
 * can: it fails the piece rather than weakening it. PubMed stays because its
 * abstracts are server-rendered; `doi.org` goes because it resolves to whatever
 * the publisher happens to be.
 */
/**
 * §520. Where a claim about *this* product's subject can be checked.
 *
 * This was one hard-coded list — PubMed, the FDA, the USDA, Serious Eats,
 * King Arthur — which is the right shelf for a recipe app and nonsense for
 * anything else. Kinolog's first piece, on why people scroll for forty
 * minutes without choosing a film, was sent to PubMed and had every source
 * rejected at *0% term overlap*: the researcher doing its job perfectly
 * against a library that could not contain the answer.
 *
 * The domains now come from the product. `GENERAL` is what holds for any
 * subject — encyclopaedias and primary research — and each product adds the
 * shelf its own claims live on. A product with no entry gets `GENERAL` alone,
 * which is honest: a general reference is a weaker source than a specialist
 * one, and handing it another product's shelf would be worse.
 */
const GENERAL_SOURCE_DOMAINS = [
  'britannica.com',
  'pubmed.ncbi.nlm.nih.gov',
  'nature.com',
  'sciencedirect.com',
];

const PRODUCT_SOURCE_DOMAINS: Record<string, string[]> = {
  /* Food science and technique, where a claim about an ingredient is settled. */
  recipefix: [
    'fda.gov',
    'usda.gov',
    'efsa.europa.eu',
    'seriouseats.com',
    'cooksillustrated.com',
    'kingarthurbaking.com',
  ],
  /*
   * Film reference, and the research on choosing. Kinolog's claims are about
   * films, the people who log them, and why choice under abundance is hard —
   * so a film database, a critical archive and the psychology of decision
   * fatigue are the shelves, not a nutrition regulator.
   */
  kinolog: [
    'imdb.com',
    'themoviedb.org',
    'bfi.org.uk',
    'criterion.com',
    'apa.org',
    'jstor.org',
  ],
};

export function preferredDomainsFor(productId: string): string[] {
  return [...(PRODUCT_SOURCE_DOMAINS[productId] ?? []), ...GENERAL_SOURCE_DOMAINS];
}

export interface FormatWriteResult {
  draft: FormatDraft;
  attempts: number;
  costUsd: number;
  problems: SlotProblem[];
  /**
   * §439. What length this was written to, and what it cost.
   *
   * Returned rather than kept internal because the render has to hold the same
   * budget the writer was given — a piece briefed for three questions and
   * rendered with five is the half-wiring this system keeps producing. Null
   * when no band is known for the platform, which is honest and not a default.
   */
  budget: FormatBudget | null;
  /**
   * §440. What the editor removed to make the piece fit, and what that bought.
   *
   * Null when no band is known, which is the same state `budget` reports and
   * for the same reason: there is nothing to fit to.
   */
  edit: EditResult | null;
}

export class FormatRejectedError extends Error {
  constructor(
    message: string,
    readonly problems: SlotProblem[],
    readonly attempts: number,
    /**
     * §507. Which format was refused. An error about a format that does not
     * name it forces every handler to reconstruct it from its own scope, and
     * the one that most needed it — the notification telling an operator why
     * nothing appeared — could not reach it at all.
     */
    readonly formatId: string = 'unknown',
  ) {
    super(message);
    this.name = 'FormatRejectedError';
  }
}

/**
 * Ask for a piece in this format and keep asking until it fills.
 *
 * Feedback names the specific slots that failed rather than restating the
 * brief: "you left `turn` empty and `hook` has no citation" is actionable, and
 * repeating the original instruction is what produces the same reply twice.
 */
export async function writeToFormat(
  ctx: HandlerContext,
  format: PostFormat,
  context: {
    subject: string;
    audience: string;
    platform: string;
    /** §520. Which product's shelf a claim about this subject can be checked on. */
    productId: string;
    /**
     * §401. What this account has already said, so research finds something
     * else and the writer does not open the same way twice.
     *
     * Optional: a caller with no history — a test, the first ever run — passes
     * nothing and gets the previous behaviour, which is correct for a product
     * that genuinely has said nothing yet.
     */
    alreadySaid?: { claims: string[]; openings: string[] };
  },
  llm: LlmClient,
  /**
   * §282. Injected so tests can verify citations without the network.
   *
   * A test that reaches the internet is a test that fails when a page moves,
   * and citation checking is the one thing here that must be reliable enough to
   * refuse a piece.
   */
  fetchImpl: typeof fetch = fetch,
): Promise<FormatWriteResult> {
  /**
   * §439. The length budget, resolved before a word is written.
   *
   * This is the whole point of the model: the duration is decided here, in
   * arithmetic, and handed to the writer as a word count — rather than emerging
   * from whatever the writer happened to produce and being discovered at render
   * time, which is what produced a 53-second piece from a 30-second format.
   *
   * Null where no band is known. That is a real state — Pinterest and Bluesky
   * have no video band — and it means the previous behaviour, not a guess.
   */
  const channel = channelForPlatform(context.platform, 'video');
  const band = channel ? bandFor(context.platform, channel, format.pace) : null;
  const budget = band ? lengthBudgetFor(format, band) : null;
  if (budget) {
    ctx.log('length budget', {
      format: format.id,
      platform: context.platform,
      target: budget.band.targetSeconds,
      predicted: budget.predictedSeconds,
      meetsTarget: budget.meetsTarget,
      ...(budget.reduced.length > 0
        ? { cut: budget.reduced.map((r) => `${r.key} ${r.from}->${r.to}`) }
        : {}),
    });
  }

  const system = briefFor(format, {
    ...context,
    ...(context.alreadySaid?.openings.length
      ? { recentOpenings: context.alreadySaid.openings }
      : {}),
    ...(budget ? { budget } : {}),
    /* §445. What this platform counts, in words a writer can act on. */
    ...(PLATFORM_STRATEGIES[context.platform as keyof typeof PLATFORM_STRATEGIES]
      ? {
          signalBrief:
            PLATFORM_STRATEGIES[context.platform as keyof typeof PLATFORM_STRATEGIES]!.signalBrief,
        }
      : {}),
  });
  let totalCost = 0;

  /**
   * §344/§346. Research before writing, for a format that has to cite.
   *
   * Every sourced format asked the writer to cite what it said and nothing ever
   * gave it a source, so it invented URLs — reliably, because producing a
   * plausible link is easier than admitting it has none. The Kinolog quiz
   * failed this way on all three attempts, on 404s.
   *
   * The facts handed over here have already been fetched and read (§344), so a
   * writer citing one is citing a page that exists and says what it is claimed
   * to say. The citation gate below stays: a writer can still attach a real
   * source to the wrong claim, and defence in depth is cheap.
   *
   * Research failing is not fatal. It returns fewer facts, or none, and the
   * writer falls back to citing from memory — which is exactly as good as it
   * was before, and the gate still refuses what it invents.
   */
  let researched = '';
  /* §360. Kept as data, because verification needs the facts and not the prose. */
  let facts: { claim: string; sourceUrl: string }[] = [];
  const sources = newSourceCache();
  const startedAt = Date.now();
  /*
    §367. Research is its own stage with its own agent, and it happens inside
    the writer. Scoping here rather than at the call site keeps the attribution
    true to what actually ran: every citation check belongs to the researcher,
    not to the copywriter that asked for it.
  */
  const researchCtx = openStage(ctx, 'research');
  if (requiresCitation(format)) {
    const found = await research(
      {
        subject: context.subject,
        productContext: context.audience,
        want: Math.max(3, expandSlots(format, budget?.slots).filter((slot) => slot.asserts !== false).length),
        /**
         * §469. Where to look first, which nothing had ever said.
         *
         * `research()` has taken `preferDomains` since it was written and no
         * caller supplied it, so every search ranked domains equally and the
         * citations that came back were whatever the model reached for —
         * Wikipedia most often.
         *
         * Wikipedia is not banned and should not be: for a historical fact it
         * is exactly what the format's own brief asks for ("an encyclopaedia
         * entry"). But an account whose pitch is that it knows what is in your
         * food is stronger citing the people who measured it, and this is a
         * *preference*, not a filter — research failing entirely is worse than
         * research citing a good general source.
         */
        preferDomains: preferredDomainsFor(context.productId),
        ...(context.alreadySaid?.claims.length
          ? { avoid: context.alreadySaid.claims }
          : {}),
      },
      llm,
      fetchImpl,
    ).catch((error: Error) => {
      researchCtx.log('research failed, writer will cite from memory', { error: error.message });
      return { facts: [], rejected: [], costUsd: 0 };
    });

    researchCtx.log('research', {
      format: format.id,
      kept: found.facts.length,
      rejected: found.rejected.map((r) => `${r.url} — ${r.because}`),
    });
    totalCost += found.costUsd;

    facts = found.facts.map((f) => ({ claim: f.claim, sourceUrl: f.sourceUrl }));
    if (found.facts.length > 0) {
      researched = [
        '',
        'These facts have been checked. Each URL was fetched and the page says what is claimed.',
        'Cite only from this list. Do not write a URL that is not here.',
        '',
        ...found.facts.map((f) => `- ${f.claim}\n  source: ${f.sourceUrl}\n  the page says: ${f.support}`),
      ].join('\n');
    }
  }

  let feedback = '';
  let last: SlotProblem[] = [];

  for (let attempt = 1; attempt <= MAX_FORMAT_ATTEMPTS; attempt += 1) {
    const response = await llm.complete({
      system,
      messages: [
        {
          role: 'user',
          content: feedback
            ? `Your previous reply did not fill the format.\n\n${feedback}\n\nWrite it again, fixing exactly those problems.${researched}`
            : `Write it now, about: ${context.subject}`,
        },
      ],
      maxTokens: 1400,
      promptVersion: FORMAT_PROMPT_VERSION,
    });
    totalCost += response.costUsd;

    /* The model may wrap its reply; take the object and let the parser judge. */
    const start = response.text.indexOf('{');
    const end = response.text.lastIndexOf('}');
    const raw = start >= 0 && end > start ? response.text.slice(start, end + 1) : '{}';

    let parsed: FormatDraft;
    try {
      parsed = parseDraft(JSON.parse(raw), format);
    } catch {
      parsed = { formatId: format.id, slots: [] };
    }

    /**
     * §343. Repair the mechanical, then judge the writing.
     *
     * A Kinolog quiz exhausted all three attempts on curly quotes and 1-based
     * slot indices. Both were reported, fed back, and reproduced — a model
     * asked to avoid a character it does not distinguish will keep producing
     * it, and every attempt spent that way is an attempt not spent on the
     * questions.
     */
    const repaired = repairDraft(format, parsed);
    if (repaired.repairs.length > 0) {
      ctx.log('draft repaired mechanically', {
        format: format.id,
        attempt,
        repairs: repaired.repairs.map((r) => `${r.slot}: ${r.because}`),
      });
      parsed = repaired.draft;
    }

    const check = checkDraft(format, parsed, budget ?? undefined);
    last = check.problems;

    /**
     * §282. For a sourced format, go and read what it cited.
     *
     * `checkDraft` establishes that a citation was offered and has the shape of
     * one. That catches "studies show" and nothing else — the failure that
     * damages an account is a confident, well-formed, **invented** citation.
     *
     * So every cited slot is fetched. A URL that 404s is a hallucinated source;
     * a page that never mentions the claim's distinctive terms is a real URL
     * attached to the wrong thing. Both are rejected, and the specific slot is
     * named so the rewrite can replace that fact rather than starting over.
     *
     * Checked only once the draft is otherwise complete, because verifying the
     * citations of a piece that is going to be rewritten anyway spends network
     * calls to learn nothing.
     */
    if (check.ok && requiresCitation(format)) {
      const unsupported: SlotProblem[] = [];
      for (const slot of parsed.slots) {
        if (!slot.citation) continue;

        /*
         * §360. Already read, during research. The page was fetched and
         * confirmed to say this before a word was written, so the only question
         * left is whether the writer kept the fact it was given.
         */
        const fromResearch = facts.find((f) => slot.citation?.includes(f.sourceUrl));
        if (fromResearch) {
          /*
           * §400. Every slot citing this source, together.
           *
           * A question and its answer are one assertion split across two
           * fields. Checked apart, the question is refused for not stating the
           * fact it exists to ask about — which is what abandoned the first
           * briefed quiz after three attempts.
           */
          const citingTogether = parsed.slots
            .filter((s) => s.citation === slot.citation)
            .map((s) => s.text)
            .join(' ');

          if (matchesResearchedFact(citingTogether, fromResearch.claim)) {
            researchCtx.log('citation checked', {
              url: fromResearch.sourceUrl,
              verdict: 'supported',
              because: 'verified during research, and the slot still says that fact',
            });
            continue;
          }
          unsupported.push({
            rule: 'format.unverified_citation',
            severity: 'error',
            message: `${slot.key}: this cites a checked source but no longer says what that source supports — write the fact it was given, or cite something else.`,
            slot: slot.key,
          });
          continue;
        }

        const verdict = await checkCitation(
          researchCtx,
          { claim: slot.text, citation: slot.citation },
          fetchImpl,
          sources,
        );
        if (verdict.verdict !== 'supported') {
          unsupported.push({
            rule: 'format.unverified_citation',
            severity: 'error',
            message: `${slot.key}: ${verdict.reason}`,
            slot: slot.key,
          });
        }
      }

      if (unsupported.length > 0) {
        last = [...check.problems, ...unsupported];
        feedback = unsupported.map((p) => `- ${p.message}`).join('\n');
        ctx.log('citations did not verify, asking again', {
          format: format.id,
          attempt,
          unsupported: unsupported.length,
        });
        if (Date.now() - startedAt > FORMAT_WRITE_BUDGET_MS) {
          /*
           * §360. Out of time, and saying so is the point. Being killed by the
           * handler timeout mid-fetch produces a dead job with no explanation;
           * this produces a refusal that names what failed.
           */
          ctx.log('format write out of time', {
            format: format.id,
            attempt,
            ms: Date.now() - startedAt,
          });
          break;
        }
        continue;
      }
    }

    if (check.ok) {
      ctx.log('format filled', {
        format: format.id,
        attempts: attempt,
        slots: parsed.slots.length,
        warnings: check.problems.length,
        /* §369. What the attempt count means, rather than only the number. */
        because:
          attempt === 1
            ? `Every slot of the ${format.id} format filled on the first attempt.`
            : `The ${format.id} format filled on attempt ${attempt}; the earlier ones were refused and rewritten with the problems named.`,
      });
      /**
       * §440. The editor, last, on a draft that already passed.
       *
       * Deliberately after the check rather than instead of it: a piece that
       * is over length is not a *defective* piece, it is a long one, and the
       * writer should not lose an attempt to arithmetic it cannot see. The
       * budget in its brief is the first line of defence and shapes the
       * writing; this is the second and only removes.
       *
       * Everything it takes is logged and returned, because a silently shorter
       * video teaches an operator nothing about why.
       */
      if (band) {
        const edit = cutToBudget(format, parsed.slots, band);
        if (edit.cut.length > 0 || edit.stillOver) {
          ctx.log('editor', {
            format: format.id,
            before: edit.beforeSeconds,
            after: edit.afterSeconds,
            cut: edit.cut.map((c) => `${c.what} (${c.saved}s)`),
            ...(edit.stillOver
              ? { stillOver: `${edit.afterSeconds}s against a ${band.ceilingSeconds}s ceiling` }
              : {}),
          });
        }
        return {
          draft: { ...parsed, slots: edit.slots },
          attempts: attempt,
          costUsd: totalCost,
          problems: check.problems,
          budget,
          edit,
        };
      }
      return { draft: parsed, attempts: attempt, costUsd: totalCost, problems: check.problems, budget, edit: null };
    }

    feedback = check.problems
      .filter((p) => p.severity === 'error')
      .map((p) => `- ${p.message}`)
      .join('\n');

    /*
     * §290. Say which rule refused, not only which slots were empty.
     *
     * This logged `missing` alone, so a draft that filled every slot and failed
     * on something else — an uncited claim, an over-long line — reported
     * `missing=[]` and gave no way to tell what had actually happened. Three
     * quiz attempts failed that way and the reason was invisible, which is
     * §262's lesson arriving one module late.
     */
    ctx.log('format not filled, asking again', {
      format: format.id,
      attempt,
      missing: check.missing,
      refusedBy: check.problems
        .filter((p) => p.severity === 'error')
        .map((p) => `${p.rule}${p.slot ? ` (${p.slot})` : ''}`),
      firstReason: check.problems.find((p) => p.severity === 'error')?.message ?? null,
    });
  }

  /*
   * Refused rather than returned half-filled. A quiz missing two of its five
   * questions is not a shorter quiz; it is a post that promises five and
   * delivers three, which is worse than not posting.
   */
  const why = last
    .filter((p) => p.severity === 'error')
    .map((p) => p.message)
    .slice(0, 3)
    .join(' ');
  throw new FormatRejectedError(
    `The ${format.name.toLowerCase()} format was not filled after ${MAX_FORMAT_ATTEMPTS} attempts.${why ? ` ${why}` : ''}`,
    last,
    MAX_FORMAT_ATTEMPTS,
    format.id,
  );
}

/**
 * The formats this account used recently, newest first.
 *
 * Read from `content_items.post_format`, which §281's migration added for
 * exactly this: recency the selector cannot read is recency it cannot honour.
 */
export async function recentFormats(
  ctx: HandlerContext,
  accountId: string,
  limit = 8,
): Promise<string[]> {
  const { rows } = await ctx.pool.query<{ post_format: string }>(
    `select post_format from content_items
      where account_id = $1 and post_format is not null
      order by created_at desc
      limit $2`,
    [accountId, limit],
  );
  return rows.map((r) => r.post_format);
}

/** §558. Bumped whenever the revision prompt changes, so runs stay comparable. */
export const SLOT_REVISION_PROMPT_VERSION = 'slot-revision@1';

/**
 * §558. Act on what the critic said.
 *
 * `readPiece` asks three readers — someone scrolling at speed, someone who
 * knows the subject, a demanding art director — what is wrong with a written
 * piece. It is good at it. A Kinolog piece came back with *"'play the highest
 * overlap' sounds assembled rather than spoken"*, which is exactly right.
 *
 * And the verdict was written to `generation_meta` and nothing else. A piece
 * flagged `text.reads_as_written_by_a_machine` went to the approval queue
 * unchanged, so the critic was an opinion nobody acted on — §533's objection,
 * one layer up, and the finding type has carried the answer in a comment since
 * it was written: *"which slot it is about, so a rewrite knows what to
 * replace."* Nothing replaced anything.
 *
 * ## Why only the named slots
 *
 * Re-running the whole writer would re-research the piece, cost a second
 * research pass, and put good lines at risk to fix one bad one. The findings
 * name their slots, so this asks for replacements for exactly those and leaves
 * the rest alone.
 *
 * ## Why it can never make things worse
 *
 * The revision goes through `checkDraft` — the same gate the original passed —
 * and is discarded whole if it fails. §275's rule stands: the critic may not
 * fail a piece. This is not a veto; a piece whose revision does not survive
 * ships with its original lines and the finding recorded against it.
 */
export async function reviseFlaggedSlots(
  ctx: HandlerContext,
  format: PostFormat,
  draft: FormatDraft,
  findings: Array<{ rule: string; message: string; slot: string | null; persona: string }>,
  llm: LlmClient,
): Promise<{ draft: FormatDraft; revised: string[]; costUsd: number } | null> {
  const named = [...new Set(findings.map((f) => f.slot).filter((s): s is string => Boolean(s)))];
  if (named.length === 0) return null;

  const targets = draft.slots.filter((s) => named.includes(s.key));
  if (targets.length === 0) return null;

  const objections = findings
    .filter((f) => f.slot && named.includes(f.slot))
    .map((f) => `- ${f.slot} — ${f.message} (${f.persona}, ${f.rule})`)
    .join('\n');

  const current = targets.map((s) => `${s.key}: ${s.text}`).join('\n');

  const reply = await llm.complete({
    system:
      'You are rewriting individual lines of a social post that readers objected to. ' +
      'Keep the meaning and the facts; change how it is said. Reply with JSON only: ' +
      'an object mapping each slot key to its replacement line. No other keys, no prose.',
    messages: [
      {
        role: 'user',
        content:
          `The piece is a ${format.name}.\n\nThe lines as written:\n${current}\n\n` +
          `What readers said:\n${objections}\n\n` +
          'Rewrite only these lines. Same length or shorter. Do not answer the objection in the ' +
          'line itself — fix what caused it.',
      },
    ],
    maxTokens: 500,
    temperature: 0.6,
    /* Versioned like every other prompt, so a change to it is attributable. */
    promptVersion: SLOT_REVISION_PROMPT_VERSION,
  });

  try {
    const start = reply.text.indexOf('{');
    const end = reply.text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const replacements = JSON.parse(reply.text.slice(start, end + 1)) as Record<string, unknown>;

    const revised: string[] = [];
    const slots = draft.slots.map((slot) => {
      const next = replacements[slot.key];
      if (typeof next !== 'string' || next.trim().length === 0) return slot;
      if (!named.includes(slot.key)) return slot;
      revised.push(slot.key);
      return { ...slot, text: next.trim() };
    });

    if (revised.length === 0) return null;

    const candidate: FormatDraft = { ...draft, slots };
    const check = checkDraft(format, candidate);
    if (!check.ok) {
      /* §275. The critic may not fail a piece, so a bad revision is dropped. */
      ctx.log('the revision did not hold up, keeping the original lines', {
        because: check.problems
          .filter((p) => p.severity === 'error')
          .map((p) => p.rule)
          .join(', '),
      });
      return null;
    }

    return { draft: candidate, revised, costUsd: reply.costUsd ?? 0 };
  } catch {
    return null;
  }
}
