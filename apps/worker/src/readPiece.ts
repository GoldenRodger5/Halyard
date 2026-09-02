/**
 * §475. Running the text critic, where it is worth running.
 *
 * §474 built the critic; this is the caller, and without one it would be the
 * eleventh entry in the decision record's *declared, never executed* column.
 *
 * Placed after the caption is written and **before anything is rendered**,
 * because that is the entire point: the questions it asks are answerable from
 * the words, and asking them here costs one call instead of a render.
 *
 * Failure is never fatal. A critic that could fail a piece would be a model
 * marking a model's work, which this codebase refuses everywhere else; and a
 * critic whose outage stops production is worse than no critic. It observes,
 * the operator decides.
 */
import {
  parseTextCriticReply,
  renderTextPiece,
  textCriticSystemPrompt,
  type LlmClient,
  type TextCriticVerdict,
  type TextPiece,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';

export const TEXT_CRITIC_PROMPT_VERSION = 'text_critic.v1';

export async function readPiece(
  ctx: HandlerContext,
  piece: TextPiece,
  llm: LlmClient,
): Promise<TextCriticVerdict | null> {
  /*
   * Nothing to read is not a clean bill. A transformation has no written slots
   * and a text post is its caption; both are legitimately outside this, and
   * returning null says "did not run" where an empty verdict would say
   * "ran and found nothing".
   */
  if (piece.lines.length === 0) return null;

  try {
    const reply = await llm.complete({
      system: textCriticSystemPrompt(),
      messages: [{ role: 'user', content: renderTextPiece(piece) }],
      maxTokens: 900,
      /*
       * Cool. A critic is looking for specific defects in specific lines, and
       * the failure mode of a warm one is inventing an objection that reads
       * well — which is exactly the thing a critic must never do.
       */
      temperature: 0.2,
      promptVersion: TEXT_CRITIC_PROMPT_VERSION,
    });

    const start = reply.text.indexOf('{');
    const end = reply.text.lastIndexOf('}');
    const verdict =
      start === -1 || end === -1
        ? parseTextCriticReply(null, piece)
        : parseTextCriticReply(JSON.parse(reply.text.slice(start, end + 1)), piece);

    ctx.log('the piece was read', {
      examined: verdict.examined,
      findings: verdict.findings.map((f) => `${f.persona}/${f.rule}`),
      because: verdict.summary,
      costUsd: reply.costUsd,
    });
    return verdict;
  } catch (err) {
    /*
     * Named, not swallowed. §412 is the standing lesson: the frame critic
     * returned 400 on every request for its whole existence while reporting
     * "no frames were available", because a caught error with a plausible
     * message is indistinguishable from a quiet success.
     */
    ctx.log('the piece could not be read', {
      because: (err as Error).message,
      note: 'The critic did not run. This is not a pass.',
    });
    return null;
  }
}
