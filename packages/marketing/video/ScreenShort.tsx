/**
 * ScreenShort — V2 of the short, built around REAL RecipeFix screens.
 *
 * Owner/director review 2026-10-26: the diagram version read as an explainer
 * template; the strongest visual RecipeFix owns is its real UI. Every middle
 * beat is a real screen recording (or a push-in on a 3× capture of the exact
 * line being spoken) in a large window inside the TikTok/Reels text box. The
 * Original's licensed photo opens and closes. No drawn device chrome, no
 * mocked UI.
 *
 * Browser-bundled by Remotion: nothing Node-only here (Halyard gotcha 10).
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const TEXT_BOX = { x0: 120, y0: 270, x1: 900, y1: 1250 } as const;
/**
 * The screen window is the hero (director review 2026-10-26): 702 px = 90% of
 * the text-box width, 730 px = 75% of its height, caption pill just below.
 * Crops are full-width (no horizontal cut through text); motion is a vertical
 * pan within the recording, never a zoom that pushes text off the edges.
 */
export const WINDOW = { x: 189, y: 402, w: 702, h: 730 } as const;
const TX = TEXT_BOX.x0 + 8;
const TW = TEXT_BOX.x1 - TEXT_BOX.x0 - 16;
const C = { cream: '#F5EDE4', terracotta: '#A65336', ink: '#27221E', secondary: '#60554D', rule: '#D9CBBE', peach: '#F2C9B4' };

export interface Crop {
  x: number;
  y: number;
  w: number;
}
export interface Shot {
  kind: 'photo-hook' | 'photo-close' | 'clip' | 'still';
  start: number;
  end: number;
  src?: string;
  /** Seconds into the clip where this shot starts. */
  from?: number;
  crop?: Crop;
  /** Pan target for the crop's y at the end of the shot (a virtual camera move over a real recording). */
  cropYEnd?: number;
  zoom?: [number, number];
  /** Zoom origin inside the window, 0..1. */
  origin?: [number, number];
}
export interface Cue {
  start: number;
  end: number;
  text: string;
}
export interface ScreenShortProps {
  shots: Shot[];
  /** One-line headline per real-screen shot. */
  heads: Array<{ start: number; end: number; text: string }>;
  hook: { kicker: string; text: string };
  close: { kicker: string; text: string };
  captions: Cue[];
  audio: string | null;
  photo: string;
  photoLabel: string;
  screenLabel: string;
  data: { from: number; to: number };
  [key: string]: unknown;
}

const FONTS = `
@font-face{font-family:'Inter';font-weight:400;src:url('${staticFile('fonts/Inter-Regular.woff')}') format('woff');font-display:block}
@font-face{font-family:'Inter';font-weight:600;src:url('${staticFile('fonts/Inter-SemiBold.woff')}') format('woff');font-display:block}
@font-face{font-family:'Instrument Serif';font-weight:400;src:url('${staticFile('fonts/InstrumentSerif-Regular.ttf')}') format('truetype');font-display:block}
`;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Source frames are 1170×2532 (DPR 3). */
const SRC_W = 1170;

const ScreenWindow: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const crop = shot.crop ?? { x: 0, y: 0, w: SRC_W };
  const scale = WINDOW.w / crop.w;
  const y = shot.cropYEnd !== undefined ? interpolate(f, [0, durationInFrames], [crop.y, shot.cropYEnd], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : crop.y;
  const [z0, z1] = shot.zoom ?? [1, 1];
  const z = interpolate(f, [0, durationInFrames], [z0, z1]);
  const [ox, oy] = shot.origin ?? [0.5, 0.5];
  const media =
    shot.kind === 'clip' ? (
      <OffthreadVideo src={staticFile(shot.src!)} startFrom={Math.round((shot.from ?? 0) * 30)} muted style={{ width: SRC_W * scale, height: 2532 * scale }} />
    ) : (
      <Img src={staticFile(shot.src!)} style={{ width: SRC_W * scale, height: 2532 * scale }} />
    );
  return (
    <div
      style={{
        position: 'absolute', left: WINDOW.x, top: WINDOW.y, width: WINDOW.w, height: WINDOW.h, overflow: 'hidden', borderRadius: 28,
        border: `2px solid ${C.rule}`, background: 'white', boxShadow: '0 30px 60px rgba(39,34,30,0.22)',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: WINDOW.w, height: WINDOW.h, transform: `scale(${z})`, transformOrigin: `${ox * 100}% ${oy * 100}%` }}>
        <div style={{ position: 'absolute', left: -crop.x * scale, top: -y * scale }}>{media}</div>
      </div>
    </div>
  );
};

/**
 * Behind the window: the same screen, enlarged and heavily blurred, at low
 * opacity over cream, so the vertical frame is filled with the product's own
 * colour and movement. Image only; at this blur no text is legible.
 */
const ScreenAmbience: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(f, [0, durationInFrames], [1.15, 1.25]);
  const style = { width: 1080, height: 1920 * 1.0, objectFit: 'cover' as const, filter: 'blur(44px) saturate(1.1)', transform: `scale(${z})` };
  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: 0.38 }}>
      {shot.kind === 'clip' ? (
        <OffthreadVideo src={staticFile(shot.src!)} startFrom={Math.round((shot.from ?? 0) * 30)} muted style={style} />
      ) : (
        <Img src={staticFile(shot.src!)} style={style} />
      )}
    </AbsoluteFill>
  );
};

const PhotoGround: React.FC<{ src: string; label: string }> = ({ src, label }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(f, [0, durationInFrames], [1.0, 1.12]);
  return (
    <>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img src={staticFile(src)} style={{ width: 1080, height: 1920, objectFit: 'cover', transform: `scale(${z})`, transformOrigin: '60% 45%' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(20,14,10,0.80) 0%, rgba(20,14,10,0.50) 38%, rgba(20,14,10,0.55) 58%, rgba(20,14,10,0.85) 100%)' }} />
      <div style={{ position: 'absolute', left: TX, top: 975, width: TW, fontFamily: 'Inter', fontSize: 34, lineHeight: 1.25, color: 'rgba(255,255,255,0.9)' }}>{label}</div>
    </>
  );
};

const Hook: React.FC<{ text: string; kicker: string; d: ScreenShortProps['data']; photo: string; label: string }> = ({ text, kicker, d, photo, label }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  const flip = interpolate(f, [8, 20], [0, 1], { ...clamp, easing: ease });
  return (
    <>
      <PhotoGround src={photo} label={label} />
      <div style={{ position: 'absolute', left: TX, top: TEXT_BOX.y0 + 10, width: TW }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, letterSpacing: 3, color: C.peach, textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 84, lineHeight: 1.04, color: 'white', marginTop: 14 }}>{text}</div>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 560, width: 1080, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 40, transform: `scale(${0.85 + 0.15 * s})`, fontFamily: 'Instrument Serif', color: 'white' }}>
          <div style={{ fontSize: 300, lineHeight: 1, opacity: 1 - flip * 0.55 }}>{d.from}</div>
          <div style={{ fontSize: 140, lineHeight: 1, color: C.peach, opacity: flip }}>→</div>
          <div style={{ fontSize: 300, lineHeight: 1, color: C.peach, opacity: flip, transform: `translateY(${(1 - flip) * 40}px)` }}>{d.to}</div>
        </div>
      </div>
    </>
  );
};

const Close: React.FC<{ text: string; kicker: string; photo: string; label: string }> = ({ text, kicker, photo, label }) => {
  const f = useCurrentFrame();
  const lines = text.split(/(?<=\.)\s+/);
  return (
    <>
      <PhotoGround src={photo} label={label} />
      <div style={{ position: 'absolute', left: TX, top: TEXT_BOX.y0 + 10, width: TW }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, letterSpacing: 3, color: C.peach, textTransform: 'uppercase' }}>{kicker}</div>
        {lines.map((l, i) => {
          const t = interpolate(f, [i * 24, i * 24 + 14], [0, 1], { ...clamp, easing: ease });
          return <div key={i} style={{ fontFamily: 'Instrument Serif', fontSize: 104, lineHeight: 1.04, color: 'white', marginTop: i ? 4 : 14, opacity: 0.6 + 0.4 * t, transform: `translateY(${(1 - t) * 28}px)` }}>{l}</div>;
        })}
      </div>
      <div style={{ position: 'absolute', left: TX, top: 860, width: TW, fontFamily: 'Inter', fontWeight: 600, fontSize: 48, color: C.peach, opacity: interpolate(f, [60, 74], [0, 1], clamp) }}>recipefix.app</div>
    </>
  );
};

const Head: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div style={{ position: 'absolute', left: TX, top: 318, width: TW, fontFamily: 'Instrument Serif', fontSize: 72, lineHeight: 1.0, color: C.ink, whiteSpace: 'nowrap' }}>
      {text}
    </div>
  );
};

const Captions: React.FC<{ cues: Cue[]; onPhoto: boolean }> = ({ cues }) => {
  const f = useCurrentFrame();
  const cue = cues.find((c) => f >= c.start && f < c.end);
  if (!cue) return null;
  return (
    <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 1138, width: TEXT_BOX.x1 - TEXT_BOX.x0, height: 108, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.ink, color: 'white', fontFamily: 'Inter', fontWeight: 600, fontSize: 50, lineHeight: 1.15, padding: '10px 24px', borderRadius: 14, textAlign: 'center' }}>{cue.text}</div>
    </div>
  );
};

const Progress: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, top: 0, height: 12, width: (1080 * f) / Math.max(1, durationInFrames - 1), background: C.terracotta, zIndex: 5 }} />;
};

export const ScreenShort: React.FC<ScreenShortProps> = (p) => {
  const f = useCurrentFrame();
  const onScreen = p.shots.some((s) => (s.kind === 'clip' || s.kind === 'still') && f >= s.start && f < s.end);
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <style>{FONTS}</style>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
      {p.shots.map((s, i) => (
        <Sequence key={i} from={s.start} durationInFrames={s.end - s.start}>
          {s.kind === 'photo-hook' ? <Hook text={p.hook.text} kicker={p.hook.kicker} d={p.data} photo={p.photo} label={p.photoLabel} /> : null}
          {s.kind === 'photo-close' ? <Close text={p.close.text} kicker={p.close.kicker} photo={p.photo} label={p.photoLabel} /> : null}
          {s.kind === 'clip' || s.kind === 'still' ? (
            <>
              <ScreenAmbience shot={s} />
              <ScreenWindow shot={s} />
            </>
          ) : null}
        </Sequence>
      ))}
      {p.heads.map((h, i) => (
        <Sequence key={`h${i}`} from={h.start} durationInFrames={h.end - h.start}>
          <Head text={h.text} />
        </Sequence>
      ))}
      {onScreen ? (
        <div style={{ position: 'absolute', left: TX, top: TEXT_BOX.y0 + 4, width: TW, fontFamily: 'Inter', fontWeight: 600, fontSize: 36, color: C.terracotta }}>{p.screenLabel}</div>
      ) : null}
      <Progress />
      <Captions cues={p.captions} onPhoto={!onScreen} />
    </AbsoluteFill>
  );
};
