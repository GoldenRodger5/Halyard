/**
 * Gate 3c — is this creative worth publishing, as creative? §205.
 *
 * Every existing gate answers a *technical* question. Visual QC asks whether
 * the frame is legal; retention asks whether the picture changes often enough;
 * audio asks whether the loudness is right. A video can pass all of them and
 * still be the thing the operator objected to: a stack of text cards with a
 * word swapping on each one, when a recording of the product doing the thing
 * was sitting in the database unused.
 *
 * ## Why this cannot be a pixel rule
 *
 * §73 and §74 already walked this road. Mean-frame luminance could not see a
 * light card with dark text changing, so the motion signal became tonal range —
 * which works, and which a card sequence *also satisfies*, because each new
 * card is a genuine visual state change. A four-second cadence of cards passes
 * the pattern-interrupt rule honestly. No threshold on that signal separates
 * "cards changing" from "product being used", because at the level of pixels
 * they are the same event.
 *
 * The difference is structural, and it is knowable without looking at a single
 * frame: **did this piece use the strongest evidence it had?** A plan that laid
 * out seven cards while a fresh capture of the product existed made a creative
 * choice, and it made the wrong one.
 *
 * ## What it deliberately does not do
 *
 * It does not fail card-based creative *as such*. An artifact with no capture
 * has nothing better to show, and failing it would produce a defect no
 * correction could clear — a gate that fails what cannot be fixed is a gate
 * that gets switched off. The rule fires on the gap between what was available
 * and what was used.
 *
 * Pure, over a plan and a few facts. No media, no model, no network — the same
 * arrangement as every other rule module here, so it is identical in the worker
 * and the UI and testable without a render.
 */

import { EVIDENTIAL_ROLES } from '../imagery/types.js';

export { EVIDENTIAL_ROLES };

export interface CreativeQCBeat {
  role: string;
  emphasis: 'quick' | 'normal' | 'hold';
  /** Present when the beat plays captured footage. */
  hasMedia?: boolean;
  /**
   * §478. Present when the beat plays licensed footage. Motion, not evidence:
   * it keeps the beat from being a card and satisfies nothing about the product.
   */
  hasFootage?: boolean;
  /** Words drawn on this beat, when known. */
  wordCount?: number;
  /**
   * Where this beat's still came from, when it has one. §213.
   *
   * The gate repeats the planner's provenance check against the rendered
   * artifact, because a planner is a thing that can be bypassed — by a
   * correction, by a hand-edited render row, by a future caller — and a gate
   * is not.
   */
  imageProvenance?: 'product' | 'captured' | 'generated' | 'operator' | 'licensed';
}

export interface CreativeQCInput {
  creativeType: string;
  beats: CreativeQCBeat[];
  /**
   * Whether a usable capture of the product existed when this was planned.
   *
   * The whole gate turns on this. Supplied by the caller, which knows; the rule
   * never goes looking for a file, exactly as `planBeforeAfter` does not.
   */
  footageAvailable: boolean;
  /**
   * Whether this piece's claims are *about the product*. §413.
   *
   * `unused_product_footage` fires when a capture existed and no beat used it,
   * and it fired on **every format**, at error severity, failing the piece. For
   * a `transformation` or a `walkthrough` that is the rule working: the product
   * doing the thing is the claim, and a card asserting it instead is weaker.
   *
   * For a `history` piece on why bread goes stale it is nonsense. Showing the
   * app in an explainer about starch retrogradation would be the defect, not
   * the fix — and the gate was failing the piece for declining to commit it.
   *
   * The same line §291 draws for claim verification and §405 for the caption
   * prompt: a format whose factuality is not `product` is not about the
   * artifact, and nothing downstream should assume it is.
   *
   * Defaults true, so a caller that does not say keeps the old behaviour rather
   * than silently switching the gate off.
   */
  aboutTheProduct?: boolean;
  platform: string;
  durationSeconds?: number;
  /**
   * Creative types used on this account recently, most recent first. Repetition
   * is a creative defect even when each individual piece is fine.
   */
  recentTypes?: string[];
  /*
   * §234. The rest of the creative record, so the gate can judge more than
   * beat structure. Every field is optional and an absent one produces an
   * `unmeasured` entry rather than a pass — gotcha 6: a skipped gate is not a
   * passed gate.
   */
  /** The visual language the director chose. */
  visualLanguage?: string | null;
  /** The typography system id. */
  typography?: string | null;
  /** The opening composition. */
  opening?: string | null;
  /** Motion per beat, for pacing and density. */
  motions?: Array<{ entrance: string; camera: string; transitionOut: string }>;
  /** Recent creative history, most recent first. */
  recentLanguages?: string[];
  recentOpenings?: string[];
  recentTypography?: string[];
  /** Whether a bed was actually mixed in, and why not if not. */
  hasMusic?: boolean;
  musicSkippedReason?: string | null;
  /** Measured loudness of the finished mix. */
  lufs?: number | null;
  /** Alt text on the rendered asset. */
  altText?: string | null;
  /** Cuts per minute this platform's variant asked for. */
  targetCutsPerMinute?: number | null;
}

export interface CreativeFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
  /** Which beat, when the finding is about one. */
  beatIndex?: number;
  /** What a correction should change. Consumed by the correction policy. */
  correction:
    | 'use_captured_footage'
    | 'vary_treatment'
    | 'reduce_text'
    | 'add_payoff'
    | 'restructure_beats'
    | 'replace_fabricated_image';
}

export interface CreativeQCResult {
  passed: boolean;
  findings: CreativeFinding[];
  summary: string;
  /** Share of beats that are cards rather than footage, 0..1. */
  cardShare: number;
  /** Rules that could not run, named rather than silently passed (gotcha 6). */
  unmeasured: string[];
}

/**
 * Languages whose grammar is uniform movement, so "everything moves" is the
 * design rather than a defect. §234.
 *
 * Found by running the gate on a real production render: a
 * `premium_instructional` piece was warned for constant motion, and that
 * language deliberately slides every beat in from the same side so the
 * sequence reads as a sequence. `editorial_food` pushes continuously for the
 * same kind of reason. A rule that fires on every piece in a language is not a
 * finding, it is noise — and noise is how a warning stops being read.
 */
const UNIFORM_BY_DESIGN = new Set(['premium_instructional', 'editorial_food', 'cinematic']);

/** Words on screen a viewer will actually read in a short-form beat. */
export const MAX_WORDS_PER_BEAT = 18;
/** How many of the last posts count when judging repetition. */
export const REPETITION_WINDOW = 4;

export function runCreativeQC(input: CreativeQCInput): CreativeQCResult {
  const findings: CreativeFinding[] = [];
  const unmeasured: string[] = [];
  const beats = input.beats ?? [];

  if (beats.length === 0) {
    return {
      passed: false,
      findings: [
        {
          rule: 'creative.no_beats',
          severity: 'error',
          message: 'The creative has no beats. There is nothing to publish.',
          correction: 'restructure_beats',
        },
      ],
      summary: 'No beats.',
      cardShare: 1,
      unmeasured: [],
    };
  }

  const footageBeats = beats.filter((b) => b.hasMedia).length;
  /* §478. A licensed clip is not a card; it is also not the product. Two counts. */
  const movingBeats = beats.filter((b) => b.hasMedia || b.hasFootage).length;
  const cardShare = (beats.length - movingBeats) / beats.length;

  /*
   * The rule this gate exists for.
   *
   * A capture was available and the plan used none of it. That is not a
   * technical fault — every frame is legal and the picture changes on cadence —
   * it is the creative decision the operator rejected by name.
   */
  if (input.footageAvailable && footageBeats === 0 && input.aboutTheProduct !== false) {
    findings.push({
      rule: 'creative.unused_product_footage',
      severity: 'error',
      message:
        'A recording of the product exists and this creative, which is about the product, shows none of it.',
      detail:
        'A card claiming the product does something is an assertion; footage of it happening is the thing itself. ' +
        'Show the capture on the strongest beat.',
      correction: 'use_captured_footage',
    });
  }

  if (!input.footageAvailable) {
    /*
     * Named rather than silently passed. `passed` here means "nothing that ran
     * found an error", and a caller reading a tick without this list would
     * think the strongest rule had cleared (gotcha 6).
     */
    unmeasured.push('creative.unused_product_footage');
  }

  /*
   * §213. A generated picture standing where proof belongs.
   *
   * The most serious defect this gate can raise. A model-drawn atmosphere shot
   * is illustration and is fine; the same image under a `demo` or `proof` beat
   * is a picture presented as evidence of product behaviour, and a picture is
   * believed in a way a text card is not. Gotcha 9 and §2.4 both forbid it, and
   * this is the layer that cannot be bypassed.
   */
  beats.forEach((beat, index) => {
    if (beat.imageProvenance !== 'generated' && beat.imageProvenance !== 'licensed') return;
    if (!EVIDENTIAL_ROLES.includes(beat.role)) return;
    findings.push({
      rule: 'creative.fabricated_evidence',
      severity: 'error',
      message: `Beat ${index + 1} is a "${beat.role}" backed by ${beat.imageProvenance === 'licensed' ? "a licensed clip of somebody else's kitchen" : 'a generated image'}. That presents a picture that is not the product as product evidence.`,
      detail:
        'Generated and licensed imagery may illustrate and may never evidence. Use a product image or a capture here, or make the beat decorative.',
      beatIndex: index,
      correction: 'replace_fabricated_image',
    });
  });

  /*
   * Monotony. One role for the whole piece is a slideshow whatever the plan
   * calls it — the viewer sees the same frame layout for the entire runtime.
   * The hook is excluded: every treatment opens on one, and counting it would
   * make a two-beat piece look varied.
   */
  const bodyRoles = beats.slice(1).map((b) => b.role);
  const distinct = new Set(bodyRoles);
  if (bodyRoles.length >= 3 && distinct.size === 1) {
    findings.push({
      rule: 'creative.single_role',
      severity: 'error',
      message: `Every beat after the hook is a "${[...distinct][0]}". The piece has one shape for its whole runtime.`,
      detail: 'A viewer reads an unchanging layout as one long card, however often the words swap.',
      correction: 'restructure_beats',
    });
  }

  /*
   * No payoff. Something has to be the moment the piece exists for, and a plan
   * where every beat carries equal weight lands on nothing.
   */
  if (beats.length >= 3 && !beats.some((b) => b.emphasis === 'hold')) {
    findings.push({
      rule: 'creative.no_payoff',
      severity: 'warning',
      message: 'No beat is held. Nothing in the piece is the moment it exists for.',
      correction: 'add_payoff',
    });
  }

  /* Text density, per beat, where the words are known. */
  let measuredWords = 0;
  beats.forEach((beat, index) => {
    if (beat.wordCount === undefined) return;
    measuredWords += 1;
    if (beat.wordCount > MAX_WORDS_PER_BEAT) {
      findings.push({
        rule: 'creative.text_density',
        severity: 'warning',
        message: `Beat ${index + 1} carries ${beat.wordCount} words. Over ${MAX_WORDS_PER_BEAT} stops being read and starts being skipped.`,
        beatIndex: index,
        correction: 'reduce_text',
      });
    }
  });
  if (measuredWords === 0) unmeasured.push('creative.text_density');

  /*
   * Repetition across the account. Each piece can be fine and the sequence
   * still be monotonous, which is the portfolio concern §6 of the specification
   * raises. An error rather than a warning at three in a row: by then it is the
   * account's only format.
   */
  const recent = (input.recentTypes ?? []).slice(0, REPETITION_WINDOW);
  const consecutive = (() => {
    let n = 0;
    for (const t of recent) {
      if (t !== input.creativeType) break;
      n += 1;
    }
    return n;
  })();
  if (consecutive >= 3) {
    findings.push({
      rule: 'creative.repeated_treatment',
      severity: 'error',
      message: `The last ${consecutive} posts on this account were also "${input.creativeType}".`,
      detail: 'A treatment that becomes the only treatment is a template, whatever it was chosen for.',
      correction: 'vary_treatment',
    });
  } else if (consecutive === 2) {
    findings.push({
      rule: 'creative.repeated_treatment',
      severity: 'warning',
      message: `The last 2 posts on this account were also "${input.creativeType}".`,
      correction: 'vary_treatment',
    });
  }
  if ((input.recentTypes ?? []).length === 0) unmeasured.push('creative.repeated_treatment');

  /*
   * §234. Pacing, measured against what the platform variant asked for.
   *
   * A 30-second piece with three beats is a slideshow on TikTok and correct
   * on YouTube. The number to judge against is the variant's, not a constant,
   * which is why this is `unmeasured` rather than skipped when absent.
   */
  if (input.targetCutsPerMinute && input.durationSeconds && input.durationSeconds > 0) {
    const actual = (beats.length / input.durationSeconds) * 60;
    /* Half the target is the point at which a viewer reads it as static. */
    if (actual < input.targetCutsPerMinute * 0.5) {
      findings.push({
        rule: 'creative.pacing_too_slow',
        severity: 'error',
        message: `${actual.toFixed(1)} cuts per minute against a target of ${input.targetCutsPerMinute}.`,
        detail:
          'At under half the pacing this platform expects, the piece reads as a slideshow ' +
          'rather than an edit. Either more beats or a shorter runtime.',
        correction: 'restructure_beats',
      });
    }
  } else {
    unmeasured.push('creative.pacing_too_slow');
  }

  /*
   * Motion density. A piece where nothing moves is a stack of cards; a piece
   * where everything moves is exhausting. Both fail, and they need different
   * corrections.
   */
  if (input.motions && input.motions.length > 0) {
    /*
     * §505. What the viewer sees move, not what the camera was told to do.
     *
     * This counted camera moves and entrances only, which was the whole story
     * while every ground was a still. A beat carrying licensed footage moves
     * whatever its camera does — and the right camera for such a beat is
     * `hold`, because a push on an already-moving clip is two motions
     * fighting. Counting only the camera would therefore call the best-composed
     * footage beat motionless, and read a piece that never stops moving as
     * restful.
     */
    const moving = input.motions.filter(
      (m, i) => m.camera !== 'still' || m.entrance !== 'none' || beats[i]?.hasFootage === true,
    ).length;
    const share = moving / input.motions.length;
    if (share === 0) {
      findings.push({
        rule: 'creative.no_motion',
        severity: 'error',
        message: 'Nothing moves in any beat.',
        detail: 'Every beat is a still card with a hard entrance. This is a slideshow.',
        correction: 'restructure_beats',
      });
    } else if (
      share === 1 &&
      input.motions.length > 3 &&
      !UNIFORM_BY_DESIGN.has(input.visualLanguage ?? '')
    ) {
      findings.push({
        rule: 'creative.constant_motion',
        severity: 'warning',
        message: 'Every beat moves.',
        detail:
          'Continuous movement across every beat removes the contrast that makes any one ' +
          'move mean something. A still beat is what makes the next push land.',
        correction: 'restructure_beats',
      });
    }
  } else {
    unmeasured.push('creative.no_motion');
  }

  /*
   * Repetition beyond treatment. §226-§229 gave a piece a language, a
   * typography system and an opening; each is a way for consecutive posts to
   * look identical while the treatment differs, which is the hole the original
   * repetition rule left.
   */
  const repetitionChecks: Array<[string, string | null | undefined, string[] | undefined, string]> = [
    ['creative.repeated_language', input.visualLanguage, input.recentLanguages, 'visual language'],
    ['creative.repeated_opening', input.opening, input.recentOpenings, 'opening composition'],
    ['creative.repeated_typography', input.typography, input.recentTypography, 'typography system'],
  ];
  for (const [rule, value, recent, label] of repetitionChecks) {
    if (!value || !recent) {
      unmeasured.push(rule);
      continue;
    }
    if (recent.length > 0 && recent[0] === value) {
      findings.push({
        rule,
        severity: 'warning',
        message: `The same ${label} as the previous post (${value}).`,
        detail: `Two consecutive posts sharing a ${label} is the repetition a viewer actually notices.`,
        correction: 'vary_treatment',
      });
    }
  }

  /*
   * Audio. Silence is a legitimate style; an *unexplained* silence is a bug —
   * §221's argument, enforced.
   */
  if (input.hasMusic === false && !input.musicSkippedReason) {
    findings.push({
      rule: 'creative.unexplained_silence',
      severity: 'warning',
      message: 'No music bed, and no reason recorded.',
      detail:
        'Narration alone is a normal short-form style. Silence with no recorded reason is ' +
        'indistinguishable from a bed that failed to mix, which is the state nobody notices.',
      correction: 'restructure_beats',
    });
  }

  if (typeof input.lufs === 'number') {
    /* Platforms normalise to about -14 LUFS. Far outside that is either quiet
       enough to be skipped past or loud enough to be turned down. */
    if (input.lufs < -20 || input.lufs > -9) {
      findings.push({
        rule: 'creative.loudness_off_target',
        severity: 'warning',
        message: `Mix measures ${input.lufs.toFixed(1)} LUFS.`,
        detail: 'Platforms normalise to roughly -14 LUFS; far outside that is turned down or lost.',
        correction: 'restructure_beats',
      });
    }
  } else {
    unmeasured.push('creative.loudness_off_target');
  }

  /* Accessibility. The audit named missing alt text as the standing gap. */
  if (input.altText === undefined) {
    unmeasured.push('creative.missing_alt_text');
  } else if (!input.altText?.trim()) {
    findings.push({
      rule: 'creative.missing_alt_text',
      severity: 'warning',
      message: 'No alt text.',
      detail: 'A rendered asset with no alt text is unusable to anyone reading with a screen reader.',
      correction: 'restructure_beats',
    });
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const passed = errors.length === 0;

  const summary = passed
    ? `${beats.length} beats, ${Math.round((1 - cardShare) * 100)}% footage` +
      (findings.length > 0 ? `, ${findings.length} warning${findings.length === 1 ? '' : 's'}` : '')
    : errors[0]!.message;

  return {
    passed,
    findings,
    summary,
    cardShare: Math.round(cardShare * 100) / 100,
    unmeasured,
  };
}
