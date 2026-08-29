/**
 * §275. The critic — the agent that should have caught the captions.
 *
 * Every video Halyard made used one caption treatment: 52px, weight 600, on
 * every line of every piece. Nothing flagged it, and a person had to notice.
 *
 * That is an architectural hole, not a missing rule. Halyard had a **describer**
 * (`describeFrames` → what is in the frame) and a **rule set** (banned phrases,
 * contrast ratios, word counts, loudness). Both worked. But "every caption is
 * set the same way, and using the loudest treatment on every line reads as
 * automated" crosses no threshold and violates no rule. Each frame is fine; the
 * *set* of them is the problem.
 *
 * You cannot write a rule for "this is boring". You can put the judgement on the
 * other side of the line this codebase already draws:
 *
 *     Agents perceive, code decides.
 *
 * The critic perceives the craft problem. This module decides what happens to
 * what it says — and what it is not allowed to do.
 *
 * ## What it may not do
 *
 * - **It may never pass anything.** A model marking a model's work is the
 *   fabrication case wearing a nicer hat. It can only ever say something is
 *   wrong; silence from it means nothing.
 * - **It may not fail a piece outright.** Findings are warnings. A critic with a
 *   veto will eventually block a good post over a matter of taste, and the
 *   operator is the one who decides taste here.
 * - **It may not speak without evidence.** A finding that does not cite the
 *   frames it is about is discarded, for the same reason an unsourced claim is:
 *   nobody can act on it and nobody can argue with it.
 *
 * The value is not any single warning — it is that the *same* warning appearing
 * across many pieces is a systemic signal. The caption problem would have shown
 * up as one finding on every video for weeks.
 */

/** What the critic is shown: one frame, already described by the vision step. */
export interface CriticFrame {
  atSeconds: number;
  /** What is visibly happening, in the describer's words. */
  describes: string;
  /** Text burned into the frame, read literally. */
  visibleText: string[];
}

/** A craft problem, tied to the frames that show it. */
export interface CriticFinding {
  /** Stable id, so a recurring problem can be counted across pieces. */
  rule: string;
  severity: 'warning';
  message: string;
  /** Which frames show it. A finding with none is discarded. */
  atSeconds: number[];
}

export interface CriticVerdict {
  findings: CriticFinding[];
  /** Frames examined. Zero means the critic ran on nothing and said nothing. */
  examined: number;
  summary: string;
}

/**
 * The questions the critic is asked.
 *
 * Deliberately specific and observable. "Is this good?" is unanswerable and
 * produces flattery; "is any type treatment used on every frame?" has an answer
 * a describer's output can support.
 *
 * Exported because the prompt and the parser must agree on the rule ids, and
 * because a reader deserves to see what the critic was actually asked.
 */
export const CRITIC_QUESTIONS: Array<{ rule: string; question: string }> = [
  {
    rule: 'critic.uniform_treatment',
    question:
      'Is one type treatment — the same size, weight and position — used on every frame? Name the frames.',
  },
  {
    rule: 'critic.flat_emphasis',
    question:
      'Does the emphasis stay the same even where the content changes importance, so nothing stands out?',
  },
  {
    rule: 'critic.accidental_space',
    question:
      'Is there empty space that reads as a rendering accident rather than a composition choice?',
  },
  {
    rule: 'critic.weak_opening',
    question:
      'From the first frame alone, would a viewer know what this is about and want the second?',
  },
  {
    rule: 'critic.interchangeable_frames',
    question:
      'Do any two frames differ only in their words — the same layout refilled rather than a new idea?',
  },
  {
    rule: 'critic.covered_by_ui',
    question:
      'Is anything important close enough to an edge that the platform’s own buttons or caption bar would cover it?',
  },
  {
    rule: 'critic.reads_automated',
    question:
      'Does this look like a person made it, or like a system filled in a shape? Say which frames give it away.',
  },
];

export const CRITIC_PROMPT_VERSION = 'creative_critic.v1';

export function criticSystemPrompt(): string {
  return `You are a demanding art director reviewing frames from one short social video.

You are looking for craft problems a viewer would feel but not articulate. You
are NOT checking facts, grammar, or brand rules — other systems do that, and
duplicating them wastes the one thing you are here for.

Answer only these questions:

${CRITIC_QUESTIONS.map((q, i) => `${i + 1}. [${q.rule}] ${q.question}`).join('\n')}

Rules:
- Report a problem ONLY if you can name the frames that show it. No frames, no finding.
- Do not report a problem you are unsure about. A false alarm on every video
  trains the reader to ignore you, which is worse than missing one.
- Do not praise anything. Silence means you found nothing worth saying.
- Be specific and concrete. "The type is monotonous" is useless; "every frame
  sets its line at the same large weight, so the hook has no more force than the
  aside at 12s" is actionable.

Reply with JSON only:
{"findings":[{"rule":"critic.uniform_treatment","message":"one sentence","atSeconds":[0,4.2]}]}`;
}

/**
 * Turn a model reply into findings, discarding anything unusable.
 *
 * Fails closed in the direction that matters: a malformed reply yields no
 * findings, never an invented one. The critic going quiet is a much smaller
 * problem than the critic making something up.
 */
export function parseCriticReply(
  raw: unknown,
  frames: CriticFrame[],
): CriticVerdict {
  const known = new Set(CRITIC_QUESTIONS.map((q) => q.rule));
  const times = new Set(frames.map((f) => Number(f.atSeconds.toFixed(2))));

  const parsed = raw as { findings?: unknown } | null;
  const list = Array.isArray(parsed?.findings) ? parsed!.findings : [];

  const findings: CriticFinding[] = [];
  for (const entry of list) {
    const item = entry as { rule?: unknown; message?: unknown; atSeconds?: unknown };
    if (typeof item.rule !== 'string' || !known.has(item.rule)) continue;
    if (typeof item.message !== 'string' || item.message.trim().length < 8) continue;

    /*
     * Frame references are checked against frames that were actually shown. A
     * critique citing a timestamp that does not exist is describing a video it
     * was not given, which is the hallucination case and is dropped whole.
     */
    const cited = Array.isArray(item.atSeconds)
      ? item.atSeconds
          .map((t) => Number(t))
          .filter((t) => Number.isFinite(t))
          .map((t) => Number(t.toFixed(2)))
          .filter((t) => times.has(t))
      : [];
    if (cited.length === 0) continue;

    findings.push({
      rule: item.rule,
      severity: 'warning',
      message: item.message.trim(),
      atSeconds: cited,
    });
  }

  /* One finding per rule: the loudest evidence, not a list of restatements. */
  const byRule = new Map<string, CriticFinding>();
  for (const finding of findings) {
    const existing = byRule.get(finding.rule);
    if (!existing || finding.atSeconds.length > existing.atSeconds.length) {
      byRule.set(finding.rule, finding);
    }
  }
  const deduped = [...byRule.values()];

  return {
    findings: deduped,
    examined: frames.length,
    /*
     * "Nothing found" and "nothing looked at" must not read the same. A critic
     * that ran on zero frames has not endorsed anything.
     */
    summary:
      frames.length === 0
        ? 'No frames were available, so nothing was reviewed.'
        : deduped.length === 0
          ? `${frames.length} frames reviewed, nothing raised.`
          : `${deduped.length} craft problem${deduped.length === 1 ? '' : 's'}: ${deduped
              .map((f) => f.rule.replace('critic.', ''))
              .join(', ')}.`,
  };
}
