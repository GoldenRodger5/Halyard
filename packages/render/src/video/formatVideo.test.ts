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

  it('splits the answer from its clause', () => {
    const out = videoForFormat('quiz', [
      slot('question', 0, 'What year was gluten identified?'),
      slot('answer', 0, '1728. Beccari separated it from wheat flour.'),
    ]);
    const q = (out!.props.questions as Array<{ answer: string; source: string | null }>)[0]!;
    expect(q.answer).toBe('1728');
    expect(q.source).toContain('Beccari');
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
