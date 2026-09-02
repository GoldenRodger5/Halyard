import { describe, expect, it } from 'vitest';
import { POST_FORMATS, POST_FORMAT_CATALOG, expandSlots } from '../formats/catalog.js';
import {
  LENGTH_BANDS,
  bandFor,
  lengthBudgetFor,
  budgetWords,
  minWordsFor,
  predictSeconds,
  readSeconds,
  spokenSeconds,
} from './length.js';

describe('the arithmetic', () => {
  it('matches the measured speaking rate', () => {
    /* Thirteen words at 2.6 w/s plus the 0.55 headroom. */
    expect(spokenSeconds('one two three four five six seven eight nine ten a b c')).toBe(5.55);
  });

  it('floors a short line, because synthesis is not deterministic', () => {
    expect(spokenSeconds('yes')).toBe(2);
    expect(readSeconds('yes')).toBe(2.5);
  });

  it('is zero for nothing, not the floor', () => {
    expect(spokenSeconds('   ')).toBe(0);
  });

  it('inverts: budgetWords is predictSeconds backwards', () => {
    const words = budgetWords(32, 8);
    /* Eight lines of that many words each should land on the target. */
    const lines = Array.from({ length: 8 }, () =>
      Array.from({ length: Math.floor(words / 8) }, () => 'word').join(' '),
    );
    expect(predictSeconds(lines)).toBeLessThanOrEqual(32);
    expect(predictSeconds(lines)).toBeGreaterThan(32 - 8 * 0.4);
  });

  it('skips blank lines rather than charging the floor for them', () => {
    expect(predictSeconds(['hello there friend', '', '   '])).toBe(predictSeconds(['hello there friend']));
  });
});

describe('bands', () => {
  it('gives TikTok the tightest short-video target and Shorts the longest', () => {
    const tiktok = bandFor('tiktok', 'short_video');
    const youtube = bandFor('youtube', 'short_video');
    expect(tiktok?.targetSeconds).toBeLessThan(youtube!.targetSeconds);
  });

  it('returns null for a platform with no band, rather than an unbounded one', () => {
    expect(bandFor('bluesky', 'short_video')).toBeNull();
    expect(bandFor('tiktok', 'carousel')).toBeNull();
  });

  it('lets pace move the target without moving the platform ceiling', () => {
    const standard = bandFor('tiktok', 'short_video', 'standard')!;
    const unhurried = bandFor('tiktok', 'short_video', 'unhurried')!;
    const terse = bandFor('tiktok', 'short_video', 'terse')!;
    expect(unhurried.targetSeconds).toBeGreaterThan(standard.targetSeconds);
    expect(terse.targetSeconds).toBeLessThan(standard.targetSeconds);
    expect(unhurried.ceilingSeconds).toBe(standard.ceilingSeconds);
  });

  it('never lets pace push a target outside its own band', () => {
    for (const platform of Object.keys(LENGTH_BANDS)) {
      for (const pace of ['terse', 'standard', 'unhurried'] as const) {
        for (const channel of ['short_video', 'story'] as const) {
          const band = bandFor(platform, channel, pace);
          if (!band) continue;
          expect(band.targetSeconds).toBeGreaterThanOrEqual(band.floorSeconds);
          expect(band.targetSeconds).toBeLessThanOrEqual(band.ceilingSeconds);
        }
      }
    }
  });

  it('states why, so an operator can disagree with a number and know what it meant', () => {
    for (const platform of Object.keys(LENGTH_BANDS)) {
      for (const band of Object.values(LENGTH_BANDS[platform]!)) {
        expect(band.because.length).toBeGreaterThan(40);
      }
    }
  });
});

describe('budgeting a format to a band', () => {
  const quiz = POST_FORMAT_CATALOG.quiz;

  it('cuts the quiz to three questions on TikTok', () => {
    const budget = lengthBudgetFor(quiz, bandFor('tiktok', 'short_video')!);
    const questions = budget.slots.find((s) => s.key === 'question')!;
    expect(questions.repeats).toBe(3);
    expect(budget.reduced).toContainEqual({ key: 'question', from: 5, to: 3 });
  });

  it('keeps the reveal attached: answers are cut in step with questions', () => {
    for (const platform of ['tiktok', 'instagram', 'youtube', 'x']) {
      const band = bandFor(platform, 'short_video');
      if (!band) continue;
      const budget = lengthBudgetFor(quiz, band);
      const q = budget.slots.find((s) => s.key === 'question')!.repeats;
      const a = budget.slots.find((s) => s.key === 'answer')!.repeats;
      expect(a, platform).toBe(q);
    }
  });

  it('cuts the count rather than writing under the floor', () => {
    /*
     * The point of the whole model, stated as what is actually true.
     *
     * A quiz question has a floor of eight words — below that it cannot state
     * a subject and a constraint together, which is what makes an answer
     * checkable. So the budget cannot buy its seconds by shortening: forced to
     * keep five questions it writes them at the floor anyway and overruns the
     * target by half. Cutting to three is the only move that lands the piece
     * where it performs, and the three that remain are full-length.
     */
    const band = bandFor('tiktok', 'short_video')!;
    const budgeted = lengthBudgetFor(quiz, band);
    const forced = lengthBudgetFor(
      { ...quiz, slots: quiz.slots.map((s) => (s.repeatsMin ? { ...s, repeatsMin: 5 } : s)) },
      band,
    );

    expect(budgeted.slots.find((s) => s.key === 'question')!.repeats).toBe(3);
    expect(forced.slots.find((s) => s.key === 'question')!.repeats).toBe(5);
    /* Same words per question — the floor binds in both. */
    expect(budgeted.slots.find((s) => s.key === 'question')!.maxWords).toBe(
      forced.slots.find((s) => s.key === 'question')!.maxWords,
    );
    /* And only the cut one lands near the target. */
    expect(forced.predictedSeconds).toBeGreaterThan(budgeted.predictedSeconds + 10);
    expect(budgeted.predictedSeconds).toBeLessThan(band.targetSeconds + 2);
  });

  it('separates missing the target from breaking the ceiling', () => {
    const instagram = lengthBudgetFor(quiz, bandFor('instagram', 'short_video')!);
    /* Costs more than the target affords, and is nowhere near the ceiling. */
    expect(instagram.meetsTarget).toBe(false);
    expect(instagram.overruns).toBe(false);

    const youtube = lengthBudgetFor(quiz, bandFor('youtube', 'short_video')!);
    expect(youtube.meetsTarget).toBe(true);
  });

  it('affords more questions on Shorts than on TikTok', () => {
    const tiktok = lengthBudgetFor(quiz, bandFor('tiktok', 'short_video')!);
    const youtube = lengthBudgetFor(quiz, bandFor('youtube', 'short_video')!);
    expect(youtube.slots.find((s) => s.key === 'question')!.repeats).toBeGreaterThan(
      tiktok.slots.find((s) => s.key === 'question')!.repeats,
    );
  });

  it('never scales a slot below the floor that keeps it that slot', () => {
    for (const id of POST_FORMATS) {
      const format = POST_FORMAT_CATALOG[id];
      for (const platform of Object.keys(LENGTH_BANDS)) {
        for (const channel of ['short_video', 'story'] as const) {
          const band = bandFor(platform, channel, format.pace);
          if (!band) continue;
          for (const slot of lengthBudgetFor(format, band).slots) {
            const declared = format.slots.find((s) => s.key === slot.key)!;
            expect(slot.maxWords, `${id}/${platform}/${slot.key}`).toBeGreaterThanOrEqual(
              minWordsFor(declared),
            );
            expect(slot.maxWords).toBeLessThanOrEqual(declared.maxWords);
          }
        }
      }
    }
  });

  it('reports an overrun rather than pretending a piece fits', () => {
    const impossible = lengthBudgetFor(quiz, {
      floorSeconds: 1,
      targetSeconds: 4,
      ceilingSeconds: 5,
      because: 'a band no structure can meet',
    });
    expect(impossible.overruns).toBe(true);
    /* And it still cut as far as it legally could before saying so. */
    expect(impossible.slots.find((s) => s.key === 'question')!.repeats).toBe(3);
  });

  it('predicts a duration inside the band it was budgeted for', () => {
    for (const id of POST_FORMATS) {
      const format = POST_FORMAT_CATALOG[id];
      if (!format.channels.includes('short_video')) continue;
      const band = bandFor('tiktok', 'short_video', format.pace);
      if (!band) continue;
      const budget = lengthBudgetFor(format, band);
      expect(budget.predictedSeconds, id).toBeLessThanOrEqual(band.ceilingSeconds);
    }
  });
});

describe('expandSlots reads the budget', () => {
  it('produces the budgeted count and ceiling, not the format maximum', () => {
    const quiz = POST_FORMAT_CATALOG.quiz;
    const budget = lengthBudgetFor(quiz, bandFor('tiktok', 'short_video')!);
    const expanded = expandSlots(quiz, budget.slots);
    expect(expanded.filter((s) => s.key === 'question')).toHaveLength(3);
    const q = expanded.find((s) => s.key === 'question')!;
    expect(q.maxWords).toBe(budget.slots.find((s) => s.key === 'question')!.maxWords);
  });

  it('is unchanged when no budget is given', () => {
    const quiz = POST_FORMAT_CATALOG.quiz;
    expect(expandSlots(quiz)).toHaveLength(12);
    expect(expandSlots(quiz).find((s) => s.key === 'question')!.maxWords).toBe(14);
  });
});
