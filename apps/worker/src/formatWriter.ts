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
  parseDraft,
  type FormatDraft,
  type PostFormat,
  type SlotProblem,
  type LlmClient,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';

export const FORMAT_PROMPT_VERSION = 'post_format.v1';

/** How many times a draft may be rewritten before the piece is abandoned. */
export const MAX_FORMAT_ATTEMPTS = 3;

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
): Promise<FormatWriteResult> {
  const system = briefFor(format, context);
  let feedback = '';
  let totalCost = 0;
  let last: SlotProblem[] = [];

  for (let attempt = 1; attempt <= MAX_FORMAT_ATTEMPTS; attempt += 1) {
    const response = await llm.complete({
      system,
      messages: [
        {
          role: 'user',
          content: feedback
            ? `Your previous reply did not fill the format.\n\n${feedback}\n\nWrite it again, fixing exactly those problems.`
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

    const check = checkDraft(format, parsed);
    last = check.problems;

    if (check.ok) {
      ctx.log('format filled', {
        format: format.id,
        attempts: attempt,
        slots: parsed.slots.length,
        warnings: check.problems.length,
      });
      return { draft: parsed, attempts: attempt, costUsd: totalCost, problems: check.problems };
    }

    feedback = check.problems
      .filter((p) => p.severity === 'error')
      .map((p) => `- ${p.message}`)
      .join('\n');

    ctx.log('format not filled, asking again', {
      format: format.id,
      attempt,
      missing: check.missing,
    });
  }

  /*
   * Refused rather than returned half-filled. A quiz missing two of its five
   * questions is not a shorter quiz; it is a post that promises five and
   * delivers three, which is worse than not posting.
   */
  throw new FormatRejectedError(
    `The ${format.name.toLowerCase()} format was not filled after ${MAX_FORMAT_ATTEMPTS} attempts.`,
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
