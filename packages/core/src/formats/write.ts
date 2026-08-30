/**
 * §279. Writing to a format, and refusing what does not fill it.
 *
 * The writer is briefed with the format's slots rather than with a free-form
 * prompt, which is the spec's rule: *"Content should not be generated from a
 * single free-form prompt with no provenance."* A slot has a brief, a word
 * ceiling and a count, and what comes back is checked against all three.
 *
 * ## The part that matters most
 *
 * `sourced` formats — quiz, history, myth/fact, origin — assert things about
 * the world. There is no artifact to check them against, so **each factual
 * claim carries its own citation or the piece is refused.**
 *
 * That is not fussiness. An account whose pitch is "we know what is in your
 * food" cannot be wrong about a date, and a wrong fact is the single most
 * screenshottable mistake available. Gotcha 9 is the same rule one domain over:
 * a claim Halyard cannot point at is one it invented.
 *
 * The refusal is deliberately blunt — a missing citation fails the piece rather
 * than downgrading it — because the alternative is a plausible unsourced fact,
 * which is indistinguishable from a true one until someone checks.
 */
import { expandSlots, requiresCitation, type PostFormat } from './catalog.js';
import { slopFilter } from '../qc/slopFilter.js';

/** One filled slot. */
export interface FilledSlot {
  key: string;
  index: number;
  text: string;
  /**
   * Where this came from, for slots that assert something about the world.
   *
   * A URL or a named authority with a date. Null is legal only on a format
   * whose `factuality` is not `sourced`.
   */
  citation?: string | null;
}

export interface FormatDraft {
  formatId: string;
  slots: FilledSlot[];
}

export interface SlotProblem {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  slot?: string;
}

export interface FormatCheck {
  ok: boolean;
  problems: SlotProblem[];
  /** Slots the format asked for and the draft did not fill. */
  missing: string[];
  summary: string;
}

/**
 * The brief handed to the writer.
 *
 * Built from the format rather than written per format, so adding a format to
 * the catalogue is the whole change — there is no second place to update, which
 * is the failure mode `JOB_KINDS` and `jobs_kind_check` demonstrate (gotcha 1).
 */
export function briefFor(
  format: PostFormat,
  context: { subject: string; audience: string; platform: string },
): string {
  const lines = [
    `Write one ${format.name.toLowerCase()} for ${context.platform}.`,
    `Intent: ${format.intent}`,
    `Subject: ${context.subject}`,
    `Audience: ${context.audience}`,
    '',
    'Fill exactly these slots:',
  ];

  for (const slot of format.slots) {
    const count = slot.repeats ?? 1;
    lines.push(
      `- ${slot.key}${count > 1 ? ` (${count} of them)` : ''}: ${slot.brief} Max ${slot.maxWords} words.`,
    );
  }

  if (requiresCitation(format)) {
    lines.push(
      '',
      'EVERY factual claim needs a citation, and it must be a URL.',
      'The page is fetched and read. A link that does not resolve, or that does',
      'not mention the claim, is rejected and you will be asked again — so an',
      'invented URL costs you the attempt and gains nothing.',
      '',
      'Prefer a stable, public page: an encyclopaedia entry, a university or',
      'government page, a journal abstract, a standards body. Choose a fact you',
      'can actually link, rather than the most interesting one you can recall.',
      'If you cannot link it, choose a different fact.',
    );
  }

  lines.push(
    '',
    'Reply with JSON only:',
    '{"slots":[{"key":"...","index":0,"text":"...","citation":"..."}]}',
  );

  return lines.join('\n');
}

/** Words, counted the way a reader would. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * A citation that is actually a citation.
 *
 * Deliberately shallow: it cannot verify that a source *says* what is claimed,
 * only that something checkable was offered. A URL, or a name with a year.
 * Rejecting "studies show" and "it is widely known" catches the failure that
 * actually happens, which is a confident sentence with nothing behind it.
 */
export function looksCitable(citation: string | null | undefined): boolean {
  if (!citation) return false;
  const text = citation.trim();
  if (text.length < 6) return false;
  if (/^https?:\/\/\S+$/i.test(text)) return true;
  /* A name and a four-digit year is the minimum a reader could go and check. */
  const hasYear = /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text);
  const hasName = /[A-Z][a-z]{2,}/.test(text);
  const vague = /\b(studies show|experts say|it is (widely )?known|research suggests|some say)\b/i;
  return hasYear && hasName && !vague.test(text);
}

/**
 * Check a draft against the format that asked for it.
 *
 * Errors fail the piece; warnings are for an operator to weigh. The split is
 * along the same line the rest of the system draws: a missing slot or an
 * uncited claim is a defect, and prose that runs three words long is a
 * judgement.
 */
export function checkDraft(format: PostFormat, draft: FormatDraft): FormatCheck {
  const problems: SlotProblem[] = [];
  const wanted = expandSlots(format);
  const filled = new Map<string, FilledSlot>();
  for (const slot of draft.slots) {
    filled.set(`${slot.key}:${slot.index}`, slot);
  }

  const missing: string[] = [];
  for (const slot of wanted) {
    const got = filled.get(`${slot.key}:${slot.index}`);
    if (!got || got.text.trim().length === 0) {
      missing.push(slot.repeats && slot.repeats > 1 ? `${slot.key}[${slot.index}]` : slot.key);
      continue;
    }

    const words = wordCount(got.text);
    if (words > slot.maxWords) {
      problems.push({
        rule: 'format.slot_too_long',
        /*
         * A warning, not an error. The slot ceilings are what the layout can
         * hold comfortably, and §264 already refuses to truncate mid-word — so
         * an over-long slot degrades the card rather than breaking it, and an
         * operator can judge whether it is worth another attempt.
         */
        severity: 'warning',
        message: `${slot.key} runs ${words} words against a ${slot.maxWords} ceiling.`,
        slot: slot.key,
      });
    }

    /**
     * §293. Slot text goes through the copy gate, like every other line.
     *
     * `checkDraft` counted words and checked citations and never ran
     * `slopFilter`, so everything the format family writes — every quiz
     * question, every history beat — bypassed the copy quality gate entirely.
     * Em dashes are the visible consequence, and `punctuation.em_dash` calls
     * itself "the single strongest LLM tell" while sitting in a gate this
     * content never reached. Banned phrases and forbidden claims were skipped
     * with it.
     *
     * Errors here fail the slot by name, so the rewrite replaces that line
     * rather than the whole piece.
     */
    const slop = slopFilter({ body: got.text, platform: 'x', hashtags: [] });
    for (const violation of slop.errors) {
      /*
       * §341. A quiz question is a question. `structure.question_density` is a
       * caption rule — a post made of questions reads as engagement bait — and
       * it fired on every slot of a format whose whole shape is questions.
       * A copy gate written for one shape, applied to another where the shape
       * is the point.
       */
      if (slot.isQuestion && violation.rule === 'structure.question_density') continue;
      problems.push({
        rule: violation.rule,
        severity: 'error',
        message: `${slot.key}: ${violation.message}${violation.fix ? ` ${violation.fix}` : ''}`,
        slot: slot.key,
      });
    }

    /*
     * §341. Claims need citations; framing does not. A slot that asserts
     * nothing about the world has nothing to cite, and demanding one burned
     * the writer's retries on a title while the questions went unfixed.
     */
    if (requiresCitation(format) && slot.asserts !== false && !looksCitable(got.citation)) {
      problems.push({
        rule: 'format.uncited_claim',
        severity: 'error',
        message: `${slot.key} asserts something about the world with no citable source.`,
        slot: slot.key,
      });
    }
  }

  /*
   * §342. The checks only a specific format can make.
   *
   * `checkDraft` validates what every format shares — slots filled, words
   * counted, citations present, copy gate passed. It cannot see that a quiz
   * answer is not among its own options, because only a quiz has options.
   *
   * §300 built `checkQuestion` for exactly this and nothing called it, so the
   * one rule that stops a quiz revealing an answer nobody could have chosen was
   * written, tested and unreachable. That is the pattern this codebase keeps
   * finding, and this is where it gets closed.
   */
  problems.push(...checkFormatSpecific(format, draft));

  if (missing.length > 0) {
    problems.push({
      rule: 'format.incomplete',
      severity: 'error',
      message: `The format asked for ${wanted.length} slots and ${missing.length} were not filled: ${missing.join(', ')}.`,
    });
  }

  const errors = problems.filter((p) => p.severity === 'error');
  return {
    ok: errors.length === 0,
    problems,
    missing,
    summary:
      errors.length > 0
        ? `${errors.length} problem${errors.length === 1 ? '' : 's'} that fail the piece.`
        : problems.length > 0
          ? `Fills the format, with ${problems.length} thing${problems.length === 1 ? '' : 's'} to look at.`
          : `Fills all ${wanted.length} slots of the ${format.name.toLowerCase()} format.`,
  };
}

/**
 * Parse a writer reply into a draft, keeping only well-formed slots.
 *
 * Fails closed like every other parser here: an unusable reply yields an empty
 * draft, which `checkDraft` then reports as entirely missing. It never invents a
 * slot to fill a hole.
 */
export function parseDraft(raw: unknown, format: PostFormat): FormatDraft {
  const parsed = raw as { slots?: unknown } | null;
  const list = Array.isArray(parsed?.slots) ? parsed!.slots : [];
  const known = new Set(format.slots.map((s) => s.key));

  const slots: FilledSlot[] = [];
  for (const entry of list) {
    const item = entry as { key?: unknown; index?: unknown; text?: unknown; citation?: unknown };
    if (typeof item.key !== 'string' || !known.has(item.key)) continue;
    if (typeof item.text !== 'string' || item.text.trim().length === 0) continue;
    const index = Number.isInteger(item.index) ? (item.index as number) : 0;
    slots.push({
      key: item.key,
      index,
      text: item.text.trim(),
      citation: typeof item.citation === 'string' && item.citation.trim() ? item.citation.trim() : null,
    });
  }
  return { formatId: format.id, slots };
}


/**
 * §342. Rules that only apply to one shape.
 *
 * Registered per format rather than branched inside `checkDraft`, so a new
 * format adds a function instead of an `if`, and a format with no special rules
 * declares none rather than being absent from a chain of conditions.
 */
const FORMAT_CHECKS: Record<string, (draft: FormatDraft) => SlotProblem[]> = {
  quiz(draft) {
    const problems: SlotProblem[] = [];
    const questions = draft.slots.filter((s) => s.key === 'question');
    const answers = new Map(
      draft.slots.filter((s) => s.key === 'answer').map((s) => [s.index, s]),
    );

    for (const question of questions) {
      const answer = answers.get(question.index);
      if (!answer) {
        problems.push({
          rule: 'quiz.no_answer',
          severity: 'error',
          message: `question[${question.index}] has no answer. A quiz without a reveal is a list of prompts.`,
          slot: 'answer',
        });
        continue;
      }

      /*
       * A question a viewer cannot be right or wrong about is not a quiz
       * question. "Was it the story, the mood, the people, or the night?" was
       * written by a screenplay that bypassed this check entirely (§340) — it
       * reads like a question and has no answer, so the reveal has nothing to
       * reveal.
       */
      if (!/\?\s*$/.test(question.text.trim())) {
        problems.push({
          rule: 'quiz.not_a_question',
          severity: 'error',
          message: `question[${question.index}] is not phrased as a question: "${question.text.slice(0, 48)}".`,
          slot: 'question',
        });
      }

      /*
       * An opinion has no answer to reveal. These openings ask what somebody
       * *feels*, and a quiz that reveals the right feeling is a quiz nobody can
       * lose — which is also a quiz nobody plays.
       */
      if (/^(was it|do you|would you|which do you|how do you|what do you)\b/i.test(question.text.trim())) {
        problems.push({
          rule: 'quiz.opinion_not_fact',
          severity: 'error',
          message:
            `question[${question.index}] asks for an opinion, which has no answer to reveal: ` +
            `"${question.text.slice(0, 48)}".`,
          slot: 'question',
        });
      }
    }

    if (questions.length === 0) {
      problems.push({
        rule: 'quiz.no_questions',
        severity: 'error',
        message: 'A quiz with no questions.',
        slot: 'question',
      });
    }

    return problems;
  },

  myth_fact(draft) {
    const problems: SlotProblem[] = [];
    const myth = draft.slots.find((s) => s.key === 'myth');
    const correction = draft.slots.find((s) => s.key === 'correction');
    /*
     * A myth stated without a correction is a myth post spreading the myth —
     * the worst possible outcome for the format, and the reason §308 puts the
     * "Myth" label on the beat that states it.
     */
    if (myth && !correction) {
      problems.push({
        rule: 'myth_fact.uncorrected',
        severity: 'error',
        message: 'The myth is stated and never corrected, which spreads it.',
        slot: 'correction',
      });
    }
    return problems;
  },
};

export function checkFormatSpecific(format: PostFormat, draft: FormatDraft): SlotProblem[] {
  return FORMAT_CHECKS[format.id]?.(draft) ?? [];
}


/**
 * §343. Fix mechanically what can be fixed mechanically.
 *
 * A Kinolog quiz exhausted all three writing attempts on **curly quotes** and a
 * slot index that started at one instead of zero. Neither is a writing problem.
 * Both were reported as errors, sent back to the model as feedback, and
 * reproduced — because a model asked to avoid a character it does not
 * distinguish will keep producing it, and every attempt spent on that is an
 * attempt not spent on the questions.
 *
 * §287 established the principle for spoken text: `MECHANICALLY_REPAIRABLE`
 * excludes sentence length, because that is a judgement, while "1/4" → "a
 * quarter" is arithmetic. The same line applies here. Punctuation and indexing
 * are transcription; what a question asks is not.
 *
 * Returns what it changed, so a repaired draft is never a silent one.
 */
export interface SlotRepair {
  slot: string;
  from: string;
  to: string;
  because: string;
}

export function repairDraft(
  format: PostFormat,
  draft: FormatDraft,
): { draft: FormatDraft; repairs: SlotRepair[] } {
  const repairs: SlotRepair[] = [];

  const slots = draft.slots.map((slot) => {
    let text = slot.text;

    /*
     * Curly quotes and dashes. Platforms mangle them, `slopFilter` calls the em
     * dash the single strongest LLM tell, and neither carries meaning that a
     * straight equivalent loses.
     */
    const punctuated = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s*\u2014\s*/g, ', ')
      .replace(/\s*\u2013\s*/g, '-');

    if (punctuated !== text) {
      repairs.push({
        slot: slot.key,
        from: text,
        to: punctuated,
        because: 'punctuation a platform mangles, replaced with its straight equivalent',
      });
      text = punctuated;
    }

    return { ...slot, text };
  });

  /*
   * A model that numbers from one produces `question[1..5]` for a format
   * expecting `question[0..4]`, so the first is reported missing and the last
   * is unexpected. Re-based only when the whole run is off by one — a genuine
   * gap must stay a gap, because a missing question is a real defect.
   */
  const byKey = new Map<string, number[]>();
  for (const slot of slots) {
    byKey.set(slot.key, [...(byKey.get(slot.key) ?? []), slot.index]);
  }

  const rebased = slots.map((slot) => {
    const indices = (byKey.get(slot.key) ?? []).slice().sort((a, b) => a - b);
    const expected = expandSlots(format).filter((s) => s.key === slot.key).length;
    const contiguousFromOne =
      indices.length === expected &&
      indices[0] === 1 &&
      indices.every((n, i) => n === i + 1);
    if (!contiguousFromOne) return slot;
    return { ...slot, index: slot.index - 1 };
  });

  if (rebased.some((slot, i) => slot.index !== slots[i]!.index)) {
    repairs.push({
      slot: '(indices)',
      from: '1-based',
      to: '0-based',
      because: 'the whole run was numbered from one, which reads as a missing first slot',
    });
  }

  return { draft: { ...draft, slots: rebased }, repairs };
}
