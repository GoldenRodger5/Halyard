/**
 * §308. The composition every other short-video format runs through.
 *
 * `quiz` got a composition in §289 and the other four `short_video` formats —
 * `history`, `tips`, `myth_fact`, `origin` — had none, so they rendered as
 * cards and looked like slideshows. Writing a bespoke composition for each is
 * the obvious answer and the wrong one: four compositions is four places for
 * the same timing bug, and it does nothing for the fifth format somebody adds.
 *
 * A narrative format is a **sequence of beats**, and the formats differ in what
 * their beats *mean* rather than in how a beat is drawn. A history is
 * hook → setup → turn → why; an origin is hook → before → change → now. Both
 * are "say a thing, hold it, say the next thing", and the turn is the one that
 * has to land hardest in each. So the composition takes beats with roles, and
 * the format decides which slot becomes which role.
 *
 * ## Variety is structural, not decorative
 *
 * Each beat picks a treatment the way §302 picks a quiz template: what fits,
 * then what has not been used. A five-beat piece therefore cycles through five
 * different compositions rather than showing the same card five times with
 * different words in it — which is exactly what "it looks like a slideshow"
 * means and why every format before this did.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BrandTokens } from '../brand.js';
import type { RenderTypography } from '../image/templates.js';
import { quizPalette, type QuizPalette } from './quizTemplates.js';

/** What a beat is doing, which is what decides how hard it lands. */
export const BEAT_ROLES = ['hook', 'setup', 'turn', 'detail', 'payoff', 'close'] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

export interface NarrativeBeat {
  role: BeatRole;
  text: string;
  /**
   * A short label above the line — "Myth", "1728", "Tip 3".
   *
   * Optional, and it changes the whole reading of a beat: "Myth / Oats contain
   * gluten" is a different sentence from "Oats contain gluten" and the label is
   * doing the work.
   */
  kicker?: string | null;
  /** A citation, small, under the line. Only where the format is `sourced`. */
  source?: string | null;
  /** Seconds this beat holds. Derived by the caller from the read. */
  seconds: number;
}

export interface NarrativeProps {
  brand: BrandTokens;
  typography?: RenderTypography;
  beats: NarrativeBeat[];
  backgroundDataUri?: string;
  /** §301. Measured brightness of the ground where type sits, 0..1. */
  backgroundLuminance?: number;
  audioSrc?: string | null;
  wordmark?: string;
}

export const NARRATIVE_TREATMENTS = ['statement', 'anchored', 'split_rule', 'label_lead', 'quiet'] as const;
export type NarrativeTreatment = (typeof NARRATIVE_TREATMENTS)[number];

/**
 * Which treatments suit which roles.
 *
 * A hook has to be the loudest thing in the piece and a close has to be the
 * quietest — a close set at hook weight reads as the piece starting again. So
 * this is a fit rule, not a preference: variety picks *within* it.
 */
const FITS: Record<BeatRole, NarrativeTreatment[]> = {
  hook: ['statement', 'label_lead'],
  setup: ['anchored', 'split_rule', 'label_lead'],
  turn: ['statement', 'split_rule'],
  detail: ['anchored', 'label_lead', 'split_rule'],
  payoff: ['statement', 'split_rule'],
  close: ['quiet', 'anchored'],
};

/**
 * A treatment per beat, chosen once for the piece.
 *
 * Fit, then recency — §302 and §293's order, and for the same reason. Exported
 * so a test can assert the run varies rather than trusting that it does.
 */
export function treatmentsForBeats(roles: BeatRole[]): NarrativeTreatment[] {
  const recent: NarrativeTreatment[] = [];
  return roles.map((role) => {
    const fits = FITS[role];
    const chosen =
      fits
        .map((t) => ({ t, staleness: recent.indexOf(t) === -1 ? Infinity : recent.indexOf(t) }))
        .sort((a, b) => b.staleness - a.staleness)[0]!.t;
    recent.unshift(chosen);
    return chosen;
  });
}

const face = (t: RenderTypography | undefined, role: 'display' | 'body' | 'label') =>
  t ? { fontFamily: t[role].family, fontWeight: t[role].weight } : {};

/**
 * How big a line is set, from how long it is.
 *
 * A fixed size makes a four-word hook look timid and a twenty-word setup
 * overflow the frame. Stepped rather than continuous, so two beats of similar
 * length are set identically and the piece looks typeset rather than fitted.
 */
function sizeFor(text: string, role: BeatRole): number {
  const words = text.trim().split(/\s+/).length;
  const base = role === 'hook' || role === 'turn' || role === 'payoff' ? 1 : 0.82;
  const step = words <= 6 ? 128 : words <= 12 ? 96 : words <= 20 ? 74 : 58;
  return Math.round(step * base);
}

const Kicker: React.FC<{ text: string; palette: QuizPalette; type?: RenderTypography }> = ({
  text,
  palette,
  type,
}) => (
  <span
    style={{
      /*
       * §315. A plate over a photograph. "AND THEN" sat on the bright crust of
       * a loaf and vanished, while measuring as legible against the frame's
       * average — an average cannot save 30px of type sitting on the one
       * highlight it happens to cross.
       */
      alignSelf: 'flex-start',
      fontSize: 32,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: palette.accent,
      marginBottom: 22,
      ...(palette.plate
        ? { backgroundColor: palette.plate, padding: '10px 16px', borderRadius: 8 }
        : {}),
      ...face(type, 'label'),
    }}
  >
    {text}
  </span>
);

const Source: React.FC<{ text: string; palette: QuizPalette; type?: RenderTypography }> = ({
  text,
  palette,
  type,
}) => (
  <span
    style={{
      alignSelf: 'flex-start',
      fontSize: 24,
      marginTop: 26,
      color: palette.dimmed,
      /* §315. Same reason as the kicker: a citation is the smallest type here. */
      ...(palette.plate
        ? { backgroundColor: palette.plate, padding: '8px 14px', borderRadius: 6 }
        : {}),
      ...face(type, 'body'),
    }}
  >
    {text}
  </span>
);

/** One beat, drawn by its treatment. */
const Beat: React.FC<{
  beat: NarrativeBeat;
  treatment: NarrativeTreatment;
  palette: QuizPalette;
  brand: BrandTokens;
  type?: RenderTypography;
}> = ({ beat, treatment, palette, brand, type }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /*
   * §294's rule: the first frame is composed and legible before anything
   * animates. So the entrance moves the line a little and never fades it in
   * from nothing — a beat that starts invisible has spent the half second that
   * decides whether anyone watches.
   */
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.35) });
  const drift = interpolate(frame, [0, fps * 6], [0, -14], { extrapolateRight: 'clamp' });
  const size = sizeFor(beat.text, beat.role);

  const line = (
    <span
      style={{
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: '-0.015em',
        color: palette.fg,
        transform: `translateY(${(1 - rise) * 16 + drift}px)`,
        ...face(type, 'display'),
      }}
    >
      {beat.text}
    </span>
  );

  const common: React.CSSProperties = {
    padding: '150px 68px',
    flexDirection: 'column',
    backgroundColor: 'transparent',
  };

  if (treatment === 'statement') {
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'center' }}>
        {beat.kicker ? <Kicker text={beat.kicker} palette={palette} type={type} /> : null}
        {line}
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  if (treatment === 'anchored') {
    /* Type held at the top, so a photograph below it is the subject. */
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'flex-start' }}>
        {beat.kicker ? <Kicker text={beat.kicker} palette={palette} type={type} /> : null}
        {line}
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  if (treatment === 'split_rule') {
    /* A rule that draws itself as the line lands. Reads as a turn. */
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'center' }}>
        {beat.kicker ? <Kicker text={beat.kicker} palette={palette} type={type} /> : null}
        <div
          style={{
            height: 6,
            width: `${Math.round(rise * 46)}%`,
            backgroundColor: palette.accent,
            marginBottom: 34,
          }}
        />
        {line}
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  if (treatment === 'label_lead') {
    /*
     * The kicker at display size and the line beneath it. For a beat whose
     * label is the point — "1728", "Myth", "Tip 3" — where setting the label
     * small throws away the thing a viewer actually remembers.
     */
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'center' }}>
        {beat.kicker ? (
          <span
            style={{
              fontSize: 156,
              lineHeight: 0.94,
              letterSpacing: '-0.03em',
              color: palette.plate ? '#FFFFFF' : palette.rule,
              marginBottom: 26,
              transform: `translateY(${(1 - rise) * 20}px)`,
              ...face(type, 'display'),
            }}
          >
            {beat.kicker}
          </span>
        ) : null}
        <span
          style={{
            fontSize: Math.round(size * 0.72),
            lineHeight: 1.16,
            color: palette.fg,
            ...face(type, 'body'),
          }}
        >
          {beat.text}
        </span>
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  /* `quiet` — the close. Small, low, and deliberately not a headline. */
  return (
    <AbsoluteFill style={{ ...common, justifyContent: 'flex-end' }}>
      <div
        style={{
          height: 4,
          width: `${Math.round(rise * 28)}%`,
          backgroundColor: brand.primary,
          marginBottom: 26,
        }}
      />
      <span
        style={{
          fontSize: 54,
          lineHeight: 1.16,
          color: palette.fg,
          transform: `translateY(${(1 - rise) * 12}px)`,
          ...face(type, 'body'),
        }}
      >
        {beat.text}
      </span>
    </AbsoluteFill>
  );
};

export const Narrative: React.FC<NarrativeProps> = ({
  brand,
  typography,
  beats,
  backgroundDataUri,
  backgroundLuminance,
  audioSrc,
  wordmark,
}) => {
  const { fps } = useVideoConfig();
  const palette = React.useMemo(
    () => quizPalette(brand, Boolean(backgroundDataUri)),
    [brand, backgroundDataUri],
  );
  const treatments = React.useMemo(() => treatmentsForBeats(beats.map((b) => b.role)), [beats]);

  let from = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}

      {backgroundDataUri ? (
        <>
          <img
            src={backgroundDataUri}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <AbsoluteFill
            style={{
              /* §301. Scaled to the photograph, not a fixed three stops. */
              backgroundImage: (() => {
                const lum = backgroundLuminance ?? 0.5;
                const bottom = Math.min(0.92, Math.max(0.6, 0.55 + lum * 0.5));
                const middle = Math.min(0.7, Math.max(0.3, bottom - 0.28));
                const top = Math.min(0.45, Math.max(0.12, bottom - 0.52));
                return `linear-gradient(to bottom, rgba(0,0,0,${top}) 0%, rgba(0,0,0,${middle}) 45%, rgba(0,0,0,${bottom}) 100%)`;
              })(),
            }}
          />
        </>
      ) : null}

      {beats.map((beat, i) => {
        const durationInFrames = Math.max(1, Math.round(beat.seconds * fps));
        const sequence = (
          <Sequence key={`${beat.role}-${i}`} from={from} durationInFrames={durationInFrames}>
            <Beat
              beat={beat}
              treatment={treatments[i]!}
              palette={palette}
              brand={brand}
              type={typography}
            />
          </Sequence>
        );
        from += durationInFrames;
        return sequence;
      })}

      {wordmark ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 56, pointerEvents: 'none' }}>
          <span
            style={{
              fontSize: 26,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: palette.dimmed,
            }}
          >
            {wordmark}
          </span>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** Total runtime, so the composition can describe its own length. */
export function narrativeDurationSeconds(beats: Array<{ seconds: number }>): number {
  return beats.reduce((total, b) => total + b.seconds, 0);
}
