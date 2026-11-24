/**
 * AppShort: RecipeFix shown the way app videos look in the feed. The real
 * screen recording fills the frame; a virtual camera pans and pushes in on
 * what each line is about; the line sits on top in TikTok's text style.
 *
 * Recordings are 1170×2532 (390×844 CSS at DPR 3). A shot names the source
 * y the panel pans to.
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Boxed, C, FONTS, SAFE, clamp } from './kit.js';

export interface AppShot {
  kind: 'photo' | 'clip';
  src: string;
  start: number;
  end: number;
  /** Seconds into the clip. */
  from?: number;
  /** Source-pixel y the camera centres on, start → end. */
  focus?: [number, number];
  text: string;
}

export interface AppShortProps {
  shots: AppShot[];
  close: { start: number; tie: string; photo: string };
  note: string;
  sfx: { whoosh: string } | null;
  /** Narration per shot and for the close (ElevenLabs), when voiced. */
  vo?: { shots: Array<string | null>; close: string | null };
  [key: string]: unknown;
}

const SRC_W = 1170;
const X = SAFE.x0 + 26;
const W = SAFE.x1 - SAFE.x0 - 52;

/**
 * The real screen in a phone-width panel (owner + reviewer, 2026-10-26): the
 * app's full width is always visible, so no word is ever cut at the sides, and
 * the line above never sits on the app's own text. Motion is a vertical pan
 * only, clamped to the recording; the panel rises in on the first frame.
 */
const PANEL = { x: SAFE.x0, w: SAFE.x1 - SAFE.x0, top: 540, h: 1340 } as const;
const Panel: React.FC<{ s: AppShot }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = s.end - s.start;
  const rise = spring({ frame: f, fps, config: { damping: 15, stiffness: 140 } });
  const scale = PANEL.w / SRC_W;
  const [y0, y1] = s.focus ?? [900, 900];
  const y = interpolate(f, [0, d], [y0, y1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  // Focus lands ~360 px into the panel (inside the safe box); never past the recording's edges.
  const top = Math.min(0, Math.max(PANEL.h - 2532 * scale, 360 - y * scale));
  return (
    <>
      <AbsoluteFill style={{ background: '#C8553D' }} />
      <div
        style={{
          position: 'absolute',
          left: PANEL.x,
          top: PANEL.top,
          width: PANEL.w,
          height: PANEL.h,
          borderRadius: 44,
          overflow: 'hidden',
          background: '#FFFFFF',
          border: '8px solid #1B1410',
          boxShadow: '0 30px 70px rgba(0,0,0,0.35)',
          boxSizing: 'border-box',
          transform: `translateY(${(1 - Math.min(1, rise)) * 120}px)`,
        }}
      >
        <OffthreadVideo src={staticFile(s.src)} startFrom={Math.round((s.from ?? 0) * 30)} muted style={{ position: 'absolute', left: 0, top, width: SRC_W * scale, height: 2532 * scale }} />
      </div>
    </>
  );
};

const Photo: React.FC<{ src: string; len: number }> = ({ src, len }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.ink }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [0, len], [1.05, 1.16], clamp)})` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(15,10,8,0.15) 0%, rgba(15,10,8,0.1) 55%, rgba(15,10,8,0.7) 100%)' }} />
    </AbsoluteFill>
  );
};

const Line: React.FC<{ text: string; size?: number }> = ({ text, size = 62 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 3, fps, config: { damping: 13, stiffness: 180 } });
  return (
    <div style={{ position: 'absolute', left: X, top: SAFE.y0 + 20, width: W, opacity: Math.min(1, s), transform: `translateY(${(1 - Math.min(1, s)) * 36}px) scale(${interpolate(s, [0, 1], [0.94, 1])})`, transformOrigin: 'left top' }}>
      <Boxed size={size}>{text}</Boxed>
    </div>
  );
};

export const AppShort: React.FC<AppShortProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = spring({ frame: f - p.close.start - 16, fps, config: { damping: 13 } });
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <style>{FONTS}</style>
      {p.shots.map((s, i) => (
        <Sequence key={i} from={s.start} durationInFrames={s.end - s.start} layout="none">
          {s.kind === 'photo' ? <Photo src={s.src} len={s.end - s.start} /> : <Panel s={s} />}
          <Line text={s.text} size={s.kind === 'photo' ? 70 : 54} />
          {s.kind === 'clip' ? (
            <div style={{ position: 'absolute', left: X, top: PANEL.top - 52, width: W }}>
              <Boxed size={26} weight={400} bg="rgba(17,17,17,0.85)" color="#FFFFFF">
                {p.note}
              </Boxed>
            </div>
          ) : null}
          {p.vo?.shots[i] ? (
            <Sequence from={4} layout="none">
              <Audio src={staticFile(p.vo.shots[i]!)} />
            </Sequence>
          ) : null}
          {p.sfx && i > 0 ? (
            <Sequence from={0} durationInFrames={15} layout="none">
              <Audio src={staticFile(p.sfx.whoosh)} volume={0.35} />
            </Sequence>
          ) : null}
        </Sequence>
      ))}
      <Sequence from={p.close.start} layout="none">
        <Photo src={p.close.photo} len={150} />
        {p.vo?.close ? (
          <Sequence from={4} layout="none">
            <Audio src={staticFile(p.vo.close)} />
          </Sequence>
        ) : null}
        <Line text={p.close.tie} size={66} />
        <div style={{ position: 'absolute', left: X, top: SAFE.y0 + 420, display: 'flex', alignItems: 'center', gap: 22, opacity: Math.min(1, b), transform: `scale(${interpolate(b, [0, 1], [0.8, 1])})`, transformOrigin: 'left center' }}>
          <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 116, height: 116, borderRadius: 26, boxShadow: '0 8px 22px rgba(0,0,0,0.4)' }} />
          <Boxed size={52} bg="#111111" color="#FFFFFF">
            recipefix.app
          </Boxed>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
