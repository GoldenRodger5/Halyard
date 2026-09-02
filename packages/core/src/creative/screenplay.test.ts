/**
 * §335/§338. The screenplay's job is to be *producible*. Taste is the model's;
 * feasibility is checked here, and every case below is one that happened.
 */
import { describe, it, expect } from 'vitest';
import { checkScreenplay, fitScreenplay, printScreenplay, type Screenplay } from './screenplay.js';

const scene = (over: Partial<Screenplay['scenes'][number]> = {}): Screenplay['scenes'][number] => ({
  id: 's1',
  slotKey: null,
  role: 'hook',
  weight: 'lead',
  seconds: 4,
  spoken: null,
  onScreen: ['A LINE'],
  direction: 'The frame holds.',
  ground: 'colour',
  groundSubject: null,
  move: 'hold',
  score: 'enter',
  gestures: [],
  ...over,
});

const play = (scenes: Screenplay['scenes']): Screenplay => ({
  title: 'Taste quiz',
  format: 'quiz',
  channel: 'short_video',
  bedMood: 'warm',
  scenes,
});

const available = {
  marks: ['box', 'arrow'] as const,
  locatable: ['the swapped row'] as const,
  seconds: { min: 15, max: 45 },
  hasFootage: false,
};

describe('checkScreenplay', () => {
  it('refuses a piece where nothing is the point', () => {
    /* Flat emphasis, caught one layer earlier than the critic finds it. */
    const check = checkScreenplay(
      play([scene({ weight: 'support', seconds: 20 }), scene({ id: 's2', weight: 'support', seconds: 20 })]),
      available,
    );
    expect(check.problems.map((p) => p.rule)).toContain('no_lead');
  });

  it('refuses a line that will not fit its scene', () => {
    /*
     * The first real screenplay was refused on all six scenes for this. The
     * model wrote well and did the arithmetic badly.
     */
    const check = checkScreenplay(
      play([
        scene({
          seconds: 4,
          spoken: 'That is the point of Kinolog: a private movie diary that reads your ratings, vibes, notes and honest watch dates.',
        }),
        scene({ id: 's2', weight: 'support', seconds: 14 }),
      ]),
      available,
    );
    expect(check.problems.map((p) => p.rule)).toContain('line_will_not_fit');
  });

  it('refuses footage that was never captured', () => {
    /* §163: there is no placeholder, because a synthetic screenshot is a claim
       about a product state nobody observed. */
    const check = checkScreenplay(
      play([scene({ ground: 'product_capture', seconds: 20 }), scene({ id: 's2', seconds: 10, weight: 'support' })]),
      available,
    );
    expect(check.problems.map((p) => p.rule)).toContain('no_footage');
  });

  it('refuses a gesture at something the frame cannot locate', () => {
    const check = checkScreenplay(
      play([
        scene({
          seconds: 20,
          gestures: [{ target: 'the thing I imagined', atSeconds: 1, because: 'x' }],
        }),
        scene({ id: 's2', seconds: 10, weight: 'support' }),
      ]),
      available,
    );
    expect(check.problems.map((p) => p.rule)).toContain('gesture_unlocatable');
  });

  it('refuses a gesture past the end of its scene', () => {
    const check = checkScreenplay(
      play([
        scene({
          seconds: 20,
          gestures: [{ target: 'the swapped row', atSeconds: 40, because: 'x' }],
        }),
        scene({ id: 's2', seconds: 10, weight: 'support' }),
      ]),
      available,
    );
    expect(check.problems.map((p) => p.rule)).toContain('gesture_after_scene');
  });

  it('refuses a piece the channel has no room for', () => {
    const check = checkScreenplay(play([scene({ seconds: 90 })]), available);
    expect(check.problems.map((p) => p.rule)).toContain('too_long');
  });

  it('passes a producible piece', () => {
    const check = checkScreenplay(
      play([scene({ seconds: 12 }), scene({ id: 's2', weight: 'support', seconds: 10 })]),
      available,
    );
    expect(check.ok).toBe(true);
  });
});

describe('fitScreenplay', () => {
  it('lengthens a scene to hold what is said over it', () => {
    const fit = fitScreenplay(
      play([scene({ seconds: 3, spoken: 'One two three four five six seven eight nine ten eleven twelve.' })]),
    );
    expect(fit.screenplay.scenes[0]!.seconds).toBeGreaterThan(3);
    expect(fit.adjustments).toHaveLength(1);
  });

  it('never shortens a line to fit a duration', () => {
    /* A scene length is a guess; a sentence is a decision. */
    const spoken = 'One two three four five six seven eight nine ten eleven twelve.';
    const fit = fitScreenplay(play([scene({ seconds: 3, spoken })]));
    expect(fit.screenplay.scenes[0]!.spoken).toBe(spoken);
  });

  it('leaves a scene that already fits alone', () => {
    const fit = fitScreenplay(play([scene({ seconds: 12, spoken: 'Short line.' })]));
    expect(fit.adjustments).toHaveLength(0);
  });

  it('says what it changed rather than changing it silently', () => {
    const fit = fitScreenplay(play([scene({ seconds: 2, spoken: 'One two three four five six seven eight.' })]));
    expect(fit.adjustments[0]!.because).toContain('words');
  });
});

describe('printScreenplay', () => {
  it('reads as a script, with direction, dialogue and score', () => {
    const text = printScreenplay(
      play([scene({ seconds: 12, spoken: 'A line.', direction: 'The loaf fills the frame.' })]),
    );
    expect(text).toContain('VOICE');
    expect(text).toContain('ON SCREEN');
    expect(text).toContain('The loaf fills the frame.');
    expect(text).toContain('score: enter');
  });
});

describe('§347. cutting to the ceiling', () => {
  it('drops an aside before a support, and never a lead', () => {
    const fit = fitScreenplay(
      play([
        scene({ id: 'lead', weight: 'lead', seconds: 20 }),
        scene({ id: 'support', weight: 'support', seconds: 20 }),
        scene({ id: 'aside', weight: 'aside', seconds: 20 }),
      ]),
      45,
    );
    const ids = fit.screenplay.scenes.map((s) => s.id);
    expect(ids).toContain('lead');
    expect(ids).not.toContain('aside');
  });

  it('leaves a piece inside the ceiling alone', () => {
    const fit = fitScreenplay(play([scene({ seconds: 20 }), scene({ id: 's2', weight: 'aside', seconds: 10 })]), 45);
    expect(fit.screenplay.scenes).toHaveLength(2);
  });

  it('refuses rather than cutting a lead, leaving a real refusal to the check', () => {
    /* A piece cut down to nothing but leads has been edited; one that lost its
       lead is a different piece. */
    const fit = fitScreenplay(play([scene({ id: 'a', weight: 'lead', seconds: 40 }), scene({ id: 'b', weight: 'lead', seconds: 40 })]), 45);
    expect(fit.screenplay.scenes).toHaveLength(2);
  });

  it('says which scene it cut and why', () => {
    const fit = fitScreenplay(
      play([scene({ seconds: 40 }), scene({ id: 'x', weight: 'aside', seconds: 20 })]),
      45,
    );
    expect(fit.adjustments.some((a) => a.because.includes('ceiling'))).toBe(true);
  });
});

/**
 * §468. A gesture needs somewhere to point.
 *
 * `generate.ts` never passed `locatable`, so it defaulted to `[]` — and the
 * screenwriter's prompt turns an empty list into "Nothing in the frame can be
 * located, so this piece has no gestures." Every screenplay was told, in so
 * many words, that marks were impossible; §446 then honoured that exactly, and
 * three consecutive pieces drew none.
 */
describe('gestures need a target the frame can locate', () => {
  const staged = (gestures: Array<{ target: string; atSeconds: number; because: string }>) => ({
    title: 'T',
    format: 'history',
    channel: 'short_video',
    bedMood: 'warm',
    scenes: [scene({ gestures })],
  });

  it('accepts a gesture pointing at something the frame draws', () => {
    const check = checkScreenplay(staged([{ target: 'gluten', atSeconds: 1, because: 'the word it turns on' }]), {
      marks: ['underline'],
      locatable: ['gluten', 'sourdough'],
      seconds: { min: 5, max: 60 },
      hasFootage: false,
    });
    expect(check.problems.filter((p) => p.rule.includes('gesture'))).toEqual([]);
  });

  it('refuses a gesture pointing at something it cannot find', () => {
    const check = checkScreenplay(staged([{ target: 'thermometer', atSeconds: 1, because: 'x' }]), {
      marks: ['underline'],
      locatable: ['gluten'],
      seconds: { min: 5, max: 60 },
      hasFootage: false,
    });
    expect(check.problems.some((p) => p.rule.includes('gesture'))).toBe(true);
  });

  /*
   * The state that was live: an empty list is not "mark anything", it is "mark
   * nothing", and the prompt says so out loud.
   */
  it('treats an empty locatable list as no gestures at all', () => {
    const check = checkScreenplay(staged([{ target: 'gluten', atSeconds: 1, because: 'x' }]), {
      marks: ['underline'],
      locatable: [],
      seconds: { min: 5, max: 60 },
      hasFootage: false,
    });
    expect(check.problems.some((p) => p.rule.includes('gesture'))).toBe(true);
  });
});
