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
  /**
   * §441. Which written line this scene stages: `question:2`, `close:0`.
   *
   * The whole reason the screenplay drove nothing (§132). Every field a scene
   * carries — `move`, `weight`, `ground`, `score`, `seconds`, `gestures` — was
   * validated, stored, and rendered in the Gallery, and not one reached the
   * renderer, because there was **no way to say which rendered beat a scene was
   * about**. `videoForFormat` builds beats from slots; the screenplay described
   * scenes; nothing connected the two.
   *
   * A fuzzy match on text was the obvious bridge and is the wrong one: the
   * screenwriter is explicitly allowed to shorten a line for the screen ("You
   * may shorten a line for the screen. You may not change what it says"), so
   * the two strings legitimately differ, and a matcher tuned to that would fail
   * silently in exactly the cases staging did the most work.
   *
   * So the key is carried instead. It is the same `key:index` pair
   * `expandSlots` numbers and `checkDraft` looks up — one identifier, three
   * readers, no third opinion about which line is which.
   *
   * Null for a drafting screenplay, where no slots existed to stage. Such a
   * screenplay directs nothing and never could; it is the first draft of a
   * piece rather than the staging of one.
   */
  slotKey: string | null;
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
    /**
     * Whether footage of a subject can be found for this piece.
     *
     * §478. Until now this meant "the operator filmed something", and was false
     * on every piece ever staged. It now also means a licensed b-roll source is
     * configured — either way, a `footage` scene can be honoured.
     */
    hasFootage: boolean;
    /**
     * §478. Whether a recording of the *product* exists. Separate from
     * `hasFootage` because stock can show hands and dough and never the app,
     * and a check that let one stand for the other would render a blank frame
     * where a scene expected the software.
     */
    hasProductCapture?: boolean;
    /**
     * §340. The content the format writer produced, which this piece must carry.
     *
     * A screenplay is what a video is **based on**, not a parallel invention of
     * the same piece. When a format has already written its slots — a quiz's
     * questions and answers, sourced and checked (§282, §300) — the screenplay
     * *stages* them: decides what is spoken, what is read, where the emphasis
     * falls, what the score does.
     *
     * Absent for a format with no written content, where the screenplay is the
     * first draft rather than a staging of one.
     */
    slots?: ReadonlyArray<{ key: string; index: number; text: string }>;
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

  /*
   * §339. The opening cannot be an afterthought.
   *
   * The first real RecipeFix screenplay opened on a `support` hook and did not
   * reach a `lead` until 18 seconds in — past the point every channel brief
   * says a viewer has decided. A hook weighted `aside` is a piece that opens
   * apologising.
   */
  const opening = screenplay.scenes[0];
  if (opening && opening.weight === 'aside') {
    problems.push({
      scene: opening.id,
      rule: 'weak_opening',
      detail:
        'The first scene is weighted `aside`. Whatever the channel, the opening is the only ' +
        'scene guaranteed to be seen.',
    });
  }

  /*
   * §340. Everything written must reach the screen, and nothing else may.
   *
   * The first standalone run invented three quiz questions — *"was it the
   * story, the mood, the people, or the night?"* — which is not a question
   * anybody can be right or wrong about, and it revealed no answers at all.
   * The format writer had produced none of it, so `planQuestion` never chose a
   * question kind, `checkQuestion` never verified an answer was among its
   * options, and the citation gate never saw a claim.
   *
   * A screenplay that writes its own content is a second copywriter with none
   * of the first one's gates.
   */
  if (available.slots && available.slots.length > 0) {
    const said = screenplay.scenes
      .flatMap((scene) => [scene.spoken ?? '', ...scene.onScreen])
      .join(' ')
      .toLowerCase();

    for (const slot of available.slots) {
      /* The distinctive words of the slot, so a rephrasing still counts. */
      const words = slot.text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 4);
      if (words.length === 0) continue;
      const carried = words.filter((w) => said.includes(w)).length / words.length;
      if (carried < 0.4) {
        problems.push({
          scene: '(whole piece)',
          rule: 'content_dropped',
          detail:
            `"${slot.key}[${slot.index}]" was written for this piece and does not reach the ` +
            `screen: "${slot.text.slice(0, 48)}…". A screenplay stages written content; it does ` +
            'not replace it.',
        });
      }
    }
  }

  /**
   * §441. The keys that carry direction to the screen, checked like any other
   * direction: can the machinery downstream execute it?
   *
   * A `slotKey` naming a line this piece does not have is exactly the shape
   * this function exists to refuse — a direction that validates, stores,
   * displays, and then reaches nothing. It is worse than a missing key, because
   * a missing key is honestly inert and a wrong one looks connected.
   *
   * Two keys on the same line is the other half: the second silently wins and
   * the first scene's staging is discarded, which is invisible in the output.
   */
  if (available.slots && available.slots.length > 0) {
    const real = new Set(available.slots.map((slot) => `${slot.key}:${slot.index}`));
    const claimed = new Map<string, string>();
    for (const scene of screenplay.scenes) {
      if (!scene.slotKey) continue;
      if (!real.has(scene.slotKey)) {
        problems.push({
          scene: scene.id,
          rule: 'unknown_slot_key',
          detail:
            `slotKey "${scene.slotKey}" names no line in this piece. ` +
            `The lines are: ${[...real].join(', ')}.`,
        });
        continue;
      }
      const already = claimed.get(scene.slotKey);
      if (already) {
        problems.push({
          scene: scene.id,
          rule: 'duplicate_slot_key',
          detail: `"${scene.slotKey}" is already staged by scene ${already}. One line, one scene.`,
        });
      }
      claimed.set(scene.slotKey, scene.id);
    }
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

    /*
     * §339. Both moving grounds, not only the product one.
     *
     * This checked `product_capture` alone, and the first real RecipeFix
     * screenplay asked for `footage — hands kneading wheat dough` with
     * `hasFootage: false`. It passed, and would have rendered a blank frame
     * where a scene expected film.
     *
     * `footage` is filmed material somebody shot and `product_capture` is a
     * recording of the software; neither can be conjured, and the check that
     * covered one of them read as covering both.
     */
    const footageMissing =
      (scene.ground === 'footage' && !available.hasFootage) ||
      (scene.ground === 'product_capture' && !(available.hasProductCapture ?? false));
    if (footageMissing) {
      problems.push({
        scene: scene.id,
        rule: 'no_footage',
        detail:
          `The scene calls for ${scene.ground.replace('_', ' ')} and none exists. §163: there is ` +
          'no placeholder, because substituting one is a claim about something nobody filmed.',
      });
    }
    /*
     * §478. Footage is found by searching for its subject. A footage scene with
     * no subject is a scene nobody can fill, and it would fall silently back to
     * a photograph — a decision the screenplay did not make.
     */
    if (scene.ground === 'footage' && available.hasFootage && !scene.groundSubject?.trim()) {
      problems.push({
        scene: scene.id,
        rule: 'footage_without_subject',
        detail: 'The scene calls for footage and does not say of what. Name what is happening in `groundSubject`.',
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

export function fitScreenplay(
  screenplay: Screenplay,
  /**
   * §347. The channel's ceiling, when the caller wants it enforced.
   *
   * Omitted, only the per-scene timing is repaired. Supplied, a piece that runs
   * over is *cut* — which is what an editor does and what the alternative
   * cannot be: shortening every scene to fit would put every line back over its
   * own beat, which is the fault this function exists to fix.
   */
  ceilingSeconds?: number,
): ScreenplayFit {
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

  if (ceilingSeconds === undefined) {
    return { screenplay: { ...screenplay, scenes }, adjustments };
  }

  /*
   * §347. Over the ceiling: cut, do not squeeze.
   *
   * A Kinolog quiz came in at 46.5s against a 45s ceiling — a genuine refusal
   * under §335 and a bad place to stop, because the fix an editor makes is
   * obvious: drop the least important scene.
   *
   * Asides first, then supports, and **never a lead**. A piece that has been
   * cut down to nothing but its leads is a piece that has been edited; a piece
   * that lost its lead is a different piece. If cutting every non-lead scene
   * still leaves it over, that is a real refusal — there is more here than the
   * channel can carry, and the answer is a shorter script.
   */
  const kept = [...scenes];
  const dropped: typeof adjustments = [];
  const total = () => kept.reduce((sum, scene) => sum + scene.seconds, 0);

  for (const weight of ['aside', 'support'] as const) {
    while (total() > ceilingSeconds) {
      /* The longest of that weight: cutting the biggest thing costs fewest cuts. */
      const candidates = kept
        .map((scene, index) => ({ scene, index }))
        .filter((entry) => entry.scene.weight === weight)
        .sort((a, b) => b.scene.seconds - a.scene.seconds);
      if (candidates.length === 0) break;

      const victim = candidates[0]!;
      kept.splice(victim.index, 1);
      dropped.push({
        scene: victim.scene.id,
        from: victim.scene.seconds,
        to: 0,
        because:
          `the piece ran ${(total() + victim.scene.seconds).toFixed(1)}s against a ` +
          `${ceilingSeconds}s ceiling, and this was the longest ${weight} scene`,
      });
    }
  }

  return {
    screenplay: { ...screenplay, scenes: kept },
    adjustments: [...adjustments, ...dropped],
  };
}
