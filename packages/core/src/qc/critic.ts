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
  /**
   * §472. Who objected.
   *
   * Derived from the rule rather than taken from the reply — a model asked to
   * label its own findings will mislabel some, and the mapping is already known
   * here. Shown to an operator because *"the cook winced at this line"* is a
   * different instruction from *"the composition is flat"*, and they are acted
   * on differently.
   */
  persona: CriticPersona;
}

export interface CriticVerdict {
  findings: CriticFinding[];
  /** Frames examined. Zero means the critic ran on nothing and said nothing. */
  examined: number;
  summary: string;
  /**
   * Why the critic could not run, when it could not. §412.
   *
   * Zero `examined` has two causes that must never read the same: nothing was
   * sampled from the render, or the call failed. This client reported the
   * second as the first — *"No frames were available"* — for its entire life,
   * while every request returned 400 on a `metadata` field it did not need.
   */
  unavailableBecause?: string;
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
/**
 * §472. Who is looking, because they do not see the same failures.
 *
 * The critic was one persona — *"a demanding art director"* — and that is the
 * right stance for typography, composition and emphasis. It is the wrong stance
 * for the two questions that actually decide whether a post works:
 *
 * - **Would anyone stop for this?** An art director judges a frame that has
 *   already been looked at. A viewer in a feed gives it a quarter of a second
 *   and is gone. Those are different judgements and the second one is the one
 *   that costs reach.
 * - **Would somebody who knows the subject wince?** A piece can be beautifully
 *   set and wrong, or beautifully set and trivial, and neither is visible to an
 *   eye trained on craft.
 *
 * One call carrying three stances rather than three calls: distinct viewpoints
 * are the point, tripling the cost of every render is not. Each finding is
 * tagged with who objected, so an operator reads *"the cook winced"* rather
 * than an anonymous complaint.
 */
export const CRITIC_PERSONAS = {
  art_director: {
    name: 'a demanding art director',
    stance:
      'You judge the frames as composition. You are looking for craft problems a viewer would feel but not articulate.',
  },
  scroller: {
    name: 'someone scrolling a feed at speed',
    stance:
      'You are not trying to like this. You give the first frame about a quarter of a second and your thumb is already moving. You judge only whether anything here earns the next second, and whether the middle of it holds you or lets you go.',
  },
  cook: {
    name: 'someone who actually knows this subject',
    stance:
      'You cook. You have read the arguments. You judge whether this is right, whether it is worth knowing, and whether it says anything a competent person does not already do. You wince at overstatement.',
  },
} as const;

export type CriticPersona = keyof typeof CRITIC_PERSONAS;

export const CRITIC_QUESTIONS: Array<{ rule: string; question: string; persona: CriticPersona }> = [
  {
    rule: 'critic.uniform_treatment',
    persona: 'art_director' as const,
    question:
      'Is one type treatment — the same size, weight and position — used on every frame? Name the frames.',
  },
  {
    rule: 'critic.flat_emphasis',
    persona: 'art_director' as const,
    question:
      'Does the emphasis stay the same even where the content changes importance, so nothing stands out?',
  },
  {
    rule: 'critic.accidental_space',
    persona: 'art_director' as const,
    question:
      'Is there empty space that reads as a rendering accident rather than a composition choice?',
  },
  {
    rule: 'critic.weak_opening',
    persona: 'art_director' as const,
    question:
      'From the first frame alone, would a viewer know what this is about and want the second?',
  },
  {
    rule: 'critic.interchangeable_frames',
    persona: 'art_director' as const,
    question:
      'Do any two frames differ only in their words — the same layout refilled rather than a new idea?',
  },
  {
    rule: 'critic.covered_by_ui',
    persona: 'art_director' as const,
    question:
      'Is anything important close enough to an edge that the platform’s own buttons or caption bar would cover it?',
  },
  {
    /*
     * §317. The hero was generated from an unrelated artifact headline (§313),
     * so a quiz about the history of gluten sat on a photograph of whatever
     * recipe was adapted that morning. No deterministic check can see that —
     * the frame is well-composed, legible, correctly sized and about the wrong
     * thing. It took an operator saying "the quiz and narrative used the same
     * pic which we don't want".
     */
    rule: 'critic.unrelated_imagery',
    persona: 'art_director' as const,
    question:
      'Does the photograph have anything to do with what the words say? Name the frame where it does not, and say what it shows instead.',
  },
  {
    /*
     * §317. The second half of the same complaint: two pieces from one account
     * carrying the same picture. A frame cannot see the account, but it can see
     * whether the image is generic enough to have been used for anything.
     */
    rule: 'critic.stock_imagery',
    persona: 'art_director' as const,
    question:
      'Could this photograph illustrate any post on this account rather than this one? A picture that fits everything was chosen for nothing.',
  },
  {
    rule: 'critic.reads_automated',
    persona: 'art_director' as const,
    question:
      'Does this look like a person made it, or like a system filled in a shape? Say which frames give it away.',
  },
  /**
   * §472. The feed test. An art director judges a frame that has already been
   * looked at; this judges whether it ever is.
   */
  {
    rule: 'critic.scrolls_past',
    persona: 'scroller' as const,
    question:
      'Frame one, a quarter of a second, thumb already moving: is there anything here that stops it? If it reads as a nice card with words on it, say so.',
  },
  {
    rule: 'critic.loses_you',
    persona: 'scroller' as const,
    question:
      'Somewhere in the middle, does it stop giving you a reason to stay — a stretch where nothing new arrives, or a beat that says what the one before it already said? Name where you would have left.',
  },
  {
    rule: 'critic.looks_generated',
    persona: 'scroller' as const,
    question:
      'Does this look like it was made by a person or produced by a machine? Name the frame that gives it away.',
  },

  /**
   * §472. The expert test. A piece can be beautifully set and wrong, and craft
   * cannot see that.
   */
  {
    rule: 'critic.overstated',
    persona: 'cook' as const,
    question:
      'Is anything here stated more strongly than it deserves — a rule presented as always true, a mechanism simplified into something false? Quote the line.',
  },
  {
    rule: 'critic.not_worth_knowing',
    persona: 'cook' as const,
    question:
      'Would a competent cook already be doing this? If the whole piece is something obvious dressed as a discovery, say so.',
  },
];

/*
 * §317. v2 adds the two imagery questions. Bumped rather than edited in place:
 * a finding recorded under v1 was produced by a critic that was never asked
 * about the picture, and comparing the two as if they were the same reviewer
 * would make the imagery problem look newly introduced.
 */
export const CRITIC_PROMPT_VERSION = 'creative_critic.v2';

export function criticSystemPrompt(): string {
  /**
   * §472. Three stances in one call, each answering only its own questions.
   *
   * Grouped and named rather than merged, because the value is the *difference*
   * between them: an art director and a scrolling viewer disagree about the
   * same frame, and a piece that satisfies both is a much stronger piece than
   * one that satisfies an average of them.
   */
  const byPersona = (Object.keys(CRITIC_PERSONAS) as CriticPersona[])
    .map((key) => {
      const persona = CRITIC_PERSONAS[key];
      const questions = CRITIC_QUESTIONS.filter((q) => q.persona === key);
      if (questions.length === 0) return '';
      return `## As ${persona.name}\n${persona.stance}\n\n${questions
        .map((q) => `- [${q.rule}] ${q.question}`)
        .join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `You are reviewing frames from one short social video, three times over, as three
different people. Answer as each of them in turn. They disagree, and that is the point —
do not average them.

You are NOT checking grammar or brand rules; other systems do that, and duplicating them
wastes the one thing you are here for. Where you are asked about accuracy, judge only what
the frames actually claim.

${byPersona}

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
      /* §472. From the question, not from the reply. Non-null: `known` above. */
      persona: CRITIC_QUESTIONS.find((q) => q.rule === item.rule)!.persona,
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
