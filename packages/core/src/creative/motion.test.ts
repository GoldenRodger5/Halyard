/**
 * §220. Motion as a grammar.
 *
 * The assertions that matter are comparative: three treatments must move in
 * three recognisably different ways, and restraint must be a real outcome
 * rather than an absence of rules.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMERA_MOVES,
  DEFAULT_LANGUAGE,
  ENTRANCES,
  TRANSITIONS,
  VISUAL_LANGUAGES,
  languageFor,
  motionDensity,
  motionFor,
  motionForPlan,
  type BeatMotion,
  type VisualLanguage,
} from './motion.js';

const beat = (over: Partial<Parameters<typeof motionFor>[0]> = {}) =>
  motionFor({
    treatment: 'how_to',
    role: 'step',
    emphasis: 'normal',
    index: 1,
    total: 4,
    hasMedia: false,
    ...over,
  });

describe('treatments speak different visual languages', () => {
  it('maps each treatment to a language, and defaults rather than throwing', () => {
    expect(languageFor('myth_fact')).toBe('editorial_cut');
    expect(languageFor('process_montage')).toBe('kinetic');
    expect(languageFor('feature_demo')).toBe('product_led');
    expect(languageFor('something_new')).toBe(DEFAULT_LANGUAGE);
  });

  /** The point of the whole module: three treatments, three rhythms. */
  it('produces materially different motion for different treatments', () => {
    const signature = (t: string) => {
      const m = motionForPlan(t, [
        { role: 'hook', emphasis: 'quick' },
        { role: 'change', emphasis: 'hold' },
        { role: 'proof', emphasis: 'normal' },
      ]);
      return m.map((x) => `${x.entrance}/${x.camera}/${x.transitionOut}`).join('|');
    };

    const signatures = new Set([
      signature('myth_fact'),
      signature('process_montage'),
      signature('before_after'),
      signature('feature_demo'),
    ]);
    expect(signatures.size).toBe(4);
  });

  it('cuts hard in editorial, and crossfades in documentary', () => {
    expect(beat({ treatment: 'myth_fact' }).transitionOut).toBe('cut');
    expect(beat({ treatment: 'before_after' }).transitionOut).toBe('crossfade');
  });

  it('gives a montage directional momentum that alternates', () => {
    const motions = motionForPlan('process_montage', [
      { role: 'hook', emphasis: 'quick' },
      { role: 'item', emphasis: 'quick' },
      { role: 'item', emphasis: 'quick' },
      { role: 'item', emphasis: 'quick' },
      { role: 'result', emphasis: 'hold' },
    ]);
    const slides = motions.filter((m) => m.entrance === 'slide');
    expect(slides.length).toBeGreaterThanOrEqual(3);
    /* Consecutive slides must not all arrive from the same side. */
    const dirs = new Set(slides.map((m) => `${m.direction.x},${m.direction.y}`));
    expect(dirs.size).toBeGreaterThan(1);
  });
});

describe('restraint is a rule, not an omission', () => {
  it('keeps type still and quiet over footage', () => {
    const media = beat({ treatment: 'process_montage', hasMedia: true });
    expect(media.direction).toEqual({ x: 0, y: 0 });
    expect(media.cameraAmount).toBeLessThan(1.1);
  });

  it('lets a product-led piece get out of the footage\'s way', () => {
    const m = beat({ treatment: 'feature_demo', hasMedia: true });
    expect(m.camera).toBe('push');
    expect(m.cameraAmount).toBeLessThanOrEqual(1.06);
  });

  it('never drifts in an editorial cut', () => {
    const motions = motionForPlan('myth_fact', [
      { role: 'hook', emphasis: 'quick' },
      { role: 'myth', emphasis: 'hold' },
      { role: 'fact', emphasis: 'hold' },
    ]);
    for (const m of motions) expect(m.camera).toBe('still');
  });

  it('gives a quick beat less entrance time than a held one', () => {
    expect(beat({ emphasis: 'quick' }).entranceSeconds).toBeLessThan(
      beat({ emphasis: 'hold' }).entranceSeconds,
    );
  });

  it('moves faster in punch than in editorial register', () => {
    expect(beat({ register: 'punch' }).entranceSeconds).toBeLessThan(
      beat({ register: 'editorial' }).entranceSeconds,
    );
  });
});

/**
 * §220. The hook cascade — reachable through role, not through a language
 * nothing mapped to.
 *
 * `typographic` was written as a language no treatment selected, which made
 * `cascade` a dead branch. Reaching it by role is also the better rule: word
 * -level typography is right for the one line a piece depends on and a tic
 * everywhere else.
 */
describe('the hook cascade', () => {
  const hook = (over: Partial<Parameters<typeof motionFor>[0]> = {}) =>
    motionFor({
      treatment: 'how_to',
      role: 'hook',
      emphasis: 'quick',
      index: 0,
      total: 4,
      hasMedia: false,
      wordCount: 6,
      text: "Halving a recipe isn't math",
      register: 'punch',
      ...over,
    });

  it('cascades the opening line and accents the word it lands on', () => {
    const m = hook();
    expect(m.entrance).toBe('cascade');
    /* "math", not "a". */
    expect(m.emphasisWordIndex).toBe(4);
  });

  it('does not cascade a line too short to read as one', () => {
    expect(hook({ wordCount: 2 }).entrance).not.toBe('cascade');
  });

  it('never cascades over footage — the picture does not need help', () => {
    expect(hook({ hasMedia: true }).entrance).not.toBe('cascade');
  });

  it('stays out of the editorial register', () => {
    expect(hook({ register: 'editorial' }).entrance).not.toBe('cascade');
  });

  it('applies only to the opening beat, not to every line', () => {
    expect(hook({ index: 2, role: 'step' }).entrance).not.toBe('cascade');
  });

  it('scales its duration with the number of words, within bounds', () => {
    expect(hook({ wordCount: 3 }).entranceSeconds).toBeLessThan(
      hook({ wordCount: 7 }).entranceSeconds,
    );
    expect(hook({ wordCount: 20 }).entranceSeconds).toBeLessThanOrEqual(0.5);
  });
});

describe('the plan-level view', () => {
  it('never transitions out of the last beat', () => {
    const motions = motionForPlan('process_montage', [
      { role: 'hook', emphasis: 'quick' },
      { role: 'item', emphasis: 'normal' },
      { role: 'result', emphasis: 'hold' },
    ]);
    expect(motions[motions.length - 1]!.transitionOut).toBe('cut');
  });

  it('measures how much a plan actually moves', () => {
    const lively = motionForPlan('process_montage', [
      { role: 'hook', emphasis: 'quick' },
      { role: 'item', emphasis: 'quick' },
      { role: 'result', emphasis: 'hold' },
    ]);
    expect(motionDensity(lively)).toBeGreaterThan(0.6);
  });

  /** A slideshow is now detectable before a frame is rendered. */
  it('reports a wholly static plan as zero density', () => {
    const dead: BeatMotion[] = [
      { entrance: 'none', camera: 'still', transitionOut: 'cut', entranceSeconds: 0, cameraAmount: 1, direction: { x: 0, y: 0 } },
      { entrance: 'none', camera: 'still', transitionOut: 'cut', entranceSeconds: 0, cameraAmount: 1, direction: { x: 0, y: 0 } },
    ];
    expect(motionDensity(dead)).toBe(0);
  });

  it('is zero for an empty plan rather than dividing by nothing', () => {
    expect(motionDensity([])).toBe(0);
  });
});

/**
 * §220. Which word gets the accent.
 *
 * The first rule was "index 1, usually the word carrying the claim", and
 * rendering "Halving a recipe isn't math" put a coloured accent on **a**. A
 * highlighted stopword does not read as emphasis; it reads as a bug. Found by
 * extracting frames and looking, not by a test.
 */
describe('emphasisWordFor', () => {
  it('lands on the last real word, which is where a hook lands', async () => {
    const { emphasisWordFor } = await import('./motion.js');
    expect(emphasisWordFor("Halving a recipe isn't math")).toBe(4); // math
    expect(emphasisWordFor('One teaspoon. Nothing else moved')).toBe(4); // moved
  });

  it('skips a trailing stopword to reach the word that carries it', async () => {
    const { emphasisWordFor } = await import('./motion.js');
    /* "salt" carries it; "the" does not. */
    expect(emphasisWordFor('Nothing scaled except the salt the')).toBe(4);
  });

  it('skips trailing punctuation', async () => {
    const { emphasisWordFor } = await import('./motion.js');
    expect(emphasisWordFor('Check it at twenty-two minutes.')).toBe(4);
  });

  it('accents nothing rather than accenting arbitrarily', async () => {
    const { emphasisWordFor } = await import('./motion.js');
    expect(emphasisWordFor('it is the')).toBeUndefined();
    expect(emphasisWordFor('')).toBeUndefined();
  });
});

describe('the expanded vocabulary is a vocabulary, not synonyms', () => {
  /*
   * §227. Thirteen visual languages are only worth having if they produce
   * thirteen different films. A language that resolves to the same motion as
   * another is a label, and a set of labels over one behaviour is exactly the
   * kind of variety-that-is-not-variety this codebase keeps finding.
   */
  const beats = [
    { role: 'hook', emphasis: 'hold' as const, index: 0 },
    { role: 'change', emphasis: 'normal' as const, index: 1 },
    { role: 'proof', emphasis: 'normal' as const, index: 2 },
    { role: 'cta', emphasis: 'quick' as const, index: 3 },
  ];

  function signatureOf(language: VisualLanguage): string {
    return beats
      .map((b) => {
        const m = motionFor({
          treatment: 'unmapped',
          language,
          role: b.role,
          emphasis: b.emphasis,
          index: b.index,
          total: beats.length,
          register: 'punch',
          hasMedia: false,
          wordCount: 6,
          text: 'a line that has enough words to cascade',
        });
        return `${m.entrance}/${m.camera}/${m.transitionOut}/${m.cameraAmount}/${m.direction.x},${m.direction.y}`;
      })
      .join('|');
  }

  it('gives every language a distinct motion signature', () => {
    const seen = new Map<string, string>();
    for (const language of VISUAL_LANGUAGES) {
      const sig = signatureOf(language);
      const twin = seen.get(sig);
      expect(twin, `${language} moves exactly like ${twin}`).toBeUndefined();
      seen.set(sig, language);
    }
    expect(seen.size).toBe(VISUAL_LANGUAGES.length);
  });

  it('keeps every language inside the declared vocabulary', () => {
    // A typo in a case arm produces a motion nothing can draw, which renders
    // as a still frame and looks like a deliberate choice.
    for (const language of VISUAL_LANGUAGES) {
      for (const b of beats) {
        const m = motionFor({
          treatment: 'unmapped',
          language,
          role: b.role,
          emphasis: b.emphasis,
          index: b.index,
          total: beats.length,
          register: 'punch',
          hasMedia: false,
          wordCount: 6,
        });
        expect(ENTRANCES).toContain(m.entrance);
        expect(CAMERA_MOVES).toContain(m.camera);
        expect(TRANSITIONS).toContain(m.transitionOut);
      }
    }
  });
});
