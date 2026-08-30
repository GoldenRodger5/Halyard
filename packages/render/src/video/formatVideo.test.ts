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
import { treatmentsForBeats } from './narrative.js';
import { spokenSeconds } from './quiz.js';

const slot = (key: string, index: number, text: string, citation?: string): SlotValue => ({
  key,
  index,
  text,
  citation: citation ?? null,
});

describe('videoForFormat', () => {
  it('returns null for a format with no video builder', () => {
    /* `recipe` runs on carousel and long_video; it has no short-video shape. */
    expect(videoForFormat('recipe', [slot('title', 0, 'Anything')])).toBeNull();
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


describe('the narrative formats', () => {
  it('gives every short-video format a composition', () => {
    /*
     * §308. Four formats declared `short_video` and had no composition, so they
     * rendered as cards — which is what "the videos look like slideshows"
     * meant. A format that names a channel it cannot render for is a promise
     * the catalogue does not keep.
     */
    for (const id of ['quiz', 'history', 'tips', 'myth_fact', 'origin']) {
      expect(VIDEO_FORMATS, `${id} has no video builder`).toContain(id);
    }
  });

  it('builds a history as hook, setup, turn, payoff', () => {
    const out = videoForFormat('history', [
      slot('hook', 0, 'Bread was an accident.'),
      slot('setup', 0, 'Flour and water left out catches wild yeast.'),
      slot('turn', 0, 'Somebody baked it anyway.'),
      slot('why_it_matters', 0, 'Every loaf since repeats that accident on purpose.'),
      slot('source', 0, 'Wikipedia: History of bread'),
    ]);
    expect(out!.compositionId).toBe('Narrative');
    const beats = out!.props.beats as Array<{ role: string; source: string | null }>;
    expect(beats.map((b) => b.role)).toEqual(['hook', 'setup', 'turn', 'payoff']);
    /* The citation rides the beat that makes the claim, not the hook. */
    expect(beats[3]!.source).toContain('Wikipedia');
  });

  it('numbers the tips, because the number is what keeps a viewer’s place', () => {
    const out = videoForFormat('tips', [
      slot('title', 0, 'Four things about flour'),
      slot('tip', 0, 'Weigh it.'),
      slot('tip', 1, 'Sift it.'),
      slot('close', 0, 'Which one surprised you?'),
    ]);
    const beats = out!.props.beats as Array<{ kicker: string | null; role: string }>;
    expect(beats.map((b) => b.kicker)).toEqual([null, '1', '2', null]);
    expect(beats[beats.length - 1]!.role).toBe('close');
  });

  it('labels a myth as a myth on the beat that states it', () => {
    /*
     * Stating a myth without labelling it is how a myth post spreads the myth.
     * The kicker is not decoration here — it is the whole safety property.
     */
    const out = videoForFormat('myth_fact', [
      slot('myth', 0, 'Oats contain gluten.'),
      slot('correction', 0, 'They do not. They are milled beside wheat.'),
    ]);
    const beats = out!.props.beats as Array<{ kicker: string | null; text: string }>;
    expect(beats[0]!.kicker).toBe('Myth');
    expect(beats[beats.length - 1]!.kicker).toBe('Actually');
  });

  it('speaks each line while its own beat is on screen', () => {
    const out = videoForFormat('history', [
      slot('hook', 0, 'Bread was an accident.'),
      slot('setup', 0, 'Flour and water left out catches wild yeast.'),
      slot('turn', 0, 'Somebody baked it anyway.'),
      slot('why_it_matters', 0, 'Every loaf repeats it on purpose.'),
    ]);
    const beats = out!.props.beats as Array<{ seconds: number; text: string }>;
    let start = 0;
    beats.forEach((beat, i) => {
      const line = out!.narration[i]!;
      expect(line.text).toBe(beat.text);
      /* Spoken after its beat begins and before that beat ends. */
      expect(line.atSeconds).toBeGreaterThanOrEqual(start);
      expect(line.atSeconds).toBeLessThan(start + beat.seconds);
      start += beat.seconds;
    });
  });

  it('varies the treatment rather than repeating one', () => {
    /* Five identical cards with different words in them is the slideshow. */
    const treatments = treatmentsForBeats(['hook', 'detail', 'detail', 'detail', 'close']);
    expect(new Set(treatments.slice(1, 4)).size).toBeGreaterThan(1);
  });

  it('refuses a format whose slots are all empty', () => {
    expect(videoForFormat('history', [slot('hook', 0, '   ')])).toBeNull();
  });
});

describe('§312. the read fits the beat it was written for', () => {
  /* The same rate `revealSecondsFor` and `secondsToRead` size beats with. */
  /* §312. The model the beats are sized with, so the test checks the real rule. */
  const spoken = (text: string) => spokenSeconds(text);

  it('never starts a quiz line before the previous one can have finished', () => {
    /*
     * Question one's aside was still being spoken 1.9s into question two —
     * two lines at once, over a card that had already changed. Caught by
     * listening, which is the only thing that catches it.
     */
    const out = videoForFormat('quiz', [
      { key: 'title', index: 0, text: 'How well do you know gluten?', citation: null },
      { key: 'question', index: 0, text: 'What year was gluten first identified?', citation: null },
      {
        key: 'answer',
        index: 0,
        text: '1728. Beccari separated wheat into starch and a stretchy residue.',
        citation: null,
      },
      { key: 'question', index: 1, text: 'Which flour needs the most liquid?', citation: null },
      { key: 'answer', index: 1, text: 'Coconut. It drinks four times its weight.', citation: null },
    ])!;

    for (let i = 0; i < out.narration.length - 1; i += 1) {
      const line = out.narration[i]!;
      const next = out.narration[i + 1]!;
      const ends = line.atSeconds + spoken(line.text);
      expect(
        ends,
        `"${line.text.slice(0, 40)}" runs ${(ends - next.atSeconds).toFixed(2)}s into the next line`,
      ).toBeLessThanOrEqual(next.atSeconds + 0.35);
    }
  });

  it('gives a reveal carrying a fact more time than a bare one', () => {
    const bare = videoForFormat('quiz', [
      { key: 'question', index: 0, text: 'What year?', citation: null },
      { key: 'answer', index: 0, text: '1728', citation: null },
    ])!;
    const withFact = videoForFormat('quiz', [
      { key: 'question', index: 0, text: 'What year?', citation: null },
      {
        key: 'answer',
        index: 0,
        text: '1728. Beccari separated wheat into starch and a stretchy residue.',
        citation: null,
      },
    ])!;
    /* Both have one question, so any difference is the reveal's own length. */
    expect(withFact.narration.length).toBeGreaterThan(bare.narration.length);
  });

  it('keeps every narrative line inside its own beat', () => {
    const out = videoForFormat('history', [
      { key: 'hook', index: 0, text: 'Bread was an accident.', citation: null },
      {
        key: 'setup',
        index: 0,
        text: 'Flour and water left out long enough catches wild yeast from the air.',
        citation: null,
      },
      { key: 'turn', index: 0, text: 'Somebody baked it anyway.', citation: null },
      { key: 'why_it_matters', index: 0, text: 'Every loaf repeats it on purpose.', citation: null },
    ])!;
    const beats = out.props.beats as Array<{ seconds: number }>;
    out.narration.forEach((line, i) => {
      let start = 0;
      for (let j = 0; j < i; j += 1) start += beats[j]!.seconds;
      expect(line.atSeconds + spoken(line.text)).toBeLessThanOrEqual(start + beats[i]!.seconds + 0.35);
    });
  });
});
