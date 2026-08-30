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
  checkDraft,
  expandSlots,
  repairDraft,
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
function matchesResearchedFact(
  slotText: string,
  factClaim: string,
): boolean {
  const words = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const claim = words(factClaim);
  if (claim.size === 0) return false;
  const slot = words(slotText);
  let shared = 0;
  for (const word of claim) if (slot.has(word)) shared += 1;
  /*
   * A third. A question built from a fact keeps its subject and its numbers and
   * discards its grammar, so demanding half would refuse good writing — which
   * is the mistake being fixed, made again with a different number.
   */
  return shared / claim.size >= 0.34;
}

export interface FormatWriteResult {
  draft: FormatDraft;
  attempts: number;
  costUsd: number;
  problems: SlotProblem[];
}

export class FormatRejectedError extends Error {
  constructor(
    message: string,
    readonly problems: SlotProblem[],
    readonly attempts: number,
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
  context: { subject: string; audience: string; platform: string },
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
  const system = briefFor(format, context);
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
        want: Math.max(3, expandSlots(format).filter((slot) => slot.asserts !== false).length),
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

    const check = checkDraft(format, parsed);
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
          if (matchesResearchedFact(slot.text, fromResearch.claim)) {
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
      return { draft: parsed, attempts: attempt, costUsd: totalCost, problems: check.problems };
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
