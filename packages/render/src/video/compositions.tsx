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

export interface VideoBaseProps {
  brand?: BrandTokens;
  captions?: CaptionCue[];
  audioSrc?: string | null;
  wordmark?: string;
}

export interface TransformationDiffVideoProps extends VideoBaseProps {
  headline: string;
  swaps: Array<{ before: string; after: string; reason: string }>;
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

const Stage: React.FC<{ brand: BrandTokens; children: React.ReactNode; wordmark?: string }> = ({
  brand,
  children,
  wordmark,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: brand.background,
      color: brand.ink,
      fontFamily: brand.bodyFont,
    }}
  >
    <Fonts />
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
          color: brand.muted,
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
export const Captions: React.FC<{ cues: CaptionCue[]; brand: BrandTokens }> = ({ cues, brand }) => {
  const frame = useCurrentFrame();
  const active = cues.find((cue) => frame >= cue.startFrame && frame <= cue.endFrame);
  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        bottom: '16%',
        textAlign: 'center',
        fontSize: 52,
        lineHeight: 1.25,
        fontWeight: 600,
        color: brand.ink,
        textShadow: `0 2px 0 ${brand.background}, 0 -2px 0 ${brand.background}, 2px 0 0 ${brand.background}, -2px 0 0 ${brand.background}`,
      }}
    >
      {active.text}
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

  const scenes = layoutScenes(
    [
      { id: 'headline', weight: 1, minSeconds: 2 },
      ...props.swaps.map((_, i) => ({ id: `swap-${i}`, weight: 2, minSeconds: 3 })),
    ],
    durationInFrames,
    fps,
  );

  return (
    <Stage brand={brand} wordmark={props.wordmark}>
      {props.audioSrc ? <Audio src={props.audioSrc} /> : null}

      {scenes.map((scene, index) => (
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
      ))}

      {props.captions ? <Captions cues={props.captions} brand={brand} /> : null}
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
    <Stage brand={brand} wordmark={props.wordmark}>
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
    <Stage brand={brand} wordmark={props.wordmark}>
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
    <Stage brand={brand} wordmark={props.wordmark}>
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
