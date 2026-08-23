/**
 * How a beat's *role* becomes pixels.
 *
 * §162. `TransformationDiffVideo` rendered beats through a chain of
 * `if (beat.role === …)` inside itself, so a second creative type meant either
 * editing that file or copying its sequencing, timing and caption wiring into a
 * new one. Both answers are wrong: the first makes one composition the home of
 * every creative type, the second forks the timing engine.
 *
 * The seam is a **treatment set** — a map from semantic role to a component.
 * The sequencing, the `Scene[]` timing and the captions live here once, and a
 * composition supplies only the mapping. `before_after` maps `change` to a
 * transformation card; a future `tutorial` maps `step` to a numbered
 * instruction, and the transformation file is never touched.
 *
 * What deliberately does **not** live here: which beats exist, in what order,
 * and how long each one lasts. That is `CreativePlan` (§160), which is decided
 * from artifact facts before anything renders. This file only knows how to draw
 * a beat it is handed.
 *
 * Browser bundle, so nothing Node-only (gotcha 10).
 */
import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BrandTokens } from '../brand.js';
import { layoutScenes, type CaptionCue, type Scene } from './timing.js';

/** 12% safe area top and bottom on 9:16 (v2 F.3). */
export const SAFE_PERCENT = 12;

/** Horizontal gutter for every beat. Shared so the card can measure its own band. */
export const PAGE_PADDING = 72;

/**
 * Where the caption band starts, as a percentage of frame height.
 *
 * Captions sit at `bottom: 16%` and are up to two lines, so they occupy roughly
 * the bottom quarter. Content must end above it: §160's frames showed copy
 * centred in the *whole* canvas, which put a dead third across the top while
 * the words crowded the caption.
 */
export const CAPTION_BAND_TOP_PERCENT = 72;

/** A beat as it reaches the renderer: the plan's decision, already timed. */
export interface RenderableBeat {
  id: string;
  role: string;
  weight: number;
  minSeconds: number;
  /**
   * A ceiling on this beat, for footage. §163.
   *
   * Set by the planner for a beat whose length is a fact rather than a choice.
   * Dropping it here is exactly how a capped demo beat still ran 8.7s over 3.8s
   * of footage: the cap reached the render row and then never reached the
   * timing engine.
   */
  maxSeconds?: number;
  emphasis?: 'quick' | 'normal' | 'hold';
  content?: { before?: string; after?: string; reason?: string; text?: string };
  /**
   * Captured product footage for this beat. §163.
   *
   * A filename inside the render package's public directory, already cut to the
   * spans worth watching. Generic: any product whose adapter produces a capture
   * can set it, and a beat without one renders exactly as before.
   */
  media?: { file: string; label?: string };
  /**
   * Where in the artifact this beat came from. §169.
   *
   * Carried so a stored render is traceable to its evidence, the same way
   * `claims[].source` is. Deliberately **not drawn**: a viewer has no use for
   * `steps[3].updated_note`, and putting an internal path on a social post
   * would be noise pretending to be rigour. It is here for the operator
   * surface and for anything auditing a render after the fact.
   */
  sourcePath?: string;
}

export interface BeatViewProps {
  beat: RenderableBeat;
  brand: BrandTokens;
  /** The piece's headline, for treatments that fall back to it. */
  headline: string;
  /**
   * The room this beat actually has, in pixels.
   *
   * §167/§168. A treatment that sizes itself to its band needs to know the
   * band, and three places were deriving it from the safe area and the caption
   * constants independently. Computed once by `PlannedBeats` and threaded, so
   * the stage, the card and the footage cannot disagree — and so a treatment
   * needs no Remotion context to be testable, which is what lets the refusal in
   * `CapturedFootage` be asserted directly.
   */
  band: { width: number; height: number };
}

export type BeatTreatment = React.FC<BeatViewProps>;

/** Role → how to draw it. A creative type supplies one of these. */
export type TreatmentSet = Record<string, BeatTreatment>;

/**
 * Type scale by emphasis.
 *
 * §162. Emphasis was carried in the plan and spent entirely on duration, so the
 * hero transformation was merely *longer* — on a muted phone screen that is
 * nearly imperceptible. Scale makes it visible, and it is derived from the same
 * value rather than being a second knob someone can set inconsistently.
 */
export function scaleFor(emphasis: RenderableBeat['emphasis']): number {
  return emphasis === 'hold' ? 1.18 : emphasis === 'quick' ? 0.92 : 1;
}

/**
 * The content area: below the top safe line, above the caption band.
 *
 * Anchored to the bottom of that box rather than centred in it, so the copy sits
 * just above the captions and reads as one block. Centring inside the full frame
 * is what produced the dead top third.
 */
/**
 * Where a beat sits inside its band, by role.
 *
 * The opening carries no preceding context and competes with nothing, so it is
 * centred and commands the frame — bottom-anchoring it left more than half the
 * canvas empty above a title that is the only thing a scrolling viewer reads.
 *
 * A footage beat is centred for a different reason. It is a frame rather than a
 * block of copy: it has its own edges, and bottom-anchoring it left a quarter of
 * the canvas empty above the only thing on screen worth looking at. §163, found
 * by looking at a real render.
 *
 * Every other beat is bottom-anchored, so the copy sits directly above the
 * captions and the eye travels down one block instead of across a gap. This is
 * role-driven rather than per-composition: a future creative type gets the same
 * behaviour for its own opening beat without restating it.
 */
/**
 * Base type sizes for a transformation, before any scaling.
 *
 * Exported so the density calculation and the component cannot disagree about
 * what "base" means — the ratios between them *are* the hierarchy, and they are
 * preserved by every scale applied downstream.
 */
export const CARD_TYPE = {
  before: { size: 44, lineHeight: 1.25 },
  after: { size: 66, lineHeight: 1.12 },
  reason: { size: 32, lineHeight: 1.4 },
  /** Gaps between the three blocks, at base scale. */
  afterGap: 18,
  reasonGap: 22,
} as const;

/**
 * How much of the band a transformation should aim to occupy.
 *
 * Not 1.0, and deliberately: a card pressed against both edges of its band
 * reads as cramped, and the caption needs the eye to arrive at it rather than
 * collide with it. Two-thirds is enough for the transformation to dominate the
 * frame while still looking placed.
 */
export const CARD_TARGET_FILL = 0.62;

/**
 * How emphasis becomes frame presence.
 *
 * The planner decides which change is the hero (§160); this decides what that
 * means in pixels — how much of the band the beat commands. Expressing emphasis
 * as a *target* rather than as a multiplier applied afterwards is what keeps
 * the result bounded: every value here is comfortably under the 0.92 hard
 * ceiling, so a held card is bigger than a normal one and still cannot overrun
 * its band or the captions beneath it.
 */
export const EMPHASIS_FILL: Record<string, number> = {
  hold: 0.74,
  normal: 0.62,
  quick: 0.54,
};

/** Hard bounds on the density scale. Text does not grow until it fills the screen. */
export const CARD_SCALE_MIN = 0.8;
export const CARD_SCALE_MAX = 2.0;

/**
 * Roughly how wide a character is, as a fraction of the font size.
 *
 * An approximation, and it only needs to be one: it feeds a *scale* that is
 * clamped at both ends and then capped again against the real band, so being
 * wrong by a few percent moves the type slightly and can never overflow.
 * Measuring real glyph advances would mean shipping font metrics into a
 * component that renders inside Remotion's browser, for no visible gain.
 */
const AVERAGE_ADVANCE = 0.5;

function blockHeight(text: string, size: number, lineHeight: number, width: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * AVERAGE_ADVANCE)));
  const lines = Math.max(1, Math.ceil(text.length / perLine));
  return lines * size * lineHeight;
}

export interface CardContent {
  before?: string;
  after?: string;
  reason?: string;
}

/**
 * The height a transformation needs at base type sizes.
 *
 * A missing reason contributes nothing — no reserved block, no placeholder.
 * §160 refuses to invent a reason the artifact does not carry, and reserving
 * space for one would be the same fabrication expressed as layout.
 */
export function cardHeightAt(content: CardContent, width: number, scale = 1): number {
  let total = 0;
  if (content.before) {
    total +=
      blockHeight(content.before, CARD_TYPE.before.size * scale, CARD_TYPE.before.lineHeight, width) +
      CARD_TYPE.afterGap * scale;
  }
  if (content.after) {
    total += blockHeight(content.after, CARD_TYPE.after.size * scale, CARD_TYPE.after.lineHeight, width);
  }
  if (content.reason) {
    total +=
      CARD_TYPE.reasonGap * scale +
      blockHeight(content.reason, CARD_TYPE.reason.size * scale, CARD_TYPE.reason.lineHeight, width);
  }
  return total;
}

/**
 * How much to scale a transformation's type for the room it actually has.
 *
 * The problem this solves is not position. The type sizes were fixed constants
 * chosen for a dense card, so a short one — "2 large eggs" becoming "1 flax
 * egg" — drew about 330px of type into a 1152px band and left the rest empty.
 * Moving that block up or down cannot change how much of the frame the
 * transformation commands; only its size can. The hook headline was 96px and
 * the *transformation* was 66px, so the orientation line was typographically
 * louder than the thing the piece exists to show.
 *
 * Density scaling is **separate from emphasis and multiplies with it**. The
 * planner decides which change is the hero (§160); this decides how much room
 * the words in front of it need. Neither recomputes the other's judgement, and
 * a held beat stays visibly bigger than a normal one at the same density.
 *
 * Every ratio inside the card is preserved, so the hierarchy — after, then
 * before, then reason — is exactly as authored at any scale.
 */
export function cardDensityScale(
  content: CardContent,
  band: { width: number; height: number },
  emphasis?: string,
): number {
  if (band.height <= 0 || band.width <= 0) return 1;
  if (!content.before && !content.after && !content.reason) return 1;

  /*
   * Searched, not solved in closed form, because height is not linear in scale.
   *
   * Bigger type wraps sooner, so a card at 2× can be more than twice as tall —
   * the first version of this divided a target by the height at scale 1 and
   * overshot badly: a real transformation aimed at 62% of the band and landed
   * at 85%, because three lines had become five. Stepping down from the cap and
   * taking the first scale that genuinely fits accounts for rewrapping without
   * pretending the relationship is proportional.
   *
   * The step is coarse on purpose. Type sizes an eye can tell apart are not
   * 1% apart, and a coarse grid makes the output stable: small content edits do
   * not jitter the layout between renders.
   */
  return fitScale((scale) => cardHeightAt(content, band.width, scale), band.height, emphasis);
}

/**
 * Base type for the evidence note. Subordinate to a transformation by design.
 *
 * §169. The ratio to `CARD_TYPE.after` is the hierarchy *within the piece*: the
 * change is the claim and this explains it, so the explanation is never set
 * larger than the thing it explains at the same density.
 */
export const NOTE_TYPE = {
  label: { size: 28, lineHeight: 1.2 },
  body: { size: 54, lineHeight: 1.22 },
  gap: 18,
} as const;

/**
 * The largest scale at which a block still fits the room it is given.
 *
 * The search is shared; the **measurement is not**. Each treatment measures
 * itself at its own base sizes, because measuring with one base and rendering
 * at another silently misses the target — the evidence note did exactly that
 * on its first render, aiming at 62% of the band and landing at 35%, since it
 * was sized against a transformation's 66px heading and drawn at its own 54px.
 *
 * Stepping down rather than solving in closed form is deliberate: bigger type
 * wraps sooner, so height is not linear in scale. The step is coarse because
 * type sizes an eye can tell apart are not 1% apart, and a coarse grid keeps
 * the output stable across small content edits.
 */
export function fitScale(
  heightAt: (scale: number) => number,
  bandHeight: number,
  emphasis?: string,
): number {
  const target = (EMPHASIS_FILL[emphasis ?? 'normal'] ?? CARD_TARGET_FILL) * bandHeight;
  for (let scale = CARD_SCALE_MAX; scale > CARD_SCALE_MIN; scale -= 0.05) {
    if (heightAt(scale) <= target) return Number(scale.toFixed(2));
  }

  /*
   * Nothing in range fits the target, so the content is genuinely dense. Shrink
   * only as far as the band demands — clipped text is a worse outcome than a
   * full block — and never below the floor unless the band itself forces it.
   */
  const hard = bandHeight * 0.92;
  for (let scale = CARD_SCALE_MIN; scale > 0.4; scale -= 0.05) {
    if (heightAt(scale) <= hard) return Number(scale.toFixed(2));
  }
  return 0.4;
}

/** The height an evidence note needs at a given scale, at its own base sizes. */
export function noteHeightAt(text: string, width: number, scale = 1): number {
  const size = NOTE_TYPE.body.size * scale;
  const perLine = Math.max(1, Math.floor(width / (size * 0.5)));
  const lines = Math.max(1, Math.ceil(text.length / perLine));
  return NOTE_TYPE.label.size * NOTE_TYPE.label.lineHeight + NOTE_TYPE.gap * scale + lines * size * NOTE_TYPE.body.lineHeight;
}

export function anchorFor(role: string): 'center' | 'flex-end' {
  return role === 'hook' || role === 'demo' ? 'center' : 'flex-end';
}

/**
 * The content band for a frame: inside the safe area, above the captions.
 *
 * One arithmetic, stated once. `BeatStage` lays out against it and the
 * treatments size against it.
 */
export function bandFor(
  frame: { width: number; height: number },
  hasCaptions: boolean,
): { width: number; height: number } {
  const top = Math.round((SAFE_PERCENT / 100) * frame.height);
  const bottom = Math.round(
    ((hasCaptions ? 100 - CAPTION_BAND_TOP_PERCENT : SAFE_PERCENT) / 100) * frame.height,
  );
  return { width: frame.width - PAGE_PADDING * 2, height: frame.height - top - bottom };
}

export const BeatStage: React.FC<{
  children: React.ReactNode;
  hasCaptions: boolean;
  anchor?: 'center' | 'flex-end';
}> = ({ children, hasCaptions, anchor = 'flex-end' }) => {
  /*
   * Pixels computed from the frame height, not percentages.
   *
   * A percentage padding resolves against the containing block's **width**, so
   * `paddingBottom: '28%'` on a 1080×1920 frame reserves 302px rather than the
   * 538px it reads as. The first render through this seam put the caption
   * straight through the reason text because of it. `useVideoConfig` knows the
   * real height, so the band is computed rather than assumed.
   */
  const { height } = useVideoConfig();
  const top = Math.round((SAFE_PERCENT / 100) * height);
  const bottom = Math.round(
    ((hasCaptions ? 100 - CAPTION_BAND_TOP_PERCENT : SAFE_PERCENT) / 100) * height,
  );

  return (
    <AbsoluteFill
      style={{
        paddingTop: top,
        paddingBottom: bottom,
        paddingLeft: PAGE_PADDING,
        paddingRight: PAGE_PADDING,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: anchor,
        // Content that would still overflow its band is clipped rather than
        // allowed to run under the captions.
        overflow: 'hidden',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** The shared entrance. Kept here so every treatment moves the same way. */
export const Rise: React.FC<{ delay?: number; children: React.ReactNode }> = ({
  delay = 0,
  children,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [24, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Lay the plan's beats out in time and draw each through its treatment.
 *
 * `layoutScenes` stays authoritative — this adds no timing of its own. A role
 * with no treatment renders nothing rather than guessing, because a beat drawn
 * by a component that was not written for it is worse than a beat omitted.
 */
/**
 * The beats, as the timing engine's scenes.
 *
 * Its own function because the field-by-field version of this silently dropped
 * `maxSeconds`, and the symptom was a rendered file that came back
 * byte-identical — nothing threw, nothing logged, and the beat simply kept its
 * old length. §163.
 */
export function beatScenes(beats: RenderableBeat[]): Scene[] {
  return beats.map((b) => ({
    id: b.id,
    weight: b.weight,
    minSeconds: b.minSeconds,
    ...(b.maxSeconds === undefined ? {} : { maxSeconds: b.maxSeconds }),
  }));
}

export const PlannedBeats: React.FC<{
  beats: RenderableBeat[];
  treatments: TreatmentSet;
  brand: BrandTokens;
  headline: string;
  hasCaptions: boolean;
}> = ({ beats, treatments, brand, headline, hasCaptions }) => {
  const { durationInFrames, fps, width, height } = useVideoConfig();
  const scenes = layoutScenes(beatScenes(beats), durationInFrames, fps);

  return (
    <>
      {scenes.map((scene, index) => {
        const beat = beats[index]!;
        const Treatment = treatments[beat.role];
        if (!Treatment) return null;
        return (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
            <BeatStage hasCaptions={hasCaptions} anchor={anchorFor(beat.role)}>
              <Treatment
                beat={beat}
                brand={brand}
                headline={headline}
                band={bandFor({ width, height }, hasCaptions)}
              />
            </BeatStage>
          </Sequence>
        );
      })}
    </>
  );
};

// ── before_after treatments ────────────────────────────────────────────────

/**
 * The opening. One line of value, at the top of the type scale.
 *
 * Large because it is the only thing a scrolling viewer reads before deciding,
 * and short because the plan gives it the least time of any beat.
 */
const HookTitle: BeatTreatment = ({ beat, brand, headline }) => (
  <Rise>
    <div
      style={{
        fontSize: 30,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: brand.primary,
      }}
    >
      One adaptation
    </div>
    <div
      style={{
        fontFamily: brand.headingFont,
        fontSize: 96,
        lineHeight: 1.03,
        marginTop: 22,
        color: brand.ink,
      }}
    >
      {beat.content?.text ?? headline}
    </div>
  </Rise>
);

/**
 * One transformation: what it was, what it became, and why.
 *
 * The before is struck through as the after arrives, so the change is something
 * the viewer *watches* rather than infers from two stacked lines. Scale follows
 * the beat's emphasis, so the hero change is visibly the hero.
 */
const TransformationCard: BeatTreatment = ({ beat, brand, band }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /*
   * One scale, from two inputs that stay separate: the planner's emphasis says
   * how much of the frame this beat should command, and the content's density
   * says what type size reaches that. Multiplying an emphasis factor on top of
   * a fitted scale would have pushed a held card past the band it was just
   * fitted to.
   */
  const scale = cardDensityScale(
    { before: beat.content?.before, after: beat.content?.after, reason: beat.content?.reason },
    band,
    beat.emphasis,
  );
  const strike = interpolate(frame, [10, 10 + fps * 0.45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const before = beat.content?.before;
  const after = beat.content?.after;
  const reason = beat.content?.reason;

  return (
    <Rise>
      {before ? (
        /*
         * The strike is drawn by revealing a struck copy of the text over the
         * plain one, left to right.
         *
         * It used to be a single absolutely-positioned rule at `top: 50%` of the
         * block, which is only a strikethrough when the before is one line. At
         * two lines it sits *between* them and reads as an underline of the
         * first — a defect that was easy to miss at 44px and obvious once
         * density scaling took the type past 80px. Stacking a `line-through`
         * copy and clipping it horizontally strikes every line correctly and
         * keeps the left-to-right draw, which is what makes the change
         * something the viewer watches rather than infers (§162).
         */
        <div style={{ position: 'relative', alignSelf: 'flex-start', marginBottom: 18 * scale }}>
          <div style={{ fontSize: 44 * scale, lineHeight: 1.25, color: brand.muted }}>{before}</div>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              fontSize: 44 * scale,
              lineHeight: 1.25,
              color: brand.muted,
              textDecoration: 'line-through',
              textDecorationThickness: Math.max(2, Math.round(3 * scale)),
              // `inset()` trims from each edge; trimming the right by the
              // remaining fraction reveals the struck copy as the after lands.
              clipPath: `inset(0 ${(1 - strike) * 100}% 0 0)`,
            }}
          >
            {before}
          </div>
        </div>
      ) : null}

      {after ? (
        <div
          style={{
            fontFamily: brand.headingFont,
            fontSize: 66 * scale,
            lineHeight: 1.12,
            color: brand.ink,
          }}
        >
          {after}
        </div>
      ) : null}

      {/* Omitted rather than invented when the artifact carries no reason. */}
      {reason ? (
        <div
          style={{
            marginTop: 22 * scale,
            paddingLeft: 20 * scale,
            borderLeft: `${Math.max(2, Math.round(3 * scale))}px solid ${brand.primary}`,
            fontSize: 32 * scale,
            lineHeight: 1.4,
            color: brand.muted,
          }}
        >
          {reason}
        </div>
      ) : null}
    </Rise>
  );
};

/**
 * Evidence, drawn as evidence.
 *
 * Quieter than a transformation on purpose: it is the reason the change holds,
 * not the change itself, and giving it equal weight flattens the hierarchy.
 */
/**
 * The evidence behind the change: what the artifact actually said, and nothing
 * else.
 *
 * §169. This had the defect §167 fixed for transformations, in a different
 * treatment: fixed type sizes, so a three-line explanation used 21% of its band
 * while the cards beside it used 56–60%. It reads as the thinnest moment in the
 * piece for no reason other than that nobody had scaled it.
 *
 * It reuses `cardDensityScale` rather than growing a second rule — the note is
 * a single dominant text block, so it measures as one and the search finds the
 * scale that reaches the emphasis's target fill. Its own base sizes stay
 * subordinate to a transformation's.
 *
 * **Provenance is carried, not drawn.** The beat knows its `sourcePath`; a
 * viewer has no use for `steps[3].updated_note`, and printing an internal path
 * on a social post would be noise imitating rigour. It travels in the render
 * row for the operator surface and for anything auditing the render later.
 *
 * **Quoted evidence is deliberately not special-cased here.** The proof gate
 * verifies testimonials against stored rows with recorded consent, but the
 * planner never builds a proof beat from one — the only producer is a change's
 * own `reason`. Styling a quotation that nothing can currently emit would be
 * architecture for a content shape that does not exist.
 */
const EvidenceNote: BeatTreatment = ({ beat, brand, band }) => {
  const text = beat.content?.text;
  /*
   * No evidence is no beat. The planner only emits this beat when the change
   * explains itself (§160), so reaching here empty means something upstream
   * changed — and a lone "WHY" over blank ground is worse than nothing.
   */
  if (!text || !text.trim()) return null;

  const scale = fitScale((k) => noteHeightAt(text, band.width, k), band.height, beat.emphasis);

  return (
    <Rise>
      <div
        style={{
          fontSize: NOTE_TYPE.label.size,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: brand.primary,
        }}
      >
        Why
      </div>
      <div
        style={{
          fontFamily: brand.headingFont,
          fontSize: NOTE_TYPE.body.size * scale,
          lineHeight: NOTE_TYPE.body.lineHeight,
          marginTop: NOTE_TYPE.gap * scale,
          color: brand.ink,
        }}
      >
        {text}
      </div>
    </Rise>
  );
};

/** A deliberate ending, when the plan supplies one. Never invented. */
const ClosingLine: BeatTreatment = ({ beat, brand }) =>
  beat.content?.text ? (
    <Rise>
      <div
        style={{
          fontFamily: brand.headingFont,
          fontSize: 72,
          lineHeight: 1.1,
          color: brand.ink,
        }}
      >
        {beat.content.text}
      </div>
    </Rise>
  ) : null;

/**
 * Real product footage, framed for 9:16.
 *
 * §163. The band sits above the captions and below the beat's own label, so the
 * product occupies the space that text was leaving empty. Nothing is drawn over
 * the footage and nothing is generated: every frame is a frame that was
 * recorded, cut to the spans where the product was actually doing something.
 *
 * The footage is silent by construction — the narration is the voiceover, and a
 * browser recording has nothing worth hearing.
 */
const CapturedFootage: BeatTreatment = ({ beat, brand, band }) => {
  const media = beat.media;
  // No footage is no beat. Substituting a still or a graphic here would be
  // inventing product state, which is the one thing this must never do.
  if (!media) return null;

  /*
   * §168. The footage is fitted inside the band, not stretched across it.
   *
   * A recording has a fixed aspect ratio and the band has another, so one of
   * the two dimensions always has slack — there is no arrangement that removes
   * it, which is why this is not the same problem the transformation cards had.
   * What *can* be removed is the silent clipping: `BeatStage` sets
   * `overflow: hidden`, so a video taller than its band lost its bottom edge
   * with nothing to say so. A portrait capture of a phone layout is exactly
   * that shape.
   *
   * `maxWidth` and `maxHeight` with automatic sizing fits within both bounds at
   * the video's own aspect ratio — no distortion, no letterbox bars inside the
   * border, and the container shrink-wraps whatever results. The browser reads
   * the intrinsic aspect from the file, so nothing here has to be told the
   * footage's dimensions or kept in sync with them.
   */
  const LABEL_BLOCK = media.label ? 44 : 0;
  const mediaHeight = Math.max(120, band.height - LABEL_BLOCK);
  const mediaWidth = band.width;

  return (
    <Rise>
      {media.label ? (
        <div
          style={{
            fontSize: 28,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: brand.primary,
            marginBottom: 16,
          }}
        >
          {media.label}
        </div>
      ) : null}
      <div
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          // A hairline, so the product's own white chrome does not bleed into
          // the brand ground behind it.
          border: `1px solid ${brand.muted}33`,
          /*
           * Shrink-wrapped, so the border traces the footage rather than a box
           * it sits inside. `alignSelf` was the first attempt and did nothing:
           * `Rise` renders a plain block, not a flex parent, so the container
           * filled the width and drew a hairline around 55% of empty ground.
           *
           * Left-aligned rather than centred, so the footage shares an edge with
           * the label above it and the transformation cards that follow — the
           * demo reads as part of the piece rather than an inset.
           */
          width: 'fit-content',
          lineHeight: 0,
        }}
      >
        <OffthreadVideo
          src={staticFile(media.file)}
          muted
          style={{
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: mediaWidth,
            maxHeight: mediaHeight,
          }}
        />
      </div>
    </Rise>
  );
};

/**
 * `before` and `after` map to the same card as `change`.
 *
 * A creative type that splits a transformation across two beats is describing
 * the same thing in two halves, and the card already renders whichever halves
 * it is given.
 */
export const BEFORE_AFTER_TREATMENTS: TreatmentSet = {
  hook: HookTitle,
  /*
   * A beat carrying footage is drawn as footage whatever its role, because the
   * product doing the thing is a better telling than a description of it.
   */
  demo: CapturedFootage,
  before: TransformationCard,
  change: TransformationCard,
  after: TransformationCard,
  proof: EvidenceNote,
  cta: ClosingLine,
};

export type { CaptionCue };
