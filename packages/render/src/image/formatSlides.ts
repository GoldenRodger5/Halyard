/**
 * §280. Turning a filled format into slides.
 *
 * The format family (§277) describes structures — a quiz is five questions and
 * five answers, a history is hook/setup/turn/why/source. This maps those onto
 * the carousel slides and layouts that already exist (§267), so a new format is
 * a catalogue entry plus a mapping here rather than a new renderer.
 *
 * Kept as **plain data in, plain data out**: it takes slot text and returns
 * slide props, and imports nothing from `@halyard/core`. Gotcha 10 — this
 * package is webpacked for the browser by Remotion, and a Node-only import
 * anywhere it can reach dies at render time with `UnhandledSchemeError`.
 *
 * ## Why layouts are assigned here rather than chosen
 *
 * `chooseLayout` picks by recency and language, which is right when a deck's
 * slides are interchangeable. In a format they are not: a quiz question **must**
 * be the loud statement and its answer **must** be the quiet one, because the
 * contrast between them is the format. So a format pins the layouts that carry
 * its meaning and leaves the rest free.
 */
import type { CarouselLayout } from './layouts.js';

/** One slot as the writer filled it. Mirrors `FilledSlot` in core, as data. */
export interface SlotValue {
  key: string;
  index: number;
  text: string;
  citation?: string | null;
}

export interface FormatSlide {
  kicker: string;
  headline: string;
  bodyLines: string[];
  layout: CarouselLayout;
  index: number;
  total: number;
}

function pick(slots: SlotValue[], key: string, index = 0): string | null {
  return slots.find((s) => s.key === key && s.index === index)?.text ?? null;
}

function all(slots: SlotValue[], key: string): SlotValue[] {
  return slots.filter((s) => s.key === key).sort((a, b) => a.index - b.index);
}

/**
 * `lead_emphasis` promotes `bodyLines[0]`, not the headline.
 *
 * Worth stating because getting it backwards is invisible in the data and
 * obvious on the card: the first render of a quiz answer put the answer in the
 * headline — which that layout draws small and uppercase as a *label* — and the
 * citation in the body, which it draws at 86px. The card read "Source: Beccari,
 * 1728" in display type with the actual answer as a caption above it.
 *
 * So for this layout the label goes in `headline` and the thing being said goes
 * in `bodyLines[0]`.
 */

/**
 * The citation, rendered where a reader can see it.
 *
 * Shown on the slide that makes the claim rather than collected at the end,
 * because a source a reader has to go looking for is a source they will not
 * check — and the point of requiring one is that it is checkable.
 */
function withCitation(lines: string[], citation?: string | null): string[] {
  return citation ? [...lines, `Source: ${citation}`] : lines;
}

/**
 * A quiz.
 *
 * Question and answer are separate slides on purpose. The gap between them is
 * the format: a reader who can see the answer under the question has not been
 * asked anything, and the pause is what produces the comment.
 */
function quizSlides(slots: SlotValue[]): FormatSlide[] {
  const out: FormatSlide[] = [];
  const title = pick(slots, 'title');
  if (title) {
    out.push({ kicker: 'Quiz', headline: title, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  }

  const questions = all(slots, 'question');
  const answers = all(slots, 'answer');
  for (const question of questions) {
    out.push({
      kicker: `Question ${question.index + 1}`,
      headline: question.text,
      bodyLines: [],
      /* Loud and alone. Nothing else on the card to read ahead to. */
      layout: 'statement',
      index: 0,
      total: 0,
    });
    const answer = answers.find((a) => a.index === question.index);
    if (answer) {
      out.push({
        kicker: 'Answer',
        /* The label, not the point — `lead_emphasis` draws this small. */
        headline: `Question ${question.index + 1}`,
        /* The answer leads, and the citation follows it quietly. */
        bodyLines: withCitation([answer.text], answer.citation),
        layout: 'lead_emphasis',
        index: 0,
        total: 0,
      });
    }
  }

  const close = pick(slots, 'close');
  if (close) {
    out.push({ kicker: 'How did you do', headline: close, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  }
  return out;
}

/** A history or an origin: a fact, what everyone assumes, the turn, and why. */
function narrativeSlides(slots: SlotValue[], kickers: string[]): FormatSlide[] {
  const keys = ['hook', 'setup', 'turn', 'why_it_matters'];
  const originKeys = ['hook', 'before', 'change', 'now'];
  const use = pick(slots, 'setup') !== null ? keys : originKeys;

  const out: FormatSlide[] = [];
  use.forEach((key, i) => {
    const text = pick(slots, key);
    if (!text) return;
    out.push({
      kicker: kickers[i] ?? '',
      headline: i === 0 ? text : (kickers[i] ?? ''),
      bodyLines: i === 0 ? [] : [text],
      /* The fact lands alone; the story that follows has room to breathe. */
      layout: i === 0 ? 'statement' : i === use.length - 1 ? 'split_rule' : 'editorial',
      index: 0,
      total: 0,
    });
  });

  const source = pick(slots, 'source');
  if (source) {
    out.push({
      kicker: 'Source',
      headline: 'Where this comes from',
      bodyLines: [source],
      /*
       * `editorial`, not `lead_emphasis`. A citation set at 86px is the loudest
       * thing on the card and it is the least interesting — the same inversion
       * the quiz answer had, one slide over.
       */
      layout: 'editorial',
      index: 0,
      total: 0,
    });
  }
  return out;
}

/** Tips: the numbered layout exists for exactly this. */
function tipsSlides(slots: SlotValue[]): FormatSlide[] {
  const out: FormatSlide[] = [];
  const title = pick(slots, 'title');
  if (title) {
    out.push({ kicker: 'Tips', headline: title, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  }
  for (const tip of all(slots, 'tip')) {
    out.push({
      kicker: 'Tip',
      headline: tip.text,
      bodyLines: [],
      layout: 'numbered',
      index: 0,
      total: 0,
    });
  }
  const close = pick(slots, 'close');
  if (close) {
    /* Nothing in the body, so `lead_emphasis` would have nothing to promote. */
    out.push({ kicker: 'The one that matters', headline: close, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  }
  return out;
}

/** Myth and fact: concede, then correct. */
function mythSlides(slots: SlotValue[]): FormatSlide[] {
  const out: FormatSlide[] = [];
  const myth = pick(slots, 'myth');
  if (myth) out.push({ kicker: 'You have heard', headline: myth, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  const partly = pick(slots, 'partly_true');
  if (partly) out.push({ kicker: 'True, as far as it goes', headline: 'What is right about it', bodyLines: [partly], layout: 'editorial', index: 0, total: 0 });
  const correction = pick(slots, 'correction');
  if (correction) {
    out.push({
      kicker: 'What it misses',
      headline: 'The part that matters',
      bodyLines: withCitation([correction], pick(slots, 'source')),
      layout: 'split_rule',
      index: 0,
      total: 0,
    });
  }
  return out;
}

/** Comparison: the choice, each side, the verdict. */
function comparisonSlides(slots: SlotValue[]): FormatSlide[] {
  const out: FormatSlide[] = [];
  const question = pick(slots, 'question');
  if (question) out.push({ kicker: 'The choice', headline: question, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  const a = pick(slots, 'option_a');
  if (a) out.push({ kicker: 'Option one', headline: 'The first', bodyLines: [a], layout: 'editorial', index: 0, total: 0 });
  const b = pick(slots, 'option_b');
  if (b) out.push({ kicker: 'Option two', headline: 'The second', bodyLines: [b], layout: 'editorial', index: 0, total: 0 });
  const verdict = pick(slots, 'verdict');
  if (verdict) out.push({ kicker: 'Which to pick', headline: 'The verdict', bodyLines: [verdict], layout: 'split_rule', index: 0, total: 0 });
  return out;
}

/** A full recipe: the thing people came for. */
function recipeSlides(slots: SlotValue[]): FormatSlide[] {
  const out: FormatSlide[] = [];
  const title = pick(slots, 'title');
  if (title) {
    /* The opener wants the photograph, and `photo_overlay` is chosen upstream
       when one exists — `editorial` is the honest fallback when none does. */
    out.push({ kicker: 'Recipe', headline: title, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  }
  const ingredients = all(slots, 'ingredient').map((s) => s.text);
  if (ingredients.length > 0) {
    out.push({ kicker: 'What you need', headline: 'Ingredients', bodyLines: ingredients.slice(0, 8), layout: 'editorial', index: 0, total: 0 });
  }
  const steps = all(slots, 'step');
  for (const step of steps) {
    out.push({ kicker: 'Method', headline: step.text, bodyLines: [], layout: 'numbered', index: 0, total: 0 });
  }
  const note = pick(slots, 'note');
  if (note) out.push({ kicker: 'Watch out', headline: 'The common mistake', bodyLines: [note], layout: 'split_rule', index: 0, total: 0 });
  return out;
}

/** Transformation: the product doing its job, with the cost named. */
function transformationSlides(slots: SlotValue[]): FormatSlide[] {
  const out: FormatSlide[] = [];
  const hook = pick(slots, 'hook');
  if (hook) out.push({ kicker: 'The problem', headline: hook, bodyLines: [], layout: 'statement', index: 0, total: 0 });
  const before = pick(slots, 'before');
  if (before) out.push({ kicker: 'The original', headline: 'What it does now', bodyLines: [before], layout: 'editorial', index: 0, total: 0 });
  const change = pick(slots, 'change');
  if (change) out.push({ kicker: 'The change', headline: 'The swap', bodyLines: [change], layout: 'split_rule', index: 0, total: 0 });
  const cost = pick(slots, 'cost');
  /* Never omitted. Naming the cost is the differentiator, not a disclaimer. */
  if (cost) {
    out.push({ kicker: 'What it costs', headline: 'The tradeoff', bodyLines: [cost], layout: 'lead_emphasis', index: 0, total: 0 });
  }
  return out;
}

const BUILDERS: Record<string, (slots: SlotValue[]) => FormatSlide[]> = {
  quiz: quizSlides,
  history: (s) => narrativeSlides(s, ['', 'What everyone assumes', 'The turn', 'Why it still matters']),
  origin: (s) => narrativeSlides(s, ['', 'Before', 'What changed', 'What we have now']),
  tips: tipsSlides,
  myth_fact: mythSlides,
  comparison: comparisonSlides,
  recipe: recipeSlides,
  transformation: transformationSlides,
};

/**
 * Slides for a filled format, numbered.
 *
 * Returns an empty array for a format with no builder rather than guessing a
 * shape — a format in the catalogue with nothing to render it is a gap someone
 * needs to see, and a plausible default is how it would stay hidden.
 */
export function slidesForFormat(formatId: string, slots: SlotValue[]): FormatSlide[] {
  const build = BUILDERS[formatId];
  if (!build) return [];
  const slides = build(slots);
  return slides.map((slide, i) => ({ ...slide, index: i + 1, total: slides.length }));
}

/** Which formats can be rendered. Asserted against the catalogue in tests. */
export const RENDERABLE_FORMATS = Object.keys(BUILDERS);
