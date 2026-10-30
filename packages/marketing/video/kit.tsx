/**
 * Shared pieces for every RecipeFix short: fonts, palette, the safe box, the
 * photo ground, the progress line and the brand sign-off.
 *
 * Browser-bundled by Remotion: nothing Node-only here.
 */
import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

/** TikTok ∩ Reels text box at 1080×1920: right column holds the platform buttons, bottom the caption. */
export const SAFE = { x0: 120, y0: 270, x1: 900, y1: 1250 } as const;
/** Text column: 6 px inside the box so serif overhangs (W, J) stay in it. */
export const TX = SAFE.x0 + 6;
export const SAFE_W = SAFE.x1 - SAFE.x0 - 12;

export const C = {
  cream: '#F5EDE4',
  terracotta: '#C1714F',
  terracottaDeep: '#A65336',
  ink: '#1F1A17',
  peach: '#F2C9B4',
  correct: '#22764A',
  white: '#FFFFFF',
} as const;

export const FONTS = `
@font-face{font-family:'Inter';font-weight:400;src:url('${staticFile('fonts/Inter-Regular.woff')}') format('woff');font-display:block}
@font-face{font-family:'Inter';font-weight:600;src:url('${staticFile('fonts/Inter-SemiBold.woff')}') format('woff');font-display:block}
@font-face{font-family:'Lilita One';font-weight:400;src:url('${staticFile('fonts/LilitaOne.woff2')}') format('woff2');font-display:block}
@font-face{font-family:'Instrument Serif';font-weight:400;src:url('${staticFile('fonts/InstrumentSerif-Regular.ttf')}') format('truetype');font-display:block}
`;

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0→1 over `len` frames starting at `at`. */
export const fadeIn = (f: number, at: number, len = 10) => interpolate(f, [at, at + len], [0, 1], clamp);

export const usePop = (at: number) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 13, stiffness: 160 } });
};

/**
 * A food photograph, full-bleed, slowly pushing in, under a scrim that keeps
 * white type at AA contrast wherever it lands. `strength` 0..1 darkens more.
 */
export const PhotoGround: React.FC<{ src: string; from: number; to: number; strength?: number; blur?: number; origin?: string; zoom?: [number, number]; mode?: 'even' | 'top' }> = ({
  src,
  from,
  to,
  strength = 0.8,
  blur = 0,
  origin = '50% 40%',
  zoom = [1.04, 1.14],
  mode = 'even',
}) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [from, to], zoom, clamp);
  const a = (x: number) => Math.min(0.96, x * strength);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.ink }}>
      <Img
        src={staticFile(src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, transformOrigin: origin, filter: blur ? `blur(${blur}px) saturate(1.05)` : undefined }}
      />
      {mode === 'top' ? (
        <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(20,15,12,0.93) 0%, rgba(20,15,12,0.90) 40%, rgba(20,15,12,0.55) 58%, rgba(20,15,12,0.12) 74%, rgba(20,15,12,0.30) 100%)' }} />
      ) : (
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, rgba(20,15,12,${a(0.78)}) 0%, rgba(20,15,12,${a(0.86)}) 30%, rgba(20,15,12,${a(0.92)}) 62%, rgba(20,15,12,${a(1)}) 100%)`,
        }}
      />
      )}
    </AbsoluteFill>
  );
};

export const Progress: React.FC<{ color?: string }> = ({ color = C.terracotta }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, top: 0, height: 10, width: (1080 * f) / Math.max(1, durationInFrames - 1), background: color, zIndex: 20 }} />;
};

export const Pill: React.FC<{ children: React.ReactNode; bg?: string; color?: string; size?: number }> = ({ children, bg = C.terracottaDeep, color = C.white, size = 30 }) => (
  <span
    style={{
      display: 'inline-block',
      background: bg,
      color,
      fontFamily: 'Inter',
      fontWeight: 600,
      fontSize: size,
      letterSpacing: 2.5,
      textTransform: 'uppercase',
      padding: `${size * 0.32}px ${size * 0.7}px`,
      borderRadius: 999,
      lineHeight: 1,
    }}
  >
    {children}
  </span>
);

/** The app mark plus wordmark, white, for dark grounds. */
export const Brand: React.FC<{ size?: number; color?: string }> = ({ size = 76, color = C.white }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
    <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: size, height: size, borderRadius: size * 0.22 }} />
    <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: size * 0.62, color, letterSpacing: -0.5 }}>RecipeFix</span>
  </div>
);

/** Brand sign-off: a line worth saving, the product line, the mark. */
export const SignOff: React.FC<{ at: number; headline: string; product: string; url?: string; dy?: number }> = ({ at, headline, product, url = 'recipefix.app', dy = 0 }) => {
  const f = useCurrentFrame();
  const p = usePop(at);
  const t2 = fadeIn(f, at + 14, 12);
  const t3 = fadeIn(f, at + 26, 12);
  return (
    <div style={{ position: 'absolute', left: TX, top: SAFE.y0 + 120 + dy, width: SAFE_W }}>
      <div style={{ fontFamily: 'Instrument Serif', fontSize: 96, lineHeight: 1.02, color: C.white, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>{headline}</div>
      <div style={{ marginTop: 56, opacity: t2, transform: `translateY(${(1 - t2) * 20}px)` }}>
        <Brand />
      </div>
      <div style={{ marginTop: 30, fontFamily: 'Inter', fontSize: 40, lineHeight: 1.3, color: 'rgba(255,255,255,0.92)', opacity: t2 }}>{product}</div>
      <div style={{ marginTop: 26, fontFamily: 'Inter', fontWeight: 600, fontSize: 40, color: C.peach, opacity: t3 }}>{url}</div>
    </div>
  );
};

/** TikTok's text-with-background style: each wrapped line gets its own box. */
export const Boxed: React.FC<{ children: React.ReactNode; size: number; weight?: number; bg?: string; color?: string }> = ({ children, size, weight = 600, bg = '#FFFFFF', color = '#111111' }) => (
  <div style={{ lineHeight: 1.4 }}>
    <span
      style={{
        background: bg,
        color,
        fontFamily: 'Inter',
        fontWeight: weight,
        fontSize: size,
        padding: `${size * 0.1}px ${size * 0.3}px`,
        borderRadius: size * 0.22,
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }}
    >
      {children}
    </span>
  </div>
);
