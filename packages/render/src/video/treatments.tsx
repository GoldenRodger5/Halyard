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
}

export interface BeatViewProps {
  beat: RenderableBeat;
  brand: BrandTokens;
  /** The piece's headline, for treatments that fall back to it. */
  headline: string;
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
export function anchorFor(role: string): 'center' | 'flex-end' {
  return role === 'hook' || role === 'demo' ? 'center' : 'flex-end';
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
        paddingLeft: 72,
        paddingRight: 72,
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
  const { durationInFrames, fps } = useVideoConfig();
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
              <Treatment beat={beat} brand={brand} headline={headline} />
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
const TransformationCard: BeatTreatment = ({ beat, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = scaleFor(beat.emphasis);
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
        <div style={{ position: 'relative', alignSelf: 'flex-start', marginBottom: 18 }}>
          <div style={{ fontSize: 44 * scale, lineHeight: 1.25, color: brand.muted }}>{before}</div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              height: 3,
              width: `${strike * 100}%`,
              backgroundColor: brand.muted,
            }}
          />
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
            marginTop: 22,
            paddingLeft: 20,
            borderLeft: `3px solid ${brand.primary}`,
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
const EvidenceNote: BeatTreatment = ({ beat, brand }) => (
  <Rise>
    <div style={{ fontSize: 28, letterSpacing: 3, textTransform: 'uppercase', color: brand.primary }}>
      Why
    </div>
    <div
      style={{
        fontFamily: brand.headingFont,
        fontSize: 54,
        lineHeight: 1.22,
        marginTop: 18,
        color: brand.ink,
      }}
    >
      {beat.content?.text}
    </div>
  </Rise>
);

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
const CapturedFootage: BeatTreatment = ({ beat, brand }) => {
  const media = beat.media;
  // No footage is no beat. Substituting a still or a graphic here would be
  // inventing product state, which is the one thing this must never do.
  if (!media) return null;

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
        }}
      >
        <OffthreadVideo
          src={staticFile(media.file)}
          muted
          style={{ width: '100%', display: 'block' }}
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
