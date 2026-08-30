/**
 * §373. What an operator can ask for, in the machine's own vocabulary.
 *
 * The correction loop (§165) is thorough and is driven entirely by the *gates*.
 * An operator watching a finished piece and thinking "the picture is wrong" has
 * exactly one route into it: Regenerate with a free-text note, which reaches
 * the copywriter as `regenNote`. So "the picture is wrong" rewrites the copy,
 * which is the wrong component, and the picture comes back identical.
 *
 * The UI spec asks for free text **or adjustment buttons**, and the buttons are
 * the interesting half. A named adjustment is not a shorter way of typing: it
 * carries the one thing free text cannot, which is **which part to rebuild**.
 * A model reading "make it slower" has to infer whether that means the scene
 * timings, the voice, or the cuts, and it will sometimes infer wrong and
 * quietly rewrite something that was fine.
 *
 * So each adjustment declares its component and its action, and the existing
 * invalidation rules decide what has to be rebuilt as a consequence. Nothing
 * here re-implements the loop; it supplies an entry point the loop already
 * knows how to handle.
 *
 * ## Free text still exists, and is still worth having
 *
 * An operator's own sentence carries the *reason*, which no button can. The two
 * travel together: the button says what to rebuild, the note says why, and the
 * note reaches whichever agent the component names — so "the picture is wrong,
 * it's a photo of flour and this is about bread" retargets the image agent
 * rather than the copywriter.
 */
import type { Component, CorrectionAction } from './defects.js';

export interface Adjustment {
  id: string;
  /** What the operator reads on the button. */
  label: string;
  /** One line saying what it will actually do. */
  does: string;
  component: Component;
  action: CorrectionAction;
  /**
   * Whether this only makes sense for a piece with scenes.
   *
   * A caption has no timing to adjust, and offering the button anyway is the
   * "greyed out with no reason" failure the wizard already avoids.
   */
  needsScenes?: boolean;
  /** Whether this only makes sense for a piece that is spoken. */
  needsVoice?: boolean;
  /** Whether this only makes sense for a piece with a picture. */
  needsImage?: boolean;
}

export const ADJUSTMENTS: Adjustment[] = [
  {
    id: 'rewrite',
    label: 'Say it differently',
    does: 'Rewrites the copy against your note, keeping the facts and the sources.',
    component: 'copy',
    action: 'revise_copy',
  },
  {
    id: 'reground',
    label: 'Check the claims again',
    does: 'Re-reads every source and refuses any claim that no longer holds.',
    component: 'claims',
    action: 'reground_claims',
  },
  {
    id: 'different_picture',
    label: 'Different picture',
    does: 'Chooses a new subject and generates the ground again. The words do not change.',
    component: 'creative_plan',
    action: 'adjust_caption_treatment',
    needsImage: true,
  },
  {
    id: 'reread',
    label: 'Read it again',
    does: 'Re-synthesises the voice. Same words, new take.',
    component: 'voiceover',
    action: 'resynthesise_voiceover',
    needsVoice: true,
  },
  {
    id: 'rewrite_narration',
    label: 'Change what is said',
    does: 'Rewrites the spoken script, then re-reads it.',
    component: 'vo_script',
    action: 'rewrite_vo_script',
    needsVoice: true,
  },
  {
    id: 'slower',
    label: 'Slower',
    does: 'Lengthens the scenes so lines have room, within the channel’s budget.',
    component: 'composition',
    action: 'adjust_scene_timing',
    needsScenes: true,
  },
  {
    id: 'reorder',
    label: 'Different order',
    does: 'Restages the scenes. The opening is the one that changes most.',
    component: 'composition',
    action: 'resequence_scenes',
    needsScenes: true,
  },
  {
    id: 'captions',
    label: 'Change the captions',
    does: 'Adjusts how burned-in text is set — size, placement and grouping.',
    component: 'caption_style',
    action: 'adjust_caption_treatment',
    needsScenes: true,
  },
];

export interface PieceShape {
  /** Whether the piece has scenes — a video or a carousel, not a caption. */
  hasScenes: boolean;
  /** Whether anybody speaks. */
  hasVoice: boolean;
  /** Whether there is a picture to replace. */
  hasImage: boolean;
}

/**
 * The adjustments that make sense for this piece, and why the rest do not.
 *
 * Both halves returned, because the wizard's rule applies here too: nothing is
 * hidden, and anything unavailable says why. An operator who cannot find
 * "Slower" on a text post should be told a text post has no scenes rather than
 * left wondering whether the button exists.
 */
export function adjustmentsFor(shape: PieceShape): {
  available: Adjustment[];
  unavailable: Array<{ adjustment: Adjustment; because: string }>;
} {
  const available: Adjustment[] = [];
  const unavailable: Array<{ adjustment: Adjustment; because: string }> = [];

  for (const adjustment of ADJUSTMENTS) {
    if (adjustment.needsScenes && !shape.hasScenes) {
      unavailable.push({
        adjustment,
        because: 'This piece has no scenes, so there is no timing or order to change.',
      });
      continue;
    }
    if (adjustment.needsVoice && !shape.hasVoice) {
      unavailable.push({
        adjustment,
        because: 'Nobody speaks in this piece.',
      });
      continue;
    }
    if (adjustment.needsImage && !shape.hasImage) {
      unavailable.push({
        adjustment,
        because: 'This piece has no picture to replace.',
      });
      continue;
    }
    available.push(adjustment);
  }

  return { available, unavailable };
}

export function adjustmentById(id: string): Adjustment | null {
  return ADJUSTMENTS.find((a) => a.id === id) ?? null;
}
