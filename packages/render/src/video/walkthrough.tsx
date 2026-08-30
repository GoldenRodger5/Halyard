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
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BrandTokens } from '../brand.js';
import type { RenderTypography } from '../image/templates.js';

/** A thing said about the screen, at the moment it is true on the screen. */
export interface WalkthroughCallout {
  /** When it appears, in seconds from the start of the piece. */
  atSeconds: number;
  /** How long it stays. Short: a callout is a pointer, not a paragraph. */
  holdSeconds?: number;
  text: string;
  /**
   * Where on the *screen* it points, as fractions of the phone screen.
   *
   * Null pins it beside the device instead, which is right for a remark about
   * the whole step rather than about one control.
   */
  at?: { x: number; y: number } | null;
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
      {callout.at ? (
        /*
         * The ring points at pixels the capture actually contains. It is a
         * pointer at something real, never a drawn control — §296's line.
         */
        <div
          style={{
            position: 'absolute',
            left: `${callout.at.x * 100}%`,
            top: `${callout.at.y * 100}%`,
            width: 132,
            height: 132,
            marginLeft: -66,
            marginTop: -66,
            borderRadius: 999,
            border: `4px solid ${brand.primary}`,
            opacity: opacity * 0.9,
            transform: `scale(${0.7 + enter * 0.3})`,
          }}
        />
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: '6%',
          right: '6%',
          bottom: '11%',
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
            <OffthreadVideo src={screenSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
  return steps
    .filter((s) => s.label.trim().length > 0)
    .slice(0, max)
    .map((s) => ({
      atSeconds: s.atSeconds,
      text: s.label.trim(),
      at: s.at ?? null,
      holdSeconds: 2.4,
    }));
}
