/**
 * Remotion compositions. v1 §5.2.
 *
 * Each composition takes a ProductArtifact-derived props object, so the same
 * component serves infinite data. Rendered at 1080×1920 with burned-in captions,
 * because most short-form is watched muted.
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { DEFAULT_BRAND, type BrandTokens } from '../brand.js';
import { Fonts } from './fonts.js';
import { layoutScenes, type CaptionCue } from './timing.js';
import { captionStyle, type CaptionBackdrop } from './captionStyle.js';
import { BEFORE_AFTER_TREATMENTS, PlannedBeats, type RenderableBeat, type RenderPresentation } from './treatments.js';

export interface VideoBaseProps {
  /**
   * §294. A photograph behind the whole piece, inlined by the render handler.
   *
   * On `VideoBaseProps` rather than on one composition, because the flat-cream
   * problem was in the shared `Stage` and therefore in every video Halyard has
   * made. A fix in one composition would have left the rest unchanged.
   */
  backgroundDataUri?: string;
  brand?: BrandTokens;
  captions?: CaptionCue[];
  audioSrc?: string | null;
  wordmark?: string;
}

export interface TransformationDiffVideoProps extends VideoBaseProps {
  headline: string;
  swaps: Array<{ before: string; after: string; reason: string }>;
  /**
   * The creative plan's beats. §160.
   *
   * When present these decide the scene list — which beat is held, which is
   * quick, and in what order — instead of the flat "headline plus one scene per
   * swap" this composition used to assume. Absent, the old layout stands, so a
   * render enqueued before the plan existed still works.
   */
  beats?: RenderableBeat[];
  /** §211. How loud the frame should be. Absent keeps the editorial register. */
  presentation?: RenderPresentation;
  /** Which caption treatment the plan called for. Resolved through §158. */
  captionBackdrop?: 'surface' | 'media';
}

export interface SubstitutionExplainerProps extends VideoBaseProps {
  ingredient: string;
  substitute: string;
  ratio: string;
  failureMode: string;
}

export interface ScalingMathVideoProps extends VideoBaseProps {
  fromServings: number;
  toServings: number;
  rows: Array<{ label: string; linear: string; actual: string }>;
  note: string;
}

export interface ChefNoteCardProps extends VideoBaseProps {
  quote: string;
  attribution?: string;
}

/** 12% safe area top and bottom on 9:16 (v2 F.3). */
const SAFE = '12%';

function useBrand(brand?: BrandTokens): BrandTokens {
  return brand ?? DEFAULT_BRAND;
}

/**
 * One scene, padded inside the safe area and vertically centred.
 *
 * Remotion renders `Sequence` children into a bare absolute layer, so without
 * this every scene stacks against the top-left corner — which is exactly what
 * the first real render showed.
 */
const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      paddingTop: SAFE,
      paddingBottom: SAFE,
      paddingLeft: 72,
      paddingRight: 72,
      justifyContent: 'center',
    }}
  >
    {children}
  </AbsoluteFill>
);

/**
 * §294. The shell every composition sits in — and why it looked like a PDF.
 *
 * This was a flat fill of `brand.background`. Every video Halyard has ever made
 * was therefore small dark type on beige, in the middle of an otherwise empty
 * 1080×1920 frame, and it was not a quiz problem: it was **every** composition,
 * because they all sit in here.
 *
 * A feed is a wall of photographs and video. A flat card loses to all of it
 * before a word is read — not because the typography is bad, but because there
 * is nothing to look at.
 *
 * So when a piece has a photograph, it goes **full bleed** with a scrim over it,
 * and the type sits on the scrim. When it does not, the ground gets a soft
 * vignette in the brand's own colours rather than staying perfectly flat, which
 * is the difference between "designed" and "unstyled".
 *
 * The scrim is not optional and not tunable per composition. The photograph is
 * generated per piece and nobody has checked its contrast, so legibility cannot
 * be left to whatever came back from the model.
 */
const Stage: React.FC<{
  brand: BrandTokens;
  children: React.ReactNode;
  wordmark?: string;
  /** A photograph for the whole piece, already inlined as a data URI. */
  backgroundDataUri?: string;
}> = ({ brand, children, wordmark, backgroundDataUri }) => (
  <AbsoluteFill
    style={{
      backgroundColor: brand.background,
      color: backgroundDataUri ? '#FFFFFF' : brand.ink,
      fontFamily: brand.bodyFont,
    }}
  >
    <Fonts />

    {backgroundDataUri ? (
      <>
        <img
          src={backgroundDataUri}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {/*
          Heavy at the bottom where the type lives, lighter at the top so the
          picture is still a picture. A flat 60% scrim kills the photograph and
          leaves a grey card, which is the failure this is fixing.
        */}
        <AbsoluteFill
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.86) 100%)',
          }}
        />
      </>
    ) : (
      /*
        No photograph: a vignette in the brand's own ink rather than a flat
        fill. Barely visible and it stops the frame reading as a blank page.
      */
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(120% 80% at 50% 0%, ${brand.background} 0%, ${brand.background} 55%, ${brand.muted}22 100%)`,
        }}
      />
    )}

    {children}
    {wordmark ? (
      <div
        style={{
          position: 'absolute',
          bottom: '6%',
          left: 72,
          fontSize: 26,
          letterSpacing: 3,
          textTransform: 'uppercase',
          /* Legible over a photograph as well as over the flat ground. */
          color: backgroundDataUri ? 'rgba(255,255,255,0.75)' : brand.muted,
        }}
      >
        {wordmark}
      </div>
    ) : null}
  </AbsoluteFill>
);

/**
 * Burned-in captions. Positioned above the bottom safe area rather than inside
 * it, so the platform's own UI does not sit on top of the words.
 */
export const Captions: React.FC<{
  cues: CaptionCue[];
  brand: BrandTokens;
  /**
   * What this composition puts behind the caption. §158.
   *
   * Every composition here draws on a flat brand surface, so that is the
   * default. A composition backed by footage passes `{ kind: 'media' }` and
   * gets a plate instead of an outline, because no single ink is readable
   * across a frame that changes thirty times a second.
   */
  backdrop?: CaptionBackdrop;
  /**
   * §274. How loudly this caption should speak.
   *
   * Every caption was 52px at weight 600, everywhere, for every line — and
   * using the loudest setting on every sentence is itself the tell. Real
   * accounts vary emphasis because not every sentence is the most important
   * one; a wall of identical bold text reads as a template, and it flattens the
   * hook, which is the one line that genuinely needs the weight.
   *
   * `narration` is the default for a body cue: lighter, smaller, and lower in
   * the frame, sitting under the picture rather than competing with it.
   * `hook` keeps what the caption used to be, for the line that has to land.
   */
  emphasis?: 'hook' | 'narration' | 'aside';
  /**
   * §274. How long the opening beat runs, in seconds.
   *
   * Captions inside it are set as the hook; everything after is narration. This
   * is derived rather than passed per cue because the alternative — a caller
   * tagging every cue — is the wiring that never gets done, and an emphasis
   * prop nothing sets is how every caption ended up identical in the first
   * place. Absent means the whole piece is narration, which is the safe read.
   */
  hookEndsAtSeconds?: number;
}> = ({ cues, brand, backdrop, emphasis, hookEndsAtSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active = cues.find((cue) => frame >= cue.startFrame && frame <= cue.endFrame);
  if (!active) return null;

  /*
   * An explicit emphasis always wins; otherwise it follows the beat. A cue that
   * opens inside the hook window is the line that has to land, and every line
   * after it is support.
   */
  const resolvedEmphasis: 'hook' | 'narration' | 'aside' =
    emphasis ??
    (hookEndsAtSeconds !== undefined && active.startSeconds < hookEndsAtSeconds
      ? 'hook'
      : 'narration');

  const style = captionStyle(brand, backdrop ?? { kind: 'surface', color: brand.background });

  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        bottom: '16%',
        textAlign: 'center',
        // The words are centred, but the plate is only as wide as the words —
        // a full-width band reads as a letterbox and buries the frame.
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          /*
           * §274. Sized and weighted for what this line is doing. The hook is
           * the only one that gets the full display treatment.
           */
          fontSize: resolvedEmphasis === 'hook' ? 56 : resolvedEmphasis === 'aside' ? 30 : 38,
          lineHeight: 1.3,
          fontWeight:
            resolvedEmphasis === 'hook' ? style.fontWeight : resolvedEmphasis === 'aside' ? 400 : 500,
          opacity: resolvedEmphasis === 'aside' ? 0.82 : 1,
          color: style.color,
          ...(style.scrim
            ? {
                backgroundColor: style.scrim,
                padding: '10px 26px',
                borderRadius: 14,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }
            : {}),
          ...(style.textShadow ? { textShadow: style.textShadow } : {}),
        }}
      >
        {/*
          §270. The word being spoken carries the emphasis.

          The whole cue stays on screen — a caption that reveals one word at a
          time is unreadable at speed — and only the highlight moves. In a feed
          that autoplays muted this is what gives the eye something to track:
          the viewer follows the highlight instead of reading ahead and losing
          the thread.

          Falls back to the plain cue when a cue has no word timings, which is
          every cue built before they were carried.
        */}
        {active.words && active.words.length > 0
          ? active.words.map((word, i) => {
              const seconds = frame / fps;
              const spoken = seconds >= word.startSeconds && seconds <= word.endSeconds;
              return (
                <span
                  key={`${word.startSeconds}-${i}`}
                  style={{
                    color: spoken ? brand.primary : style.color,
                    /*
                     * Colour alone, not weight. Re-weighting reflows the line
                     * every word and the caption visibly twitches; the brand
                     * accent already carries the emphasis.
                     */
                    transition: 'none',
                  }}
                >
                  {word.text}
                  {i < active.words.length - 1 ? ' ' : ''}
                </span>
              );
            })
          : active.text}
      </span>
    </div>
  );
};

const Rise: React.FC<{ delay?: number; children: React.ReactNode }> = ({ delay = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [28, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Original ingredient strikes, replacement slides in, changeReason caption.
 * v1 §5.2: 20 to 35 seconds.
 */
export const TransformationDiffVideo: React.FC<TransformationDiffVideoProps> = (props) => {
  const brand = useBrand(props.brand);
  const { durationInFrames, fps } = useVideoConfig();

  /*
   * §162. With a plan, the beats are laid out and drawn through the treatment
   * set — the sequencing and timing live in `PlannedBeats`, so a future
   * creative type supplies a different map and never touches this file.
   *
   * Without one, the original flat layout stands, so a render queued before
   * plans existed lays out exactly as it did.
   */
  const planned = props.beats && props.beats.length > 0 ? props.beats : null;
  const hasCaptions = Boolean(props.captions && props.captions.length > 0);

  /**
   * §274. Where the hook stops, so the captions know which line has to land.
   *
   * Derived from the plan the render already has rather than passed in. An
   * emphasis prop that every caller has to remember to set is the wiring that
   * never happens — which is how every caption in every video ended up
   * identical in the first place.
   *
   * Null when there is no plan: without beats there is no hook to be inside, so
   * every line is narration, which is the honest default.
   */
  const hookEndsAtSeconds = planned
    ? (() => {
        const hook = planned.find((b) => b.role === 'hook');
        if (!hook) return undefined;
        /* The plan's own minimum for the beat is the window it was written for. */
        return Math.max(hook.minSeconds, 1.2);
      })()
    : undefined;

  const legacyScenes = planned
    ? []
    : layoutScenes(
        [
          { id: 'headline', weight: 1, minSeconds: 2 },
          ...props.swaps.map((_, i) => ({ id: `swap-${i}`, weight: 2, minSeconds: 3 })),
        ],
        durationInFrames,
        fps,
      );

  return (
    <Stage brand={brand} wordmark={props.wordmark} backgroundDataUri={props.backgroundDataUri}>
      {props.audioSrc ? <Audio src={props.audioSrc} /> : null}

      {planned ? (
        <PlannedBeats
          beats={planned}
          treatments={BEFORE_AFTER_TREATMENTS}
          brand={brand}
          headline={props.headline}
          hasCaptions={hasCaptions}
          presentation={props.presentation}
        />
      ) : (
        legacyScenes.map((scene, index) => (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames}>
            <Scene>
              {index === 0 ? (
                <Rise>
                  <div style={{ fontSize: 30, letterSpacing: 3, textTransform: 'uppercase', color: brand.primary }}>
                    One adaptation
                  </div>
                  <div style={{ fontFamily: brand.headingFont, fontSize: 86, lineHeight: 1.05, marginTop: 20 }}>
                    {props.headline}
                  </div>
                </Rise>
              ) : (
                <SwapScene swap={props.swaps[index - 1]!} brand={brand} />
              )}
            </Scene>
          </Sequence>
        ))
      )}

      {props.captions ? (
        <Captions
          cues={props.captions}
          brand={brand}
          hookEndsAtSeconds={hookEndsAtSeconds}
          backdrop={
            props.captionBackdrop === 'media'
              ? { kind: 'media' }
              : { kind: 'surface', color: brand.background }
          }
        />
      ) : null}
    </Stage>
  );
};

const SwapScene: React.FC<{
  swap: { before: string; after: string; reason: string };
  brand: BrandTokens;
}> = ({ swap, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strike = interpolate(frame, [8, 8 + fps * 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
        <div style={{ fontSize: 52, color: brand.muted }}>{swap.before}</div>
        <div
          style={{
            position: 'absolute',
            top: '52%',
            left: 0,
            height: 4,
            width: `${strike * 100}%`,
            backgroundColor: brand.muted,
          }}
        />
      </div>

      <Rise delay={Math.round(fps * 0.7)}>
        <div style={{ fontSize: 60, fontWeight: 600 }}>{swap.after}</div>
      </Rise>

      <Rise delay={Math.round(fps * 1.2)}>
        <div
          style={{
            borderLeft: `6px solid ${brand.primary}`,
            paddingLeft: 26,
            fontSize: 38,
            lineHeight: 1.4,
            marginTop: 12,
          }}
        >
          {swap.reason}
        </div>
      </Rise>
    </div>
  );
};

/** Ratio animation, failure mode as the payoff. 25 to 40 seconds. */
export const SubstitutionExplainer: React.FC<SubstitutionExplainerProps> = (props) => {
  const brand = useBrand(props.brand);
  const { durationInFrames, fps } = useVideoConfig();
  const scenes = layoutScenes(
    [
      { id: 'setup', weight: 1, minSeconds: 3 },
      { id: 'ratio', weight: 1.5, minSeconds: 4 },
      { id: 'failure', weight: 2, minSeconds: 5 },
    ],
    durationInFrames,
    fps,
  );

  return (
    <Stage brand={brand} wordmark={props.wordmark} backgroundDataUri={props.backgroundDataUri}>
      {props.audioSrc ? <Audio src={props.audioSrc} /> : null}

      <Sequence from={scenes[0]!.startFrame} durationInFrames={scenes[0]!.durationFrames}>
        <Scene><Rise>
          <div style={{ fontFamily: brand.headingFont, fontSize: 78, lineHeight: 1.08 }}>
            {props.ingredient}
          </div>
          <div style={{ fontSize: 40, color: brand.muted, marginTop: 16 }}>
            swapped for {props.substitute}
          </div>
        </Rise></Scene>
      </Sequence>

      <Sequence from={scenes[1]!.startFrame} durationInFrames={scenes[1]!.durationFrames}>
        <Scene><Rise>
          <div
            style={{
              alignSelf: 'flex-start',
              backgroundColor: brand.primary,
              color: brand.background,
              padding: '22px 34px',
              borderRadius: 14,
              fontSize: 64,
              fontWeight: 600,
            }}
          >
            {props.ratio}
          </div>
        </Rise></Scene>
      </Sequence>

      <Sequence from={scenes[2]!.startFrame} durationInFrames={scenes[2]!.durationFrames}>
        <Scene><Rise>
          <div style={{ fontSize: 28, letterSpacing: 3, textTransform: 'uppercase', color: brand.muted }}>
            What goes wrong
          </div>
          <div style={{ fontSize: 46, lineHeight: 1.35, marginTop: 18 }}>{props.failureMode}</div>
        </Rise></Scene>
      </Sequence>

      {props.captions ? <Captions cues={props.captions} brand={brand} /> : null}
    </Stage>
  );
};

/** Non-linear scaling, visualised. 20 to 30 seconds. */
export const ScalingMathVideo: React.FC<ScalingMathVideoProps> = (props) => {
  const brand = useBrand(props.brand);
  const { fps } = useVideoConfig();

  return (
    <Stage brand={brand} wordmark={props.wordmark} backgroundDataUri={props.backgroundDataUri}>
      {props.audioSrc ? <Audio src={props.audioSrc} /> : null}

      <Scene>
      <Rise>
        <div style={{ fontSize: 30, letterSpacing: 3, textTransform: 'uppercase', color: brand.primary }}>
          {props.fromServings} servings down to {props.toServings}
        </div>
        <div style={{ fontFamily: brand.headingFont, fontSize: 76, lineHeight: 1.05, marginTop: 18 }}>
          Doubling is not multiplication
        </div>
      </Rise>

      <div style={{ marginTop: 44 }}>
        {props.rows.map((row, i) => (
          <Rise key={row.label} delay={Math.round(fps * (0.8 + i * 0.4))}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 0',
                borderTop: i === 0 ? 'none' : '2px solid rgba(0,0,0,0.08)',
                fontSize: 38,
              }}
            >
              <span>{row.label}</span>
              <span style={{ color: brand.muted, textDecoration: 'line-through' }}>{row.linear}</span>
              <span style={{ color: brand.primary, fontWeight: 600 }}>{row.actual}</span>
            </div>
          </Rise>
        ))}
      </div>

      <Rise delay={Math.round(fps * 2.4)}>
        <div style={{ fontSize: 32, color: brand.muted, marginTop: 32, lineHeight: 1.4 }}>
          {props.note}
        </div>
      </Rise>
      </Scene>

      {props.captions ? <Captions cues={props.captions} brand={brand} /> : null}
    </Stage>
  );
};

/** Kinetic typography. 12 to 20 seconds. */
export const ChefNoteCardVideo: React.FC<ChefNoteCardProps> = (props) => {
  const brand = useBrand(props.brand);
  const { fps } = useVideoConfig();
  const words = props.quote.split(' ');

  return (
    <Stage brand={brand} wordmark={props.wordmark} backgroundDataUri={props.backgroundDataUri}>
      {props.audioSrc ? <Audio src={props.audioSrc} /> : null}

      <Scene>
      <div
        style={{
          fontFamily: brand.headingFont,
          fontSize: 72,
          lineHeight: 1.25,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0 18px',
        }}
      >
        {words.map((word, i) => (
          <Rise key={`${word}-${i}`} delay={Math.round(i * (fps * 0.09))}>
            <span>{word}</span>
          </Rise>
        ))}
      </div>

      {props.attribution ? (
        <Rise delay={Math.round(words.length * fps * 0.09 + fps * 0.4)}>
          <div style={{ fontSize: 32, color: brand.muted, marginTop: 40 }}>{props.attribution}</div>
        </Rise>
      ) : null}
      </Scene>

      {props.captions ? <Captions cues={props.captions} brand={brand} /> : null}
    </Stage>
  );
};
