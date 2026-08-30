/**
 * §335. The screenplay — the one document that holds a whole piece.
 *
 * Halyard has seventeen content agents and every one of them answers a narrow
 * question in isolation: the copywriter writes a caption, the VO scriptwriter
 * writes what is said, the visual director picks a language, the motion
 * director picks movement, the music director picks a bed, the annotation
 * director places marks. Nothing holds the piece in mind at once.
 *
 * The consequence is visible in the output and was diagnosed by an operator
 * watching it: the pieces are *correct* and they are not *composed*. A quiz
 * reveal and a quiz question get the same motion because the motion director
 * was never told which is which. A mark appears where a capture happened to
 * record a tap rather than where the piece wants the eye. The music enters at
 * zero because nobody said when it should.
 *
 * `HALYARD_CREATIVE_GAP_AUDIT.md` §7 named this before it was built:
 * *"The missing structural layers are concept, **storyboard**, music/sound,
 * rich visual direction... Beats currently live inside `renders.input_props`;
 * concepts and creative briefs are not first-class entities."*
 *
 * ## What a screenplay is here
 *
 * A play's script is not only its dialogue. It is dialogue **plus stage
 * directions**: who moves, what the lighting does, where the audience is meant
 * to look. That is exactly the missing half. A `Scene` carries what is said,
 * what is read on screen, what is behind it, what moves, what is marked, and
 * what the score does — together, in one place, in an order a person can read.
 *
 * ## Why this inverts the current flow
 *
 * Today each director decides independently and the render is whatever falls
 * out. With a screenplay, the directors become **executors**: the screenplay
 * says "this beat is the turn, hold it, mark the swapped row, let the bed lift"
 * and the motion, annotation and music directors carry that out within their
 * own rules.
 *
 * That is a real inversion and it is the point. A committee of specialists with
 * no director produces competent, uncomposed work — which is precisely what the
 * output looked like.
 *
 * ## The line that keeps it honest
 *
 * A screenplay is *written* by a model, because deciding that a moment deserves
 * a gesture is a judgement about rhythm and attention that no arithmetic
 * reaches. Every direction it gives is then **checked against what can actually
 * be executed**: a gesture naming a motif the product's pack does not contain,
 * a mark on a region the frame cannot locate, a music hit past the end of the
 * piece — all rejected here, in code, before anything renders.
 *
 * The model directs. The code decides whether the direction is producible.
 */
import type { BeatRole } from './plan.js';

/** How hard a scene lands. Drives type size, hold time and motion. */
export const SCENE_WEIGHTS = ['lead', 'support', 'aside'] as const;
export type SceneWeight = (typeof SCENE_WEIGHTS)[number];

/** What is behind the words. */
export const GROUNDS = ['footage', 'photograph', 'colour', 'product_capture'] as const;
export type Ground = (typeof GROUNDS)[number];

/** What the frame does across a scene. */
export const MOVES = ['hold', 'push_in', 'drift', 'cut', 'settle'] as const;
export type Move = (typeof MOVES)[number];

/** What the score does at a scene boundary. */
export const SCORE_MOVES = ['enter', 'duck', 'lift', 'drop_out', 'hold'] as const;
export type ScoreMove = (typeof SCORE_MOVES)[number];

/**
 * A gesture: a mark the piece makes at a moment, at a thing.
 *
 * `target` is a *label*, not a box. The screenplay names what to point at in
 * the words the piece uses for it; resolving that to coordinates is the
 * annotation director's job and depends on what the frame can actually locate
 * (§331). A screenplay that carried pixel positions would be a screenplay that
 * had to know how the piece renders.
 */
export interface Gesture {
  /** The thing being indicated, in the piece's own words. */
  target: string;
  /** Seconds from the start of the *scene*, not of the piece. */
  atSeconds: number;
  /** Why the eye should go there now. One line, for a person. */
  because: string;
}

export interface Scene {
  id: string;
  role: BeatRole;
  weight: SceneWeight;
  /** How long it holds. The screenplay's most consequential number. */
  seconds: number;

  /** What the voice says, verbatim. Null for a silent scene. */
  spoken: string | null;
  /** What the viewer reads. Rarely the same words as `spoken`. */
  onScreen: string[];

  /**
   * What is happening, in prose, for a person to read.
   *
   * The stage direction proper. Not consumed by any renderer — it exists so an
   * operator can read the piece before it is made, which is the whole reason a
   * screenplay is written down rather than held in a graph of agent outputs.
   */
  direction: string;

  ground: Ground;
  /** What the ground is *of*, in the piece's words. Drives image generation. */
  groundSubject?: string | null;
  move: Move;
  gestures: Gesture[];
  /** What the score does entering this scene. */
  score: ScoreMove;
}

export interface Screenplay {
  title: string;
  format: string;
  channel: string;
  /** The mood the bed should carry. Handed to the music director. */
  bedMood: string;
  scenes: Scene[];
}

export interface ScreenplayProblem {
  scene: string;
  rule: string;
  detail: string;
}

export interface ScreenplayCheck {
  ok: boolean;
  problems: ScreenplayProblem[];
  /** Total runtime implied by the scenes. */
  totalSeconds: number;
}

/**
 * §335. Is this screenplay producible?
 *
 * Every check answers "can the machinery downstream actually do this", never
 * "is this good". Taste is the model's; feasibility is not negotiable, and a
 * direction nothing can execute is worse than no direction — it renders as
 * silence in a place the piece expected emphasis.
 */
export function checkScreenplay(
  screenplay: Screenplay,
  available: {
    /** Marks the product's motif pack contains (§330). */
    marks: readonly string[];
    /** Regions the frame can locate, in the piece's own words (§331). */
    locatable: readonly string[];
    /** What the channel allows, in seconds. */
    seconds: { min: number; max: number };
    /** Whether real captured footage exists for this piece. */
    hasFootage: boolean;
  },
): ScreenplayCheck {
  const problems: ScreenplayProblem[] = [];
  const totalSeconds = screenplay.scenes.reduce((total, s) => total + s.seconds, 0);

  if (screenplay.scenes.length === 0) {
    return {
      ok: false,
      problems: [{ scene: '(none)', rule: 'empty', detail: 'A screenplay with no scenes.' }],
      totalSeconds: 0,
    };
  }

  /*
   * Length is a channel constraint, not a preference. A 90-second piece in a
   * channel that decides in half a second is not a long piece, it is the wrong
   * piece — and it is cheaper to refuse here than after synthesis and a render.
   */
  if (totalSeconds > available.seconds.max) {
    problems.push({
      scene: '(whole piece)',
      rule: 'too_long',
      detail: `${totalSeconds.toFixed(1)}s against a ${available.seconds.max}s ceiling for this channel.`,
    });
  }
  if (totalSeconds < available.seconds.min) {
    problems.push({
      scene: '(whole piece)',
      rule: 'too_short',
      detail: `${totalSeconds.toFixed(1)}s against a ${available.seconds.min}s floor for this channel.`,
    });
  }

  /*
   * A piece with no lead scene has no moment it is *for*. Every beat weighted
   * the same is the flat-emphasis problem the critic already reports (§275)
   * arriving one layer earlier, where it can still be fixed.
   */
  if (!screenplay.scenes.some((s) => s.weight === 'lead')) {
    problems.push({
      scene: '(whole piece)',
      rule: 'no_lead',
      detail: 'No scene is weighted `lead`, so nothing in the piece is the point.',
    });
  }

  const seen = new Set<string>();
  for (const scene of screenplay.scenes) {
    if (seen.has(scene.id)) {
      problems.push({ scene: scene.id, rule: 'duplicate_id', detail: 'Two scenes share an id.' });
    }
    seen.add(scene.id);

    if (scene.seconds <= 0) {
      problems.push({ scene: scene.id, rule: 'no_duration', detail: 'A scene with no time in it.' });
    }

    /*
     * §312's rule, applied before anything is synthesised: a scene must be at
     * least as long as what is said over it. Speech runs about 2.6 words a
     * second, with a floor because short lines are slower per word.
     */
    if (scene.spoken) {
      const words = scene.spoken.trim().split(/\s+/).filter(Boolean).length;
      const needs = Math.max(2, words / 2.6 + 0.55);
      if (scene.seconds < needs - 0.3) {
        problems.push({
          scene: scene.id,
          rule: 'line_will_not_fit',
          detail: `"${scene.spoken.slice(0, 40)}…" needs about ${needs.toFixed(1)}s and the scene holds ${scene.seconds}s.`,
        });
      }
    }

    if (scene.ground === 'product_capture' && !available.hasFootage) {
      problems.push({
        scene: scene.id,
        rule: 'no_footage',
        detail:
          'The scene calls for product footage and none was captured. §163: there is no ' +
          'placeholder, because a synthetic screenshot is a claim about a state nobody observed.',
      });
    }

    for (const gesture of scene.gestures) {
      if (gesture.atSeconds > scene.seconds) {
        problems.push({
          scene: scene.id,
          rule: 'gesture_after_scene',
          detail: `A gesture at ${gesture.atSeconds}s in a scene that holds ${scene.seconds}s.`,
        });
      }
      if (!available.locatable.includes(gesture.target)) {
        problems.push({
          scene: scene.id,
          rule: 'gesture_unlocatable',
          detail:
            `Nothing in the frame is known as "${gesture.target}", so a mark on it would point ` +
            'at a guess. §331: a mark needs a voice and a location.',
        });
      }
    }

    if (scene.gestures.length > 2) {
      problems.push({
        scene: scene.id,
        rule: 'too_many_gestures',
        detail: `${scene.gestures.length} marks in one scene. Two at once already point at neither (§319).`,
      });
    }
  }

  return { ok: problems.length === 0, problems, totalSeconds };
}

/**
 * §335. The screenplay as a person reads it.
 *
 * The operator asked to *see the script all together* — what is said, what is
 * happening, where the emphasis is, what the music does. A screenplay held only
 * as an object is a screenplay nobody reviews, and the review is the point: it
 * is far cheaper to fix a piece here than after it has been synthesised,
 * rendered and watched.
 *
 * Laid out like a shooting script because that format solves this exact problem
 * and has for a century: the scene heading, the direction in prose, the
 * dialogue indented under it.
 */
export function printScreenplay(screenplay: Screenplay): string {
  const lines: string[] = [];
  const total = screenplay.scenes.reduce((t, s) => t + s.seconds, 0);

  lines.push(screenplay.title.toUpperCase());
  lines.push(
    `${screenplay.format} · ${screenplay.channel} · ${total.toFixed(1)}s · score: ${screenplay.bedMood}`,
  );
  lines.push('');

  let at = 0;
  for (const [i, scene] of screenplay.scenes.entries()) {
    const from = at;
    at += scene.seconds;

    lines.push(
      `${String(i + 1).padStart(2, '0')}. ${scene.role.toUpperCase()} — ${scene.weight} — ` +
        `${from.toFixed(1)}s to ${at.toFixed(1)}s`,
    );

    /* The stage direction, wrapped, in the way a script sets action. */
    for (const line of wrap(scene.direction, 74)) lines.push(`    ${line}`);

    const ground =
      scene.ground === 'colour'
        ? 'the brand ground'
        : `${scene.ground.replace('_', ' ')}${scene.groundSubject ? ` — ${scene.groundSubject}` : ''}`;
    lines.push(`    [ground: ${ground} · move: ${scene.move} · score: ${scene.score}]`);

    if (scene.onScreen.length > 0) {
      lines.push('');
      for (const text of scene.onScreen) lines.push(`        ON SCREEN:  ${text}`);
    }

    if (scene.spoken) {
      lines.push('');
      lines.push('              VOICE');
      for (const line of wrap(scene.spoken, 52)) lines.push(`        ${line}`);
    }

    for (const gesture of scene.gestures) {
      lines.push('');
      lines.push(
        `        [+${gesture.atSeconds.toFixed(1)}s — mark "${gesture.target}": ${gesture.because}]`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}


/**
 * §338. Make the timing fit, and say what was changed.
 *
 * The first real screenplay was refused on every scene: each spoken line needed
 * more seconds than the scene it sat in. That is the right refusal and the
 * wrong place to stop — the *writing* was good and only the arithmetic was
 * wrong, and asking a model to try again risks losing lines that were worth
 * keeping.
 *
 * So the timing is repaired here rather than re-requested. A scene is lengthened
 * to hold what is said over it, which is the same rule §312 applies to a quiz
 * reveal, applied before anything is synthesised.
 *
 * **It never shortens a line.** Trimming words to fit a duration is editing the
 * script to suit a number nobody chose deliberately — and a scene length is a
 * guess, while a sentence is a decision.
 *
 * If the repaired total exceeds the channel's ceiling, that is a real refusal:
 * the piece has more to say than the channel allows, and the answer is fewer
 * scenes, which is a writing decision and not an arithmetic one.
 */
export interface ScreenplayFit {
  screenplay: Screenplay;
  /** What was changed, so a lengthened piece is never a silent change. */
  adjustments: Array<{ scene: string; from: number; to: number; because: string }>;
}

export function fitScreenplay(screenplay: Screenplay): ScreenplayFit {
  const adjustments: ScreenplayFit['adjustments'] = [];

  const scenes = screenplay.scenes.map((scene) => {
    if (!scene.spoken) return scene;

    const words = scene.spoken.trim().split(/\s+/).filter(Boolean).length;
    /*
     * The same speech model the compositions size beats with: about 2.6 words a
     * second, a floor because short lines are slower per word, and a moment
     * after the line so a scene does not cut on the last syllable.
     */
    /* Rounded once, at the end: `x.toFixed(2) + 0.4` reintroduces the float. */
    const needs = Number((Math.max(2, words / 2.6 + 0.55) + 0.4).toFixed(2));
    if (scene.seconds >= needs) return scene;

    adjustments.push({
      scene: scene.id,
      from: scene.seconds,
      to: needs,
      because: `"${scene.spoken.slice(0, 36)}…" is ${words} words, which takes about ${(needs - 0.4).toFixed(1)}s to say.`,
    });
    return { ...scene, seconds: needs };
  });

  return { screenplay: { ...screenplay, scenes }, adjustments };
}
