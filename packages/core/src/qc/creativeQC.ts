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
  imageProvenance?: 'product' | 'captured' | 'generated' | 'operator';
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
  platform: string;
  durationSeconds?: number;
  /**
   * Creative types used on this account recently, most recent first. Repetition
   * is a creative defect even when each individual piece is fine.
   */
  recentTypes?: string[];
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
  const cardShare = (beats.length - footageBeats) / beats.length;

  /*
   * The rule this gate exists for.
   *
   * A capture was available and the plan used none of it. That is not a
   * technical fault — every frame is legal and the picture changes on cadence —
   * it is the creative decision the operator rejected by name.
   */
  if (input.footageAvailable && footageBeats === 0) {
    findings.push({
      rule: 'creative.unused_product_footage',
      severity: 'error',
      message:
        'A recording of the product exists and this creative shows none of it — every beat is a text card.',
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
    if (beat.imageProvenance !== 'generated') return;
    if (!EVIDENTIAL_ROLES.includes(beat.role)) return;
    findings.push({
      rule: 'creative.fabricated_evidence',
      severity: 'error',
      message: `Beat ${index + 1} is a "${beat.role}" backed by a generated image. That presents an invented picture as product evidence.`,
      detail:
        'Generated imagery may illustrate and may never evidence. Use a product image or a capture here, or make the beat decorative.',
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
