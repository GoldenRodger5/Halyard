import { describe, expect, it } from 'vitest';
import { POST_FORMAT_CATALOG } from '../formats/catalog.js';
import { bandFor, predictSeconds } from './length.js';
import { cutToBudget, describeEdit, type EditableSlot } from './editor.js';

const quiz = POST_FORMAT_CATALOG.quiz;
const band = bandFor('tiktok', 'short_video')!;

/** A quiz drafted long, the way one actually comes back when it overruns. */
function longQuiz(questions = 5): EditableSlot[] {
  const slots: EditableSlot[] = [
    { key: 'title', index: 0, text: 'How much do you actually know about wheat' },
  ];
  for (let i = 0; i < questions; i += 1) {
    slots.push({
      key: 'question',
      index: i,
      text: `Question number ${i + 1} about a thing people believe and have never checked`,
      citation: 'https://example.org/a',
    });
    slots.push({
      key: 'answer',
      index: i,
      text: `The answer is this, and the reason it is interesting is a whole clause long`,
      citation: 'https://example.org/a',
    });
  }
  slots.push({ key: 'close', index: 0, text: 'How many did you get right' });
  return slots;
}

describe('the editor', () => {
  it('cuts a long quiz under its ceiling', () => {
    const result = cutToBudget(quiz, longQuiz(), band);
    expect(result.beforeSeconds).toBeGreaterThan(band.ceilingSeconds);
    expect(result.afterSeconds).toBeLessThanOrEqual(band.ceilingSeconds);
    expect(result.stillOver).toBe(false);
  });

  it('cuts a question and its answer together, so no reveal is orphaned', () => {
    const result = cutToBudget(quiz, longQuiz(), band);
    const questions = result.slots.filter((s) => s.key === 'question').map((s) => s.index);
    const answers = result.slots.filter((s) => s.key === 'answer').map((s) => s.index);
    expect(answers).toEqual(questions);
    expect(result.cut.length % 2).toBe(0);
  });

  it('cuts from the end, so the sequence a viewer is counting stays contiguous', () => {
    const result = cutToBudget(quiz, longQuiz(), band);
    const kept = result.slots.filter((s) => s.key === 'question').map((s) => s.index);
    expect(kept).toEqual(kept.map((_, i) => i));
  });

  it('never drops a slot the format has only one of', () => {
    const result = cutToBudget(quiz, longQuiz(), band);
    expect(result.slots.some((s) => s.key === 'title')).toBe(true);
    expect(result.slots.some((s) => s.key === 'close')).toBe(true);
  });

  it('stops at the format minimum rather than cutting into it', () => {
    /* A band no quiz can meet: three questions is the floor and it still runs long. */
    const impossible = { ...band, ceilingSeconds: 4, targetSeconds: 3, floorSeconds: 1 };
    const result = cutToBudget(quiz, longQuiz(), impossible);
    expect(result.slots.filter((s) => s.key === 'question')).toHaveLength(3);
    expect(result.stillOver).toBe(true);
  });

  it('changes nothing when the piece already fits', () => {
    const short = longQuiz(3).slice(0, 3);
    const result = cutToBudget(quiz, short, band);
    expect(result.cut).toEqual([]);
    expect(result.slots).toHaveLength(short.length);
    expect(result.afterSeconds).toBe(result.beforeSeconds);
  });

  it('never rewrites a line — it only removes whole ones', () => {
    const before = longQuiz();
    const result = cutToBudget(quiz, before, band);
    for (const kept of result.slots) {
      const original = before.find((s) => s.key === kept.key && s.index === kept.index);
      expect(kept.text).toBe(original!.text);
      expect(kept.citation).toBe(original!.citation);
    }
  });

  it('leaves a format with nothing droppable alone, rather than failing', () => {
    const myth = POST_FORMAT_CATALOG.myth_fact;
    const slots: EditableSlot[] = myth.slots.map((s, i) => ({
      key: s.key,
      index: 0,
      text: Array.from({ length: 40 }, () => `w${i}`).join(' '),
    }));
    const result = cutToBudget(myth, slots, band);
    expect(result.cut).toEqual([]);
    expect(result.slots).toHaveLength(myth.slots.length);
    expect(result.stillOver).toBe(true);
  });

  it('reports what it took and what that bought', () => {
    const result = cutToBudget(quiz, longQuiz(), band);
    expect(result.cut[0]!.because).toMatch(/ceiling/);
    expect(result.cut.reduce((n, c) => n + c.saved, 0)).toBeCloseTo(
      result.beforeSeconds - result.afterSeconds,
      1,
    );
    expect(describeEdit(result)).toMatch(/^Cut question\[4\], answer\[4\]/);
  });

  it('says nothing when it did nothing', () => {
    expect(describeEdit(cutToBudget(quiz, longQuiz(3), band))).toBe('');
  });

  it('measures with the same arithmetic the renderer uses', () => {
    const result = cutToBudget(quiz, longQuiz(), band);
    expect(result.afterSeconds).toBe(predictSeconds(result.slots.map((s) => s.text)));
  });
});
