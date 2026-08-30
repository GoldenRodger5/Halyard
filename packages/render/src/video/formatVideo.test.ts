/**
 * §304. A format that fills no usable slots must return null, not a shape.
 *
 * The whole point of this module is that a quiz cannot quietly become a
 * transformation post. That only holds if it refuses rather than returning
 * something plausible — a `Quiz` with zero questions renders a title card and
 * three seconds of nothing, and would pass every gate here.
 */
import { describe, it, expect } from 'vitest';
import { VIDEO_FORMATS, videoForFormat } from './formatVideo.js';
import type { SlotValue } from '../image/formatSlides.js';

const slot = (key: string, index: number, text: string, citation?: string): SlotValue => ({
  key,
  index,
  text,
  citation: citation ?? null,
});

describe('videoForFormat', () => {
  it('returns null for a format with no video builder', () => {
    expect(videoForFormat('history', [slot('hook', 0, 'Anything')])).toBeNull();
  });

  it('returns null for a quiz with no questions', () => {
    expect(videoForFormat('quiz', [slot('title', 0, 'A quiz')])).toBeNull();
  });

  it('drops a question whose answer slot is missing', () => {
    /* Half a question is not a question, and it would render an empty reveal. */
    const out = videoForFormat('quiz', [
      slot('title', 0, 'A quiz'),
      slot('question', 0, 'What year?'),
      slot('question', 1, 'Which flour?'),
      slot('answer', 1, 'Coconut. It drinks more liquid than any other.'),
    ]);
    expect((out!.props.questions as unknown[])).toHaveLength(1);
  });

  it('splits the answer from the clause that makes it worth repeating', () => {
    const out = videoForFormat('quiz', [
      slot('question', 0, 'What year was gluten identified?'),
      slot('answer', 0, '1728. Beccari separated it from wheat flour.'),
    ]);
    const q = (out!.props.questions as Array<{ answer: string; aside: string | null; source: string | null }>)[0]!;
    expect(q.answer).toBe('1728');
    /*
     * §306. The clause is a *fact*, not a citation. It was briefly written into
     * `source`, so a genuinely interesting line rendered as
     * "Source: Beccari separated it from wheat flour" — which is not a citation
     * and reads as a mistake on screen.
     */
    expect(q.aside).toContain('Beccari');
    expect(q.source).toBeNull();
  });

  it('narrates the answer as the reveal lands, never during the countdown', () => {
    /*
     * A narrator who answers while the countdown is running has removed the
     * only thing the viewer was doing. The whole format depends on that pause.
     */
    const out = videoForFormat('quiz', [
      slot('title', 0, 'Three questions'),
      slot('question', 0, 'What year?'),
      slot('answer', 0, '1728. Beccari separated it.'),
    ]);
    const lines = out!.narration;
    const question = lines.find((l) => l.text === 'What year?')!;
    const answer = lines.find((l) => l.text === '1728')!;
    const aside = lines.find((l) => l.text.includes('Beccari'))!;

    /* Question, then a gap at least as long as the countdown, then the answer. */
    expect(answer.atSeconds - question.atSeconds).toBeGreaterThanOrEqual(3);
    expect(aside.atSeconds).toBeGreaterThan(answer.atSeconds);
  });

  it('says the same words the screen shows', () => {
    /*
     * The point of deriving the read from the slots rather than the caption:
     * the voice cannot say 1928 while the screen fills 1728.
     */
    const out = videoForFormat('quiz', [
      slot('question', 0, 'What year?'),
      slot('answer', 0, '1728'),
    ]);
    const spoken = out!.narration.map((l) => l.text);
    const shown = (out!.props.questions as Array<{ question: string; answer: string }>)[0]!;
    expect(spoken).toContain(shown.question);
    expect(spoken).toContain(shown.answer);
  });

  it('keeps a one-clause answer whole rather than guessing at a split', () => {
    const out = videoForFormat('quiz', [
      slot('question', 0, 'Which grain is gluten-free?'),
      slot('answer', 0, 'Sorghum'),
    ]);
    expect((out!.props.questions as Array<{ answer: string }>)[0]!.answer).toBe('Sorghum');
  });

  it('drops options that do not contain their own answer', () => {
    /*
     * Two right answers on screen, or none. §300's `checkQuestion` states the
     * rule; this is where it is enforced at the point of rendering.
     */
    const out = videoForFormat('quiz', [
      slot('question', 0, 'What year?'),
      slot('options', 0, '1928|1608|1808'),
      slot('answer', 0, '1728'),
    ]);
    const q = (out!.props.questions as Array<{ options?: string[] }>)[0]!;
    expect(q.options).toBeUndefined();
  });

  it('keeps options that do contain their answer, and points at the right one', () => {
    const out = videoForFormat('quiz', [
      slot('question', 0, 'What year?'),
      slot('options', 0, '1928|1728|1608'),
      slot('answer', 0, '1728. Beccari separated it.'),
    ]);
    const q = (out!.props.questions as Array<{ options: string[]; correctIndex: number }>)[0]!;
    expect(q.options).toEqual(['1928', '1728', '1608']);
    expect(q.options[q.correctIndex]).toBe('1728');
  });

  it('targets a composition, and quiz is the one that has a builder', () => {
    expect(VIDEO_FORMATS).toContain('quiz');
    const out = videoForFormat('quiz', [
      slot('question', 0, 'What year?'),
      slot('answer', 0, '1728'),
    ]);
    expect(out!.compositionId).toBe('Quiz');
  });
});
