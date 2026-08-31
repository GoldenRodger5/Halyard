/**
 * §402. How a picture is taken, not just what is in it.
 *
 * Every hero image Halyard has ever generated used the same styling clause.
 * `heroPrompt` looks a mood up by visual language, the call site in
 * `generate.ts` passes `visualLanguage: undefined`, and the lookup falls to
 * `DEFAULT_MOOD` — *"natural light, honest and unstyled, shallow depth of
 * field"* — every single time. Nine moods were written; one was ever used.
 *
 * It would not have helped much if it had been passed. `MOOD_FOR_LANGUAGE` is
 * keyed on a vocabulary that is **not** `VISUAL_LANGUAGES`: two of its nine
 * keys (`editorial_calm`, `geometric`) are not visual languages at all, and six
 * real languages have no entry. The map could only ever have hit on seven of
 * thirteen, and did not hit on any, because the argument was never supplied.
 * Declared, typed, tested, never executed — the shape this codebase keeps
 * finding, and §394 and §395 are the two most recent times it was found.
 *
 * ## Why mood was the wrong unit
 *
 * Even a working mood map varies one thing: the light. Ask a photographer for
 * two different pictures of the same loaf and they do not relight it — they
 * move. Framing is the decision a viewer reads first, and a flat lay and a
 * macro crumb shot of the same bread do not look like the same photograph even
 * under identical light.
 *
 * So a shot is three decisions on three independent axes — **framing**,
 * **light**, **surface** — and each rotates on its own history. Rotating the
 * combination instead would let framing repeat three posts running so long as
 * the triple differed, which is precisely the sameness an operator perceives.
 * Per-axis rotation guarantees the next picture is framed differently, lit
 * differently, and shot on a different surface.
 *
 * ## Fit before recency
 *
 * The same order as `chooseLayout` (§293), `chooseQuizTemplate` (§302) and
 * `chooseStill` (§395), for the same reason. A format can refuse a framing:
 * hands mid-action read as a tutorial, which is right for a walkthrough and a
 * lie on a history piece. A refusal is declared here, in the open, rather than
 * left to a prompt to imply.
 *
 * The refusal table is keyed on `PostFormatId` rather than `string`, which is
 * not decoration. Its first draft refused `myth` — and the format is called
 * `myth_fact`, so that entry was unreachable from the day it was written. A
 * `string` key accepts a typo silently, which is the failure this whole file
 * exists to undo.
 *
 * The result is a pure function of its inputs, so a re-render reproduces the
 * picture rather than quietly shooting a new one.
 */

import type { PostFormatId } from '../formats/catalog.js';

/** Where the camera is. The decision a viewer reads first. */
export const FRAMINGS = [
  /** Straight down. Arrangement, order, everything legible at once. */
  'overhead_flat_lay',
  /** Very close. Texture, crumb, steam, grain — the thing at the scale you eat it. */
  'macro_detail',
  /** The classic 45°, subject whole and centred. Reads as a portrait of the food. */
  'three_quarter_plate',
  /** Pulled back. Context, table, negative space — the scene, not the object. */
  'wide_table',
  /** Camera at surface level, subject against the light. Low, dramatic, quiet. */
  'low_hero',
  /** Mid-action, someone's hands doing the thing. Reads as instruction. */
  'hands_at_work',
] as const;
export type Framing = (typeof FRAMINGS)[number];

/** The light. Second-strongest signal, and the one mood used to carry alone. */
export const LIGHTS = [
  'window_soft',
  'hard_sun',
  'overcast_even',
  'warm_low',
  'cool_morning',
] as const;
export type Light = (typeof LIGHTS)[number];

/** What it is sitting on. Cheap to vary and surprisingly legible. */
export const SURFACES = [
  'worn_wood',
  'pale_marble',
  'linen_cloth',
  'dark_slate',
  'matte_ceramic',
] as const;
export type Surface = (typeof SURFACES)[number];

/** How each axis is said to an image model, in a photographer's words. */
const FRAMING_PHRASE: Record<Framing, string> = {
  overhead_flat_lay: 'shot straight down from directly overhead, arranged flat',
  macro_detail: 'an extreme close-up on texture, filling the frame',
  three_quarter_plate: 'a three-quarter view at plate height, the subject whole',
  wide_table: 'a wide shot taking in the whole table, generous negative space',
  low_hero: 'a low camera at surface level, the subject rising against the light',
  hands_at_work: 'hands mid-action in the frame, caught working',
};

const LIGHT_PHRASE: Record<Light, string> = {
  window_soft: 'soft directional light from a north-facing window',
  hard_sun: 'hard direct sunlight with sharp defined shadows',
  overcast_even: 'flat even overcast light, almost no shadow',
  warm_low: 'low warm late-afternoon light, long shadows',
  cool_morning: 'pale cool early-morning light',
};

const SURFACE_PHRASE: Record<Surface, string> = {
  worn_wood: 'on worn wood',
  pale_marble: 'on pale marble',
  linen_cloth: 'on rumpled linen cloth',
  dark_slate: 'on dark slate',
  matte_ceramic: 'on matte glazed ceramic',
};

/**
 * Framings a format refuses, and why.
 *
 * Only genuine mismatches. A refusal that is really a preference removes
 * variety for no reason, and this file exists because variety was missing.
 */
const REFUSED_FRAMINGS: Partial<
  Record<PostFormatId, { framings: Framing[]; because: string }>
> = {
  /* A quiz asks; it does not demonstrate. Hands mid-action promise a method. */
  quiz: { framings: ['hands_at_work'], because: 'a quiz asks a question, it does not demonstrate one' },
  poll: { framings: ['hands_at_work'], because: 'a poll asks a question, it does not demonstrate one' },
  /* A story about where something came from: nobody is being shown how to do anything. */
  history: { framings: ['hands_at_work'], because: 'a history piece is not a demonstration' },
  origin: { framings: ['hands_at_work'], because: 'an origin story is not a demonstration' },
  myth_fact: { framings: ['hands_at_work'], because: 'a myth-buster is not a demonstration' },
  /* A walkthrough is method. A wide empty table says nothing about method. */
  walkthrough: { framings: ['wide_table'], because: 'a walkthrough needs the work in frame, not the room' },
};

export interface Shot {
  framing: Framing;
  light: Light;
  surface: Surface;
}

export interface ShotChoice extends Shot {
  /** `framing/light/surface`. What gets recorded and read back. */
  id: string;
  /** Why this one, in the operator's words. */
  reason: string;
}

/** Serialise a shot for `assets.shot`. */
export function shotId(shot: Shot): string {
  return `${shot.framing}/${shot.light}/${shot.surface}`;
}

/**
 * Read a recorded shot back.
 *
 * Returns null for anything that is not a shot this build knows — a row
 * written before §402, or an axis value removed since. Null is honest; a
 * partial parse would put a made-up framing into a recency list and skew every
 * later choice.
 */
export function parseShot(id: string | null | undefined): Shot | null {
  if (!id) return null;
  const [framing, light, surface] = id.split('/');
  if (!FRAMINGS.includes(framing as Framing)) return null;
  if (!LIGHTS.includes(light as Light)) return null;
  if (!SURFACES.includes(surface as Surface)) return null;
  return { framing: framing as Framing, light: light as Light, surface: surface as Surface };
}

/**
 * Least recently used wins, ties broken by declaration order.
 *
 * `chooseStill`'s rule, per axis. An option never used beats one used last
 * week; among equals the vocabulary's own order decides, which is what makes
 * the whole choice reproducible.
 */
function stalest<T extends string>(options: readonly T[], recent: readonly string[]): T {
  return options
    .map((option, offered) => {
      const at = recent.indexOf(option);
      return { option, staleness: at === -1 ? Number.POSITIVE_INFINITY : at, offered };
    })
    .sort((a, b) => b.staleness - a.staleness || a.offered - b.offered)[0]!.option;
}

/**
 * Choose how to shoot this piece.
 *
 * `recent` is the shot ids of this product's recent images, most recent first.
 * Unparseable entries are dropped rather than guessed at.
 */
export function chooseShot(input: {
  /** The post format, so a framing that would misrepresent it can be refused. */
  format?: string | null;
  /** Recent shot ids, most recent first. */
  recent?: readonly (string | null)[];
}): ShotChoice {
  const history = (input.recent ?? []).map(parseShot).filter((s): s is Shot => s !== null);

  /*
   * The caller's format is a plain string — it comes from a job payload — so
   * the lookup is widened here rather than the table, which stays typed against
   * the real ids. An unknown format refuses nothing, which is the right answer:
   * a format nobody has written a rule for gets the whole vocabulary.
   */
  const refusal = input.format
    ? (REFUSED_FRAMINGS as Record<string, { framings: Framing[]; because: string } | undefined>)[
        input.format
      ]
    : undefined;
  const offered = FRAMINGS.filter((f) => !refusal?.framings.includes(f));
  /*
   * A format that refused everything would be a bug in the table above, not a
   * reason to ship no picture. Falling back to the full vocabulary keeps the
   * function total; the test asserts no format actually does this.
   */
  const framings = offered.length > 0 ? offered : FRAMINGS;

  const framing = stalest(framings, history.map((s) => s.framing));
  const light = stalest(LIGHTS, history.map((s) => s.light));
  const surface = stalest(SURFACES, history.map((s) => s.surface));

  const fresh = history.length === 0;
  const reason = fresh
    ? 'nothing has been shot for this product yet'
    : `${framing.replace(/_/g, ' ')} is the framing least recently used` +
      (refusal ? `, and ${refusal.because}` : '');

  return { framing, light, surface, id: shotId({ framing, light, surface }), reason };
}

/** The shot, said in the words an image model takes direction in. */
export function shotDirection(shot: Shot): string {
  return `${FRAMING_PHRASE[shot.framing]}, ${LIGHT_PHRASE[shot.light]}, ${SURFACE_PHRASE[shot.surface]}`;
}
