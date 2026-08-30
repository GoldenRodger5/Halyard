/**
 * §313. The picture has to be of the thing the video is about.
 *
 * The hero was generated from the artifact's headline before the format had
 * written anything, so a quiz about the history of gluten was illustrated with
 * whatever recipe was adapted that morning. A picture unrelated to the video
 * reads as stock, and stock is what makes an account look automated.
 */
import { describe, it, expect } from 'vitest';
import { subjectFromFormat } from './handlers/generate.js';

const slot = (key: string, text: string, index = 0) => ({ key, index, text });

describe('subjectFromFormat', () => {
  it('takes a history’s hook', () => {
    expect(
      subjectFromFormat([slot('hook', 'Bread was an accident of wild yeast.')]),
    ).toBe('Bread was an accident of wild yeast');
  });

  it('takes a quiz’s title over its first question', () => {
    /* The title describes the whole piece; a question describes one beat. */
    expect(
      subjectFromFormat([
        slot('question', 'What year was gluten first identified?'),
        slot('title', 'How well do you know gluten?'),
      ]),
    ).toBe('How well do you know gluten');
  });

  it('takes the myth for a myth_fact piece', () => {
    expect(subjectFromFormat([slot('myth', 'Oats always contain gluten.')])).toBe(
      'Oats always contain gluten',
    );
  });

  it('returns null when the opening slot is too short to describe anything', () => {
    /* Better to fall back to the artifact than to illustrate an empty string. */
    expect(subjectFromFormat([slot('hook', 'Wow.')])).toBeNull();
  });

  it('returns null when there is no opening slot at all', () => {
    expect(subjectFromFormat([slot('close', 'How many did you get right?')])).toBeNull();
  });

  it('ignores a repeat of the opening slot', () => {
    /* A quiz has five questions; only the first describes the piece. */
    expect(
      subjectFromFormat([slot('question', 'Which flour drinks the most liquid?', 3)]),
    ).toBeNull();
  });
});
