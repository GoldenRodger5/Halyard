/**
 * §404. Why only the quiz ever worked.
 *
 * `checkDraft` looks slots up by `key:index` and `expandSlots` numbers each key
 * from zero, so a singular slot is only ever `key:0`. `parseDraft` believed
 * whatever number the model sent.
 *
 * A model filling a format whose slots all repeat numbers them per key and
 * lands right. A model filling a format whose slots are all singular numbers
 * them **globally** — and every slot after the first misses. Live, `history`
 * returned all five slots, correctly keyed, with verified citations, and was
 * refused as "5 slots and 4 were not filled", three times, then abandoned.
 *
 * The assertions below are about the *shape*: a draft numbered either way must
 * parse to the same thing, because the array already carries the order.
 */
import { describe, expect, it } from 'vitest';
import { parseDraft, checkDraft, POST_FORMAT_CATALOG } from './index.js';

const history = POST_FORMAT_CATALOG.history;
const quiz = POST_FORMAT_CATALOG.quiz;

/** What a model sends for an all-singular format: one global running count. */
const GLOBALLY_NUMBERED = {
  slots: [
    { key: 'hook', index: 0, text: 'Sourdough likely started in ancient Egypt.', citation: 'https://example.org/a' },
    { key: 'setup', index: 1, text: 'You might picture San Francisco miners.', citation: 'https://example.org/a' },
    { key: 'turn', index: 2, text: 'Egyptians leavened with wild yeasts centuries earlier.', citation: 'https://example.org/a' },
    { key: 'why_it_matters', index: 3, text: 'Adapt by rise and smell, not by the clock.', citation: 'https://example.org/a' },
    { key: 'source', index: 4, text: 'Britannica, "Sourdough".', citation: 'https://example.org/a' },
  ],
};

describe('slot indices are counted, not believed', () => {
  it('accepts an all-singular format numbered globally', () => {
    const draft = parseDraft(GLOBALLY_NUMBERED, history);
    expect(draft.slots.map((s) => s.index)).toEqual([0, 0, 0, 0, 0]);
    const incomplete = checkDraft(history, draft).problems.filter(
      (p) => p.rule === 'format.incomplete',
    );
    expect(incomplete).toEqual([]);
  });

  it('parses the same draft identically however the model numbered it', () => {
    const perKey = {
      slots: GLOBALLY_NUMBERED.slots.map((s) => ({ ...s, index: 0 })),
    };
    expect(parseDraft(GLOBALLY_NUMBERED, history)).toEqual(parseDraft(perKey, history));
  });

  it('still numbers a repeating slot by its position', () => {
    /* The quiz: five questions and five answers, interleaved as a model writes them. */
    const slots = [{ key: 'title', index: 0, text: 'How well do you know bread?' }];
    for (let i = 0; i < 5; i += 1) {
      slots.push({ key: 'question', index: i, text: `Question ${i} about bread here?` });
      slots.push({ key: 'answer', index: i, text: `Answer ${i}, and why that is interesting.` });
    }
    slots.push({ key: 'close', index: 0, text: 'How many did you get right?' });
    const draft = parseDraft({ slots }, quiz);
    const questions = draft.slots.filter((s) => s.key === 'question');
    expect(questions.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(
      checkDraft(quiz, draft).problems.filter((p) => p.rule === 'format.incomplete'),
    ).toEqual([]);
  });

  it('still reports a slot the model genuinely omitted', () => {
    /*
     * The counting must not paper over a real gap: four slots renumbered to
     * 0..3 would fill four of five and hide the missing one.
     */
    const short = { slots: GLOBALLY_NUMBERED.slots.slice(0, 3) };
    const problems = checkDraft(history, parseDraft(short, history)).problems;
    const incomplete = problems.find((p) => p.rule === 'format.incomplete');
    expect(incomplete?.message).toMatch(/why_it_matters/);
    expect(incomplete?.message).toMatch(/source/);
  });

  it('ignores an index the model omitted entirely', () => {
    const noIndex = { slots: GLOBALLY_NUMBERED.slots.map(({ index: _i, ...rest }) => rest) };
    expect(
      checkDraft(history, parseDraft(noIndex, history)).problems.filter(
        (p) => p.rule === 'format.incomplete',
      ),
    ).toEqual([]);
  });
});
