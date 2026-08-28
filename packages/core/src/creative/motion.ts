/**
 * Motion as a grammar, not an effect. §220.
 *
 * Every beat in every Halyard video moved identically: a 24-pixel rise with a
 * fade, and on media a slow scale. One entrance, one camera move, applied
 * everywhere regardless of what the beat was doing. That is the difference
 * between a video and a slideshow with animation turned on — not the presence
 * of motion but whether the motion *means* anything.
 *
 * ## What a grammar is, here
 *
 * A treatment declares a **visual language**: how it opens, how it moves
 * between beats, how it emphasises. A beat then receives a specific primitive
 * derived from its role, its emphasis and its position. So a myth/fact reversal
 * cuts hard between the belief and the correction, a montage slides through its
 * steps, and a feature demo pushes into the product. Three treatments, three
 * distinct rhythms, from one set of rules.
 *
 * ## Why deterministic
 *
 * Motion selection is arithmetic over facts the plan already carries — the
 * role, the emphasis, whether the beat holds media, where it sits in the piece.
 * A model choosing per-beat animation would be unauditable, would differ
 * between runs on identical input, and could not be regression-tested. The
 * judgement already happened when the treatment was chosen.
 *
 * ## Restraint is part of the grammar
 *
 * `NONE` and `CUT` are first-class. A piece where everything moves reads as
 * cheap, and the retention rules penalise a busy frame as surely as a static
 * one. The grammar decides when *not* to move, which is why `quick` beats get
 * less motion than held ones rather than more.
 *
 * Pure. No React, no Remotion, no clock — the render package restates the types
 * it needs, because it is webpacked and cannot import this barrel (gotcha 10).
 */

/** How a beat's content arrives. */
export const ENTRANCES = [
  /** Nothing. The frame is simply there — used for hard cuts. */
  'none',
  /** Fade and lift. The existing behaviour, kept for editorial. */
  'rise',
  /** Scale up past 1 and settle. Energetic; for hooks and payoffs. */
  'pop',
  /** Enter from a side. Directional, for sequences. */
  'slide',
  /** Uncover left to right behind a moving mask. */
  'wipe',
  /** Words arrive in sequence rather than as a block. */
  'cascade',
] as const;
export type Entrance = (typeof ENTRANCES)[number];

/** How the frame moves while a beat is on screen. */
export const CAMERA_MOVES = [
  'still',
  /** Slow scale in. Documentary. */
  'push',
  /** Slow scale out, revealing context. */
  'pull',
  /** Lateral drift. */
  'pan',
  /** Foreground and background move at different rates. */
  'parallax',
] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];

/** How one beat becomes the next. */
export const TRANSITIONS = [
  'cut',
  'crossfade',
  /** The incoming beat pushes the outgoing one off. */
  'push_through',
  /** A directional wipe. */
  'wipe',
] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface BeatMotion {
  entrance: Entrance;
  camera: CameraMove;
  /** How the beat *leaves*, i.e. the transition into the next one. */
  transitionOut: Transition;
  /** Seconds the entrance takes. Short for quick beats. */
  entranceSeconds: number;
  /** Scale applied across the beat by the camera move. 1 is none. */
  cameraAmount: number;
  /** Direction for slide/wipe/pan, as a unit vector. */
  direction: { x: number; y: number };
  /** Which word index to emphasise, when the entrance is a cascade. */
  emphasisWordIndex?: number;
}

/**
 * A treatment's visual language.
 *
 * Named after what it feels like rather than after its mechanics, because the
 * point of the set is that a person can tell them apart.
 */
export const VISUAL_LANGUAGES = [
  /** Hard cuts, big type, no drift. Confident and fast. */
  'editorial_cut',
  /** Continuous slow movement, crossfades. Considered. */
  'documentary',
  /** Directional slides, quick entrances. Momentum. */
  'kinetic',
  /** Push into media, minimal type motion. Lets footage carry it. */
  'product_led',
  /** Word-level cascade with emphasis. For a line that lands. */
  'typographic',
] as const;
export type VisualLanguage = (typeof VISUAL_LANGUAGES)[number];

/**
 * Which language a treatment speaks.
 *
 * The mapping is the creative decision, and it is deliberately opinionated: a
 * myth/fact reversal is two statements in tension and wants a hard cut between
 * them; a montage is momentum and wants directional slides; a feature demo
 * should get out of the footage's way.
 */
export const LANGUAGE_FOR_TREATMENT: Record<string, VisualLanguage> = {
  myth_fact: 'editorial_cut',
  before_after: 'documentary',
  process_montage: 'kinetic',
  listicle: 'kinetic',
  how_to: 'documentary',
  comparison: 'editorial_cut',
  feature_demo: 'product_led',
};

export const DEFAULT_LANGUAGE: VisualLanguage = 'documentary';

export function languageFor(treatment: string): VisualLanguage {
  return LANGUAGE_FOR_TREATMENT[treatment] ?? DEFAULT_LANGUAGE;
}

/**
 * Which word in a hook carries the claim. §220.
 *
 * The first version emphasised index 1 — "the second word, usually the one
 * carrying the claim" — and rendering "Halving a recipe isn't math" put the
 * accent on **a**. A coloured stopword does not read as emphasis, it reads as a
 * bug, and no amount of grammar fixes a rule that picks the wrong word.
 *
 * A hook lands on its last real word. "Halving a recipe isn't **math**",
 * "One teaspoon. Nothing else **moved**". Trailing stopwords and punctuation
 * are skipped; a line that is nothing but stopwords gets no emphasis at all,
 * which is better than accenting one arbitrarily.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'and', 'or',
  'but', 'for', 'so', 'as', 'by', 'be', 'was', 'are', 'not', 'no', 'do',
  'does', 'did', 'you', 'your', 'i', 'we', 'this', 'that',
]);

export function emphasisWordFor(text: string): number | undefined {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const bare = words[i]!.toLowerCase().replace(/[^a-z0-9']/g, '');
    if (bare.length > 0 && !STOPWORDS.has(bare)) return i;
  }
  return undefined;
}

export interface MotionInput {
  treatment: string;
  role: string;
  emphasis: 'quick' | 'normal' | 'hold';
  /** Position in the piece, 0-based. */
  index: number;
  total: number;
  /** True when this beat plays captured footage or a full-bleed image. */
  hasMedia: boolean;
  /** Words on screen, so a cascade knows whether it is worth doing. */
  wordCount?: number;
  /** The line itself, when a cascade needs to choose which word to accent. */
  text?: string;
  /** 'punch' shortens entrances and increases amplitude. */
  register?: 'editorial' | 'punch';
}

/** Alternating directions, so consecutive slides do not all come from the left. */
function directionFor(index: number): { x: number; y: number } {
  const cycle = index % 4;
  if (cycle === 0) return { x: 1, y: 0 };
  if (cycle === 1) return { x: -1, y: 0 };
  if (cycle === 2) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

/**
 * The motion for one beat.
 *
 * Reads like a set of rules a person could argue with, because that is the
 * point — each clause is a creative decision that can be wrong and changed,
 * rather than a tuned constant nobody can interpret.
 */
export function motionFor(input: MotionInput): BeatMotion {
  const language = languageFor(input.treatment);
  const punch = (input.register ?? 'punch') === 'punch';
  const last = input.index === input.total - 1;
  const first = input.index === 0;

  /* Base timings. Punch is faster throughout; a slow entrance in a feed is a
     slow entrance nobody waits for. */
  const quickEntrance = punch ? 0.16 : 0.28;
  const normalEntrance = punch ? 0.22 : 0.36;
  const entranceSeconds =
    input.emphasis === 'quick' ? quickEntrance : input.emphasis === 'hold' ? normalEntrance * 1.2 : normalEntrance;

  /**
   * The hook is where word-level typography always earns its place. §220.
   *
   * `typographic` was written as a language no treatment mapped to, which made
   * `cascade` unreachable — a dead branch of exactly the kind this codebase
   * keeps finding. It is reachable through *role* instead, which is also the
   * more honest rule: a cascade is right for the one line the whole piece
   * depends on, and a tic everywhere else.
   *
   * Only in punch, only with enough words to read as a cascade rather than a
   * stutter, and never over media — footage does not need help.
   */
  const words = input.wordCount ?? 0;
  if (first && input.role === 'hook' && punch && !input.hasMedia && words >= 3) {
    return {
      entrance: 'cascade',
      camera: 'still',
      transitionOut: language === 'editorial_cut' ? 'cut' : 'crossfade',
      entranceSeconds: Math.max(quickEntrance, Math.min(0.5, words * 0.07)),
      cameraAmount: 1,
      direction: { x: 0, y: 0 },
      /* The last real word — where a hook actually lands. */
      ...(input.text
        ? (() => {
            const idx = emphasisWordFor(input.text);
            return idx === undefined ? {} : { emphasisWordIndex: idx };
          })()
        : {}),
    };
  }

  /*
   * Media beats get out of the way. Footage is the content, and animating type
   * over a product demonstration competes with the thing the beat exists for.
   */
  if (input.hasMedia) {
    return {
      entrance: language === 'editorial_cut' ? 'none' : 'rise',
      camera: language === 'product_led' ? 'push' : language === 'documentary' ? 'push' : 'still',
      transitionOut: language === 'editorial_cut' ? 'cut' : 'crossfade',
      entranceSeconds: quickEntrance,
      /* Gentle. A visible zoom on a screen recording reads as a mistake. */
      cameraAmount: language === 'product_led' ? 1.06 : 1.04,
      direction: { x: 0, y: 0 },
    };
  }

  switch (language) {
    case 'editorial_cut':
      /*
       * No drift at all, and hard cuts. The tension in a myth/fact reversal
       * comes from the cut itself; a crossfade would soften exactly the moment
       * that should land.
       */
      return {
        entrance: first ? 'pop' : 'none',
        camera: 'still',
        transitionOut: 'cut',
        entranceSeconds: quickEntrance,
        cameraAmount: 1,
        direction: { x: 0, y: 0 },
      };

    case 'kinetic':
      /* Momentum. Directional slides that alternate, so a five-item countdown
         does not feel like the same card five times. */
      return {
        entrance: input.emphasis === 'hold' ? 'pop' : 'slide',
        camera: input.emphasis === 'hold' ? 'push' : 'still',
        transitionOut: last ? 'crossfade' : 'push_through',
        entranceSeconds,
        cameraAmount: input.emphasis === 'hold' ? 1.05 : 1,
        direction: directionFor(input.index),
      };

    case 'typographic': {
      /* Word-level, but only when there are enough words for it to read as a
         cascade rather than a stutter. */
      return {
        entrance: words >= 3 ? 'cascade' : 'pop',
        camera: 'still',
        transitionOut: 'cut',
        entranceSeconds,
        cameraAmount: 1,
        direction: { x: 0, y: 0 },
        ...(words >= 3 ? { emphasisWordIndex: Math.min(words - 1, 1) } : {}),
      };
    }

    case 'product_led':
      /* Restrained around the footage it exists to frame. */
      return {
        entrance: 'rise',
        camera: 'still',
        transitionOut: 'crossfade',
        entranceSeconds,
        cameraAmount: 1,
        direction: { x: 0, y: 0 },
      };

    case 'documentary':
    default:
      /*
       * Continuous slow movement. The held beat pushes — the piece leans in on
       * the moment it exists for — and everything else drifts gently or not at
       * all.
       */
      return {
        entrance: first ? 'wipe' : 'rise',
        camera: input.emphasis === 'hold' ? 'push' : input.index % 2 === 0 ? 'pan' : 'still',
        transitionOut: 'crossfade',
        entranceSeconds,
        cameraAmount: input.emphasis === 'hold' ? 1.08 : 1.03,
        direction: directionFor(input.index),
      };
  }
}

/**
 * The motion for a whole plan, in beat order.
 *
 * The last beat never transitions out — there is nothing to transition to, and
 * a piece that fades at the end loses the loop that short-form rewards.
 */
export function motionForPlan(
  treatment: string,
  beats: Array<{
    role: string;
    emphasis: 'quick' | 'normal' | 'hold';
    hasMedia?: boolean;
    wordCount?: number;
    text?: string;
  }>,
  register: 'editorial' | 'punch' = 'punch',
): BeatMotion[] {
  return beats.map((beat, index) => {
    const motion = motionFor({
      treatment,
      role: beat.role,
      emphasis: beat.emphasis,
      index,
      total: beats.length,
      hasMedia: Boolean(beat.hasMedia),
      ...(beat.wordCount !== undefined ? { wordCount: beat.wordCount } : {}),
      ...(beat.text ? { text: beat.text } : {}),
      register,
    });
    return index === beats.length - 1 ? { ...motion, transitionOut: 'cut' } : motion;
  });
}

/**
 * How much this plan actually moves, 0..1.
 *
 * Used by the creative gate: a piece whose every beat is `none`/`still` is a
 * slideshow, and that is now measurable before a single frame is rendered
 * rather than only afterwards from tonal deltas.
 */
export function motionDensity(motions: BeatMotion[]): number {
  if (motions.length === 0) return 0;
  const moving = motions.filter(
    (m) => m.entrance !== 'none' || m.camera !== 'still' || m.transitionOut !== 'cut',
  ).length;
  return Math.round((moving / motions.length) * 100) / 100;
}
