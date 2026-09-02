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
import type { FormatBudget } from '../creative/length.js';
import { THUMBNAIL_WORDS } from '../qc/retentionQC.js';
import { checkQuestion, planQuestion } from './quiz.js';
import { isPostShaped, slopFilter } from '../qc/slopFilter.js';

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
  context: {
    subject: string;
    audience: string;
    platform: string;
    /**
     * §401. How recent pieces opened, so this one does not open the same way.
     *
     * A *new* fact asked as "What year was X first identified?" for the fourth
     * time is still repetition — the surface repeats even when the substance
     * does not. Research exclusion fixes the substance; this fixes the shape.
     */
    recentOpenings?: string[];
    /**
     * §439. How long each slot has, on this platform, for this piece.
     *
     * The writer decides the duration — length is `words / 2.6 + 1.05` per
     * line and nothing else — and until now it was never told what duration it
     * was writing to. `quiz` declared thirty seconds and briefed a structure
     * whose ceilings imply seventy-six, so it wrote seventy-six.
     *
     * Optional, and absent means the format's own maxima: the previous
     * behaviour, and the right answer for a carousel or a caller with no
     * platform in hand.
     */
    budget?: FormatBudget;
    /**
     * §445. What this platform counts, as instructions.
     *
     * `PLATFORM_STRATEGIES` has held a strategic model of all seven platforms
     * since P2 and exactly one thing read it — a page in the web app that
     * *displays* it. So the strategy was written down, kept current, shown to
     * an operator, and never once changed a piece of content.
     *
     * These lines are the half a writer can act on. TikTok ranks on completion
     * and Shorts on what happens after the watch, and a piece written for one
     * is genuinely a different piece from one written for the other — which is
     * what a social team means by "per platform", as opposed to the same post
     * with a different caption.
     */
    signalBrief?: string[];
  },
): string {
  const lines = [
    `Write one ${format.name.toLowerCase()} for ${context.platform}.`,
    `Intent: ${format.intent}`,
    `Subject: ${context.subject}`,
    `Audience: ${context.audience}`,
    '',
    'Fill exactly these slots:',
  ];

  const budgeted = new Map((context.budget?.slots ?? []).map((b) => [b.key, b]));
  for (const slot of format.slots) {
    const fitted = budgeted.get(slot.key);
    const count = fitted ? fitted.repeats : (slot.repeats ?? 1);
    const maxWords = fitted ? fitted.maxWords : slot.maxWords;
    /**
     * §458. A target, not a ceiling — where a budget decided the number.
     *
     * "Max N words" is read as a limit to stay well under, and the writer does:
     * measured on a real TikTok history, **44 words written against a 90-word
     * budget**, 49% of it. The piece rendered at 22.6 seconds against a
     * 40-second target — inside the band and nowhere near the length that
     * performs, with more than half the runtime unused.
     *
     * The budgeted number is not a limit. It *is* the runtime: every word is
     * spoken, so writing half of them makes a piece half as long. Saying "about
     * N" is the whole difference, and it costs nothing.
     *
     * The format's own `maxWords` stays a ceiling when there is no budget —
     * there the number really is a limit, because nothing has reasoned about
     * how long the piece should be.
     */
    lines.push(
      fitted
        ? `- ${slot.key}${count > 1 ? ` (${count} of them)` : ''}: ${slot.brief} Write about ${maxWords} words.`
        : `- ${slot.key}${count > 1 ? ` (${count} of them)` : ''}: ${slot.brief} Max ${maxWords} words.`,
    );
  }

  /*
   * §448. The opening slot is the thumbnail, and it is the only slot whose
   * ceiling is about being *seen* rather than about fitting a card.
   *
   * Said separately from the slot line above because it is a different kind of
   * constraint and a model handed "max 12 words" alongside every other slot
   * treats it as one more layout limit. It is the frame that decides whether
   * anything else is read.
   */
  const opening = format.slots.find((slot) => slot.opensThePiece);
  if (opening) {
    lines.push(
      '',
      `The ${opening.key} is frame one, which is the thumbnail — in a feed it is`,
      `all most people will ever see of this. ${THUMBNAIL_WORDS.min} to ${THUMBNAIL_WORDS.max} words is`,
      'what reads at a glance in a small preview. Write it to be understood with',
      'no other line for context, and make it a statement rather than a question:',
      'a question can be answered by scrolling past.',
    );
  }

  /*
   * §439. Why the ceilings are what they are, said once.
   *
   * A model handed a tighter-than-usual limit with no reason writes the same
   * sentence and trims the end off it. Told that the limit *is* the runtime and
   * that the platform ranks on finishing, it writes a shorter sentence — which
   * is a different and much better thing.
   */
  if (context.budget) {
    const { band, predictedSeconds, reduced } = context.budget;
    lines.push(
      '',
      `This is a ${band.targetSeconds}s piece for ${context.platform}. Every word is spoken`,
      `aloud at about 2.6 words a second, so the word counts above are the runtime:`,
      `written to them this runs about ${Math.round(predictedSeconds)}s.`,
      band.because,
      /*
       * §458. Both directions, because only one of them was ever a risk.
       *
       * The original said "do not write to the ceiling and trim" and the writer
       * obliged so thoroughly that pieces came in at half their runtime. Coming
       * up short is not a smaller version of the same mistake — it is the one
       * that actually happened, and it costs the room the platform rewards.
       */
      'Those counts are a target and not a limit. Coming in well under them makes',
      'the piece too short to be worth watching, which costs more than running long.',
      'Write the short version of each line, but write all of it.',
    );
    if (reduced.length > 0) {
      lines.push(
        '',
        `This platform affords fewer of some slots than the format allows: ` +
          reduced.map((r) => `${r.key} is ${r.to}, not ${r.from}`).join('; ') + '.',
        'Choose the strongest, not the first. There is no partial credit for the ones left out.',
      );
    }
  }

  /*
   * §411. The rules this writing is judged by, stated before it is written.
   *
   * `checkDraft` runs `slopFilter` over every slot, and the brief never said
   * so. The writer therefore discovered the house style one refusal at a time:
   * live, a `history` piece spent two of its three attempts on citations and
   * the third on a hype comparative it had never been told to avoid, and was
   * abandoned. The attempt budget exists for genuine misses, not for teaching
   * the rules.
   *
   * The four constructions are named individually because they are the ones
   * `slopFilter` refuses outright and they are the ones a model reaches for
   * unprompted. The banned-phrase list is not pasted in — forty-five phrases is
   * a wall a model skims, and naming the *shape* refuses the whole family
   * rather than the entries someone happened to list.
   */
  lines.push(
    '',
    'House style, which this will be refused for breaking:',
    '- No "more than just X", "not just X but Y", "whether you\'re X or Y", or',
    '  "that\'s where X comes in". These are the tells, and they are refused.',
    '- No hype: nothing is a game changer, revolutionary, or a secret.',
    '- No em dashes, no curly quotes, no emoji.',
    '- Write the claim plainly. A sentence that survives having its adjectives',
    '  removed is the sentence to write.',
  );

  if (context.signalBrief?.length) {
    lines.push(
      '',
      `What ${context.platform} actually rewards, which decides how this is written:`,
      ...context.signalBrief.map((line) => `- ${line}`),
    );
  }

  /*
   * §401. Six, and only the openings. More becomes a wall of text the model
   * skims, and the opening is the part a viewer actually recognises.
   */
  const recent = context.recentOpenings?.slice(0, 6) ?? [];
  if (recent.length > 0) {
    lines.push(
      '',
      'This account opened its recent posts like this. Do not repeat one, and do',
      'not repeat its shape — a different fact asked in the same words is still',
      'the same post to somebody scrolling:',
      ...recent.map((opening) => `- ${opening}`),
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
      '',
      /*
       * §470. The page has to be *readable*, not merely reachable. An MDPI
       * article returned HTTP 200 and matched zero claim words three times
       * running, because its text is rendered in JavaScript — the fetcher saw
       * navigation and nothing else, and the piece was abandoned.
       */
      'The page is read as plain HTML. A publisher portal that renders its text in',
      'JavaScript fetches successfully and reads as empty, which fails the citation even',
      'though the source is real. Prefer a page whose words are in the HTML: a PubMed',
      'abstract, a government page, an encyclopaedia entry.',
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
export function checkDraft(
  format: PostFormat,
  draft: FormatDraft,
  /**
   * §439. The same budget the brief was written from.
   *
   * Checking against the format's maxima while the writer was briefed on the
   * budget's would make every budgeted piece pass a check it was never asked
   * to meet — the exact half-wiring this codebase keeps recording. One budget,
   * read by the brief, the check and the render.
   */
  budget?: FormatBudget,
): FormatCheck {
  const problems: SlotProblem[] = [];
  const wanted = expandSlots(format, budget?.slots);
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

    /**
     * §448. The thumbnail, checked while it is still cheap to change.
     *
     * `retentionQC` has carried `first_frame_words` since it was written and it
     * has reported `unmeasured` on every video ever made here. The stated
     * reason is that the gate has no OCR — but the words on frame one are this
     * slot's text, and they are known before a single frame is rendered.
     *
     * A warning, not an error: the ceiling is a craft judgement and an
     * eight-word opening is not a defect. The point is that an operator, and
     * the rewrite loop, get told — a nine-word opening currently ships with
     * nobody having looked, twice in the last seven pieces.
     */
    if (slot.opensThePiece && words > THUMBNAIL_WORDS.max) {
      problems.push({
        rule: 'format.thumbnail_too_long',
        severity: 'warning',
        message:
          `${slot.key} is frame one and runs ${words} words; ${THUMBNAIL_WORDS.max} is what reads ` +
          'at a glance in a feed preview.',
        slot: slot.key,
      });
    }

    /**
     * §458. Coming in short, which is the failure that actually happens.
     *
     * `format.slot_too_long` has existed since this file was written and there
     * was never a counterpart. Measured across real renders: every piece landed
     * 20-43% under its target, because a writer told "max N words" writes half
     * of N. A TikTok history budgeted for 40 seconds rendered at 22.6.
     *
     * Only against a *budget*, never against the format's own ceiling: without
     * a budget `maxWords` is a limit that nothing reasoned about, and demanding
     * a piece fill it would be inventing a target from a layout constraint.
     *
     * Half is the bar rather than something tighter, because a good line that
     * happens to be short is not a defect and the warning should mean
     * something when it fires.
     */
    if (budget && words > 0 && words < slot.maxWords * 0.5) {
      problems.push({
        rule: 'format.slot_too_short',
        severity: 'warning',
        message:
          `${slot.key} runs ${words} words against a ${slot.maxWords}-word budget. ` +
          'That word count is the runtime, so half of it is half the piece.',
        slot: slot.key,
      });
    }

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
       * §348. A slot is a fragment, not a post.
       *
       * `slopFilter` judges a caption: its opening line, its rhythm across
       * sentences, its question density. A quiz answer has no opening line
       * because it is not an opening, and a quiz is *made* of questions.
       *
       * Three separate rules refused a Kinolog quiz on three separate attempts
       * — `opening_line` on an answer, `question_density` on the questions,
       * `uncited_claim` on the title — each correct about a post and none
       * applicable to the thing being judged, each costing an attempt the piece
       * needed for its content.
       *
       * The language rules still apply: an em dash is an em dash anywhere.
       */
      if (isPostShaped(violation.rule)) continue;
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
  problems.push(...checkOneNamePerThing(draft));

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

  /*
   * §404. The index is the slot's position **within its own key**, and it is
   * counted here rather than believed.
   *
   * `checkDraft` looks a slot up by `key:index`, and `expandSlots` numbers each
   * key from zero — so a singular slot is only ever `setup:0`. A model writing a
   * format whose slots all repeat (the quiz: `question` and `answer` five times
   * each) numbers per key and lands exactly right. A model writing a format
   * whose slots are all singular numbers them **globally** — hook 0, setup 1,
   * turn 2 — which is a perfectly reasonable reading of "index" and matches
   * nothing.
   *
   * The result: `history` returned all five slots, correctly keyed, with real
   * citations, and was refused as *"5 slots and 4 were not filled"* — three
   * times, then abandoned. Quiz is the only format that has ever produced a
   * piece, and this is why. Not a model failing to follow instructions: a
   * parser trusting a number that carries no information the array order does
   * not already carry.
   *
   * So the number is discarded and the position counted. For a singular slot
   * there is no other valid answer than 0; for a repeating one, the Nth
   * occurrence is the Nth. A slot the model genuinely omitted is still absent,
   * and `checkDraft` still says so.
   */
  const seen = new Map<string, number>();

  const slots: FilledSlot[] = [];
  for (const entry of list) {
    const item = entry as { key?: unknown; index?: unknown; text?: unknown; citation?: unknown };
    if (typeof item.key !== 'string' || !known.has(item.key)) continue;
    if (typeof item.text !== 'string' || item.text.trim().length === 0) continue;
    const index = seen.get(item.key) ?? 0;
    seen.set(item.key, index + 1);
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

    /**
     * §376. §300's checks, actually running.
     *
     * `planQuestion`, `checkQuestion` and `difficultyCurve` were written,
     * tested and called by nothing outside their own test file. So the rules
     * that catch the failure which would genuinely embarrass an account — the
     * revealed answer not being among the options the viewer was given — were
     * enforced nowhere.
     *
     * They were half-enforced at *render* time: `optionsFor` drops the options
     * when the answer is not one of them, and draws the question bare. That is
     * an honest fallback and it is the wrong place. It happens after the
     * writing is finished, silently, and the writer is never told — so the same
     * mistake comes back on the next piece. Here it is a writing problem, and
     * the writing loop already knows how to hand a problem back and ask again.
     *
     * Only questions that actually carry options are checked. Most do not: the
     * catalogue's slot asks for a question and not for a list, and a question
     * with no options is legitimately drawn as a spotlight.
     */
    const optionSlots = new Map(
      draft.slots.filter((s) => s.key === 'options').map((s) => [s.index, s]),
    );
    for (const question of questions) {
      const answer = answers.get(question.index);
      const raw = optionSlots.get(question.index)?.text;
      if (!answer || !raw) continue;

      const options = raw
        .split('|')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
      if (options.length < 2) continue;

      /*
       * The plan is derived from what was written rather than chosen in
       * advance, because nothing in this pipeline yet decides an answer's
       * shape before the writing. True/false is recognised from the options
       * themselves; everything else is judged as a multiple choice of the
       * length the writer produced.
       */
      const isTrueFalse =
        options.length === 2 &&
        options.every((o) => /^(true|false)$/i.test(o));

      const correctIndex = options.findIndex((o) => {
        const option = o.trim().toLowerCase();
        const wanted = answer.text.trim().toLowerCase();
        return option === wanted || option.includes(wanted) || wanted.includes(option);
      });

      const verdict = checkQuestion({
        plan: planQuestion({
          answerShape: isTrueFalse ? 'yes_no' : 'name',
          difficulty: 'medium',
          isMisconception: isTrueFalse,
        }),
        question: question.text,
        answer: answer.text,
        options,
        correctIndex: correctIndex === -1 ? undefined : correctIndex,
      });

      for (const problem of verdict.problems) {
        problems.push({
          rule: 'quiz.unplayable',
          severity: 'error',
          message: `question[${question.index}]: ${problem}`,
          slot: 'options',
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


/**
 * §464. One name per thing, across the whole piece.
 *
 * Seen in the first end-to-end render: the hook read *"Salting eggplant removes
 * bitterness"* and the very next card read *"Yes, aubergines used to be salted
 * and rinsed."* Two names for one vegetable, four seconds apart, on an account
 * whose entire pitch is that it knows what is in your food.
 *
 * A viewer does not think "interesting dialectal variation". They think the
 * writer was not paying attention — and on a piece *correcting* somebody else's
 * mistake, that is the worst possible moment to look careless.
 *
 * Deliberately **not** a locale rule. Halyard does not know whether an account
 * is American or British, and guessing would be worse than useless: it would
 * "correct" a British brand into American English. What is wrong regardless of
 * locale is using **both**, and that is all this refuses.
 *
 * A warning, not an error. §449 is the standing lesson about what failing a
 * piece for a wording judgement costs, and the fix here is a one-word rewrite
 * that the retry loop handles well when it is told.
 */
const SAME_THING_DIFFERENT_NAME: ReadonlyArray<readonly [string, string]> = [
  ['eggplant', 'aubergine'],
  ['zucchini', 'courgette'],
  ['cilantro', 'coriander'],
  ['arugula', 'rocket'],
  ['scallion', 'spring onion'],
  ['shrimp', 'prawn'],
  ['skillet', 'frying pan'],
  ['broiler', 'grill'],
  ['confectioners sugar', 'icing sugar'],
  ['all purpose flour', 'plain flour'],
  ['heavy cream', 'double cream'],
  ['baking soda', 'bicarbonate of soda'],
  ['molasses', 'treacle'],
  ['cookie', 'biscuit'],
  ['candy', 'sweets'],
];

export function checkOneNamePerThing(draft: FormatDraft): SlotProblem[] {
  /* Plural-tolerant: "aubergines" must match "aubergine". */
  const text = draft.slots.map((s) => s.text).join(' ').toLowerCase();
  const has = (term: string) =>
    new RegExp(`\\b${term.replace(/ /g, '\\s+')}s?\\b`, 'i').test(text);

  const problems: SlotProblem[] = [];
  for (const [a, b] of SAME_THING_DIFFERENT_NAME) {
    if (has(a) && has(b)) {
      problems.push({
        rule: 'format.two_names_one_thing',
        severity: 'warning',
        message:
          `This piece calls the same thing "${a}" and "${b}". Pick one and use it throughout — ` +
          'two names four seconds apart reads as carelessness, on a piece whose point is that it knows better.',
      });
    }
  }
  return problems;
}
