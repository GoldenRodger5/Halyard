/**
 * §298. The walkthrough — the product, in a phone, with things happening around it.
 *
 * Spec §12 asks for "animated UI demonstrations" and it was the one media type
 * on that list with nothing behind it. Halyard could record the product (§292)
 * and could put a screenshot on a card (§273), and had no way to show somebody
 * *using* it.
 *
 * The difference matters more than it sounds. A screenshot says "this screen
 * exists". A recording inside a device, with the thing being explained pointed
 * at as it happens, says "this is what using it is like" — and that is the only
 * claim a product demonstration is really making.
 *
 * ## Why the phone is drawn rather than photographed
 *
 * A photographed hand holding a phone dates instantly, ties the piece to one
 * device, and cannot be re-rendered when the app changes. A drawn frame is a
 * few rounded rectangles, re-renders free, and never becomes last year's
 * hardware. The screen inside it is the only part that has to be real — and it
 * is, because it is a capture.
 *
 * ## What is real and what is decoration
 *
 * The recording is `captured` provenance and may evidence a claim. Everything
 * around it — the drifting ground, the drawn frame, the highlight rings — is
 * decoration and may not. That line is the same one §296 draws for every beat:
 * a mark pointing at a real screen is fine, a mark inventing a screen state is
 * not, and this composition never draws the second because it only ever points
 * at pixels the capture actually contains.
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BrandTokens } from '../brand.js';
import type { RenderTypography } from '../image/templates.js';

/**
 * §319. How long a ring may claim a position.
 *
 * Short, because a tap position is only true at the instant it was measured.
 * Long enough to be seen — under about half a second a ring reads as a flicker
 * rather than as a pointer.
 */
export const RING_HOLD_SECONDS = 0.8;

/**
 * §319. The closest two callouts may be before one of them is dropped.
 *
 * The first real walkthrough recorded a tab switch and a diet choice 76ms
 * apart, so two rings drew simultaneously in different places. Two rings at
 * once point at neither.
 */
export const MIN_CALLOUT_GAP_SECONDS = 1.6;

/** A thing said about the screen, at the moment it is true on the screen. */
export interface WalkthroughCallout {
  /** When it appears, in seconds from the start of the piece. */
  atSeconds: number;
  /** How long it stays. Short: a callout is a pointer, not a paragraph. */
  holdSeconds?: number;
  text: string;
  /**
   * The control it points at, as fractions of the phone screen.
   *
   * §324. Carries the element's **size** as well as its centre, so the ring can
   * be drawn around what was actually pressed. A fixed radius is wrong for
   * everything: it swallows a diet chip and vanishes inside a full-width
   * button, and neither reads as pointing at anything.
   *
   * Null pins the text beside the device instead, which is right for a remark
   * about the whole step rather than about one control.
   */
  at?: { x: number; y: number; width?: number; height?: number } | null;
}

export interface WalkthroughProps {
  brand: BrandTokens;
  typography?: RenderTypography;
  /** The screen recording. `captured` provenance — the only real thing here. */
  screenSrc: string;
  /** A still behind the device. Drifts slowly; decoration only. */
  backgroundDataUri?: string;
  headline?: string;
  callouts?: WalkthroughCallout[];
  audioSrc?: string;
  wordmark?: string;
  /** §306. How long the capture is, so the piece is exactly that long. */
  footageSeconds?: number;
  /**
   * §321. Stretches of the recording to play faster, in footage seconds.
   *
   * A walkthrough has one genuinely dead passage — the product working — and
   * two passages that must be watchable: the input, and the result. The first
   * real one played the whole recording at 1× and read as *too fast overall*,
   * which sounds contradictory until you look at it: the interesting parts were
   * given the same time as the waiting, so nothing had room and everything felt
   * rushed.
   *
   * Speeding only the wait buys that room without cutting anything. It is also
   * more honest than a cut: the viewer sees the product take time, compressed,
   * rather than being shown a result that appears instantly.
   */
  speedRamps?: Array<{ fromSeconds: number; toSeconds: number; rate: number }>;
}

const face = (t: RenderTypography | undefined, role: 'display' | 'body' | 'label') =>
  t ? { fontFamily: t[role].family, fontWeight: t[role].weight } : {};

/**
 * The device.
 *
 * Proportioned like a modern phone rather than to a specific model, because the
 * point is "a phone" and not "an iPhone 15" — the second is a claim about
 * hardware nobody needs to make and dates the piece the moment it is wrong.
 */
const PhoneFrame: React.FC<{
  children: React.ReactNode;
  width: number;
  brand: BrandTokens;
}> = ({ children, width, brand }) => {
  const height = width * (19.5 / 9);
  const bezel = Math.round(width * 0.028);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: width * 0.13,
        backgroundColor: '#0b0b0d',
        padding: bezel,
        boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: width * 0.105,
          overflow: 'hidden',
          backgroundColor: brand.background,
          position: 'relative',
        }}
      >
        {children}
      </div>
      {/* The cutout. One rounded pill, because that is what reads as "phone". */}
      <div
        style={{
          position: 'absolute',
          top: bezel + width * 0.022,
          left: '50%',
          transform: 'translateX(-50%)',
          width: width * 0.26,
          height: width * 0.072,
          borderRadius: 999,
          backgroundColor: '#0b0b0d',
        }}
      />
    </div>
  );
};

/**
 * A callout: a ring on the screen and a line of text beside it.
 *
 * It arrives on a spring and leaves on a fade. Arriving is an event and worth
 * animating; leaving is housekeeping and should not draw the eye back.
 */
const Callout: React.FC<{
  callout: WalkthroughCallout;
  brand: BrandTokens;
  type?: RenderTypography;
}> = ({ callout, brand, type }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const hold = callout.holdSeconds ?? 2.4;

  const since = seconds - callout.atSeconds;
  if (since < 0 || since > hold) return null;

  /**
   * §319. The ring holds for a moment; the words hold for the sentence.
   *
   * A tap position is measured in the viewport **at the instant of the tap**,
   * and it is true only for that instant — the page scrolls, a result renders,
   * the layout moves. Holding the ring for the same 2.6 seconds as its label
   * left it sitting over whatever happened to be at those coordinates a moment
   * later, which in the first real walkthrough was an ingredient row rather
   * than the diet chip that was actually pressed.
   *
   * That is not a cosmetic problem. A ring is a claim that *this* was pressed,
   * and a claim that drifts off its subject is a false one — §296's rule about
   * pointing only at things the recording contains, applied in time as well as
   * in space.
   */
  const ringVisible = since <= RING_HOLD_SECONDS;

  const enter = spring({
    frame: Math.round(since * fps),
    fps,
    config: { damping: 13, stiffness: 140 },
    durationInFrames: Math.round(fps * 0.35),
  });
  const leaving = interpolate(since, [hold - 0.35, hold], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(enter, leaving);

  return (
    <>
      {callout.at && ringVisible ? (
        /*
         * The ring points at pixels the capture actually contains. It is a
         * pointer at something real, never a drawn control — §296's line.
         */
        <div
          style={{
            position: 'absolute',
            /*
             * §324. Sized from the element, not from a constant.
             *
             * `width`/`height` are the tapped control's own box as fractions of
             * the screen, measured by the runner at the instant of the tap. The
             * ring is that box plus a margin, so it reads as *around* the
             * control — which is what a ring means — instead of as a circle
             * that happens to be near it.
             *
             * A rounded rectangle rather than a circle, because interfaces are
             * made of rectangles: a circle around a wide button either misses
             * its ends or covers everything above and below it.
             *
             * Falls back to a modest square when a capture predates §324 and
             * carries only a centre.
             */
            ...(() => {
              const pad = 0.035;
              const w = callout.at.width ?? 0.18;
              const h = callout.at.height ?? 0.05;
              const left = (callout.at.x - w / 2 - pad) * 100;
              const top = (callout.at.y - h / 2 - pad * 0.45) * 100;
              return {
                left: `${left}%`,
                top: `${top}%`,
                width: `${(w + pad * 2) * 100}%`,
                height: `${(h + pad * 0.9) * 100}%`,
              };
            })(),
            /* Half the shorter side, capped: a pill for a chip, a rounded
               rectangle for a card, never a lozenge. */
            borderRadius: 28,
            border: `4px solid ${brand.primary}`,
            opacity: opacity * 0.9,
            transform: `scale(${0.94 + enter * 0.06})`,
            transformOrigin: 'center',
          }}
        />
      ) : null}

      <div
        style={{
          position: 'absolute',
          /*
           * §321. Below the device, not across it.
           *
           * The label was pinned inside the phone at 11% from the bottom, so it
           * sat on top of the product's own UI — covering the ingredient rows
           * in the first real walkthrough, which are the thing the callout is
           * asking the viewer to look at. A pointer that hides its subject is
           * worse than no pointer.
           */
          left: '8%',
          right: '8%',
          bottom: '4%',
          opacity,
          transform: `translateY(${(1 - enter) * 18}px)`,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            backgroundColor: brand.primary,
            color: '#FFFFFF',
            padding: '16px 26px',
            borderRadius: 18,
            fontSize: 40,
            lineHeight: 1.2,
            ...face(type, 'body'),
          }}
        >
          {callout.text}
        </span>
      </div>
    </>
  );
};

export const Walkthrough: React.FC<WalkthroughProps> = ({
  brand,
  typography,
  screenSrc,
  backgroundDataUri,
  headline,
  callouts = [],
  audioSrc,
  wordmark,
  footageSeconds,
  speedRamps,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const seconds = frame / fps;

  /*
   * The ground drifts and scales very slightly across the whole piece. Slow
   * enough that nobody notices it moving and fast enough that the frame is
   * never still — which is the difference between a video and a screenshot of
   * a video.
   */
  const drift = interpolate(seconds, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const bgScale = 1.08 + drift * 0.08;
  const bgShift = drift * -40;

  /**
   * §321. The recording, split into segments at every change of pace.
   *
   * One video element cannot change `playbackRate` mid-clip, so a ramp is
   * expressed as the segments it varies across. Each segment states which
   * stretch of the *recording* it plays and how fast, and the timeline
   * position follows from the ones before it.
   *
   * With no ramps this produces exactly one segment at 1×, which is the
   * previous behaviour — so a walkthrough that does not need this is unchanged
   * rather than newly routed through a code path it never used.
   */
  const segments = React.useMemo(() => {
    const total = footageSeconds && footageSeconds > 0 ? footageSeconds : 20;
    const ramps = [...(speedRamps ?? [])]
      .filter((r) => r.rate > 0 && r.toSeconds > r.fromSeconds)
      .sort((a, b) => a.fromSeconds - b.fromSeconds);

    const parts: Array<{ sourceFromSeconds: number; sourceToSeconds: number; rate: number }> = [];
    let at = 0;
    for (const ramp of ramps) {
      const from = Math.max(at, ramp.fromSeconds);
      const to = Math.min(total, ramp.toSeconds);
      if (to <= from) continue;
      if (from > at) parts.push({ sourceFromSeconds: at, sourceToSeconds: from, rate: 1 });
      parts.push({ sourceFromSeconds: from, sourceToSeconds: to, rate: ramp.rate });
      at = to;
    }
    if (at < total) parts.push({ sourceFromSeconds: at, sourceToSeconds: total, rate: 1 });

    let cursor = 0;
    return parts.map((part) => {
      /* Played length is source length divided by how fast it is played. */
      const durationInFrames = Math.max(
        1,
        Math.round(((part.sourceToSeconds - part.sourceFromSeconds) / part.rate) * fps),
      );
      const segment = { ...part, fromFrame: cursor, durationInFrames };
      cursor += durationInFrames;
      return segment;
    });
  }, [footageSeconds, speedRamps, fps]);

  /* The device rises once, then holds. */
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  const phoneWidth = Math.round(width * 0.62);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.ink, overflow: 'hidden' }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}

      {backgroundDataUri ? (
        <AbsoluteFill>
          <img
            src={backgroundDataUri}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${bgScale}) translateY(${bgShift}px)`,
              /*
               * Blurred hard. It is a ground, not a subject — a sharp
               * photograph behind a phone competes with the screen, which is
               * the one thing the viewer is meant to be reading.
               */
              filter: 'blur(28px) brightness(0.55)',
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(80% 60% at 50% 20%, ${brand.primary}33 0%, ${brand.ink} 70%)`,
            transform: `scale(${bgScale})`,
          }}
        />
      )}

      {headline ? (
        <div
          style={{
            position: 'absolute',
            top: '7%',
            left: '7%',
            right: '7%',
            color: '#FFFFFF',
            fontSize: 74,
            lineHeight: 1.04,
            opacity: rise,
            ...face(typography, 'display'),
          }}
        >
          {headline}
        </div>
      ) : null}

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            transform: `translateY(${(1 - rise) * 40 + height * 0.05}px)`,
            opacity: rise,
            position: 'relative',
          }}
        >
          <PhoneFrame width={phoneWidth} brand={brand}>
            {/*
              §321. The recording, with the waiting compressed.

              `playbackRate` changes over time, so this is a sequence of
              segments rather than one video element — Remotion resolves a
              frame by asking for a timestamp, and a rate that varies mid-clip
              has to be expressed as the segments it varies across.
            */}
            {segments.map((segment, i) => (
              <Sequence
                key={`seg-${i}`}
                from={segment.fromFrame}
                durationInFrames={segment.durationInFrames}
              >
                <OffthreadVideo
                  /*
                   * §319. `staticFile`, like every other composition here.
                   *
                   * This passed `screenSrc` straight through, so a
                   * bundle-relative path — which is what `stageFootage`
                   * produces — resolved against the bundle root instead of
                   * `public/` and 404'd. The one composition built around a
                   * video file could not load one.
                   *
                   * A data URI or absolute URL is left alone: `staticFile` is
                   * for paths inside the bundle.
                   */
                  src={
                    /^(https?:|data:|blob:|file:)/.test(screenSrc)
                      ? screenSrc
                      : staticFile(screenSrc)
                  }
                  /* Where in the recording this segment starts. */
                  startFrom={Math.round(segment.sourceFromSeconds * fps)}
                  endAt={Math.round(segment.sourceToSeconds * fps)}
                  playbackRate={segment.rate}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Sequence>
            ))}
            {/* Callouts that point at the screen live inside the frame. */}
            {callouts
              .filter((c) => c.at)
              .map((c, i) => (
                <Callout key={`in-${i}`} callout={c} brand={brand} type={typography} />
              ))}
          </PhoneFrame>
        </div>
      </AbsoluteFill>

      {/* Callouts with no anchor sit over the whole frame, beside the device. */}
      {callouts
        .filter((c) => !c.at)
        .map((c, i) => (
          <Callout key={`out-${i}`} callout={c} brand={brand} type={typography} />
        ))}

      {wordmark ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 56, pointerEvents: 'none' }}>
          <span
            style={{
              fontSize: 26,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            {wordmark}
          </span>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Callouts derived from the capture's own step labels.
 *
 * A capture records what it did and when — `adapt_and_reveal` knows it pasted a
 * URL at 2s and revealed a swap at 9s. Those labels are the honest source for
 * what to point at: they describe something that actually happened on screen,
 * which is exactly what a callout is allowed to claim.
 *
 * Written by hand it would be a person guessing at timings; derived, it cannot
 * point at a moment the recording does not contain.
 */
export function calloutsFromSteps(
  steps: Array<{ label: string; atSeconds: number; at?: { x: number; y: number } | null }>,
  options: { maxCallouts?: number } = {},
): WalkthroughCallout[] {
  const max = options.maxCallouts ?? 4;

  /*
   * §319. Dropped, never shifted.
   *
   * Two callouts closer together than a viewer can read are two rings drawn at
   * once in different places, which points at neither. Moving the second one
   * later would be the obvious fix and the wrong one: its position was measured
   * at its own instant, so a shifted ring points at coordinates that were true
   * a second ago. Keeping the first is arbitrary but consistent, and a dropped
   * callout costs a sentence rather than telling a lie.
   */
  const spaced: Array<{ label: string; atSeconds: number; at?: { x: number; y: number } | null }> = [];
  for (const step of steps.filter((s) => s.label.trim().length > 0)) {
    const previous = spaced[spaced.length - 1];
    if (previous && step.atSeconds - previous.atSeconds < MIN_CALLOUT_GAP_SECONDS) continue;
    spaced.push(step);
  }

  return spaced.slice(0, max).map((s) => ({
    atSeconds: s.atSeconds,
    text: s.label.trim(),
    at: s.at ?? null,
    holdSeconds: 2.4,
  }));
}


/**
 * §321. How long a walkthrough runs, once the ramps are applied.
 *
 * Not the footage length: a stretch played at 3× occupies a third of the
 * timeline it would have. A composition sized from the raw footage would hold a
 * frozen final frame for the difference, which is the `media.dead_tail` finding
 * §317 added — and it would be right.
 */
export function walkthroughDurationSeconds(
  footageSeconds: number,
  speedRamps: Array<{ fromSeconds: number; toSeconds: number; rate: number }> = [],
): number {
  let saved = 0;
  for (const ramp of speedRamps) {
    if (ramp.rate <= 0) continue;
    const from = Math.max(0, ramp.fromSeconds);
    const to = Math.min(footageSeconds, ramp.toSeconds);
    if (to <= from) continue;
    const source = to - from;
    saved += source - source / ramp.rate;
  }
  return Number(Math.max(1, footageSeconds - saved).toFixed(2));
}
