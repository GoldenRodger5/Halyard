/**
 * ListShort: "5 foods that look vegan and aren't".
 *
 * A bold claim over a full-bleed photo in the first frame, then one sourced
 * item every ~2.5 s (its own photo, a numbered name card, one line, the
 * source), an optional twist ("and one that's fine"), then the save card.
 * Built because viewer reviews of the quiz template kept saying "educational
 * app, not thumb-stopping": a list removes the question-and-timer beat and
 * keeps something new on screen every couple of seconds.
 *
 * Every text box sits in SAFE.
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, SAFE, clamp } from './kit.js';

export interface ListItem {
  n: number;
  name: string;
  line: string;
  source: string;
  photo: string;
  start: number;
  end: number;
  twist?: boolean;
  audio?: string | null;
}

export interface ListShortProps {
  hook: { text: string; photo: string; start: number; end: number; audio?: string | null };
  items: ListItem[];
  close: { start: number; tips: Array<{ name: string; ok: boolean }>; tie: string; save: string; photo: string };
  label: string;
  sfx: { whoosh: string; reveal: string } | null;
  [key: string]: unknown;
}

const INK = '#1B1410';
const RED = '#E0483E';
const GREEN = '#1E9E57';
const W = SAFE.x1 - SAFE.x0;

const useSpring = (at: number, damping = 13) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping, stiffness: 190, mass: 0.85 } });
};

const display = (size: number): React.CSSProperties => ({
  fontFamily: 'Lilita One',
  fontSize: size,
  lineHeight: 1.05,
  color: '#FFFFFF',
  WebkitTextStroke: `${Math.max(3, size * 0.07)}px ${INK}`,
  paintOrder: 'stroke fill',
  textShadow: `0 ${size * 0.07}px 0 rgba(0,0,0,0.35)`,
});

/** Full-bleed photo with a slow push and a short slide-in from the right. */
const Photo: React.FC<{ src: string; from: number; to: number; dim?: number }> = ({ src, from, to, dim = 0.18 }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [from, to], [1.04, 1.16], clamp);
  const slide = interpolate(f, [from, from + 7], [140, 0], clamp);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: INK }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${slide}px) scale(${z})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, rgba(15,10,8,${dim + 0.25}) 0%, rgba(15,10,8,${dim}) 40%, rgba(15,10,8,${dim}) 70%, rgba(15,10,8,0.55) 100%)` }} />
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ h: ListShortProps['hook']; label: string }> = ({ h, label }) => {
  const a = useSpring(h.start - 30, 12);
  const b = useSpring(h.start + 10);
  return (
    <>
      <Photo src={h.photo} from={h.start} to={h.end} dim={0.32} />
      <div style={{ position: 'absolute', left: SAFE.x0 + 10, top: SAFE.y0 + 20, width: W - 20 }}>
        <div style={{ display: 'inline-block', background: INK, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 32, letterSpacing: 3, textTransform: 'uppercase', padding: '10px 18px', borderRadius: 10, transform: `scale(${b})`, transformOrigin: 'left center' }}>{label}</div>
        <div style={{ marginTop: 26, ...display(h.text.length > 32 ? 92 : 104), opacity: Math.min(1, a) }}>{h.text}</div>
      </div>
    </>
  );
};

const Item: React.FC<{ it: ListItem; total: number }> = ({ it, total }) => {
  const f = useCurrentFrame();
  const a = useSpring(it.start + 3);
  const b = useSpring(it.start + 10);
  const c = interpolate(f, [it.start + 18, it.start + 26], [0, 1], clamp);
  const tone = it.twist ? GREEN : RED;
  return (
    <>
      <Photo src={it.photo} from={it.start} to={it.end} />
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: SAFE.y0 + 10, width: W - 12, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, transform: `translateX(${(1 - Math.min(1, a)) * -120}px)`, opacity: Math.min(1, a * 1.5) }}>
          <div style={{ width: 104, height: 104, flex: '0 0 104px', borderRadius: 52, background: tone, border: '6px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(it.twist ? 52 : 62) }}>{it.twist ? '✓' : it.n}</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 30, color: '#FFFFFF', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>{it.twist ? 'Bonus' : `${it.n} of ${total}`}</div>
        </div>
        <div style={{ ...display(it.name.length > 22 ? 70 : it.name.length > 14 ? 82 : 96), transform: `scale(${interpolate(b, [0, 1], [0.8, 1])})`, transformOrigin: 'left center', opacity: Math.min(1, b * 1.5) }}>{it.name}</div>
        <div style={{ alignSelf: 'flex-start', background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, borderRadius: 22, padding: '16px 22px', maxWidth: W - 12, boxSizing: 'border-box', opacity: c, transform: `translateY(${(1 - c) * 24}px)` }}>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: it.line.length > 60 ? 38 : 44, lineHeight: 1.22, color: INK }}>{it.line}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: SAFE.y1 - 64, width: W - 12, opacity: c }}>
        <span style={{ background: 'rgba(17,17,17,0.82)', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 26, padding: '8px 14px', borderRadius: 10 }}>{`Source: ${it.source}`}</span>
      </div>
    </>
  );
};

const Close: React.FC<{ c: ListShortProps['close'] }> = ({ c }) => {
  const f = useCurrentFrame();
  const a = useSpring(c.start + 2, 12);
  const b = useSpring(c.start + 12 + c.tips.length * 5);
  return (
    <>
      <Photo src={c.photo} from={c.start} to={c.start + 150} dim={0.5} />
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: SAFE.y0 + 10, width: W - 12, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ textAlign: 'center', ...display(80), opacity: Math.min(1, a), transform: `scale(${interpolate(a, [0, 1], [0.7, 1])})` }}>Save this</div>
        <div style={{ background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 9px 0 ${INK}`, borderRadius: 26, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {c.tips.map((t, i) => {
            const tt = interpolate(f, [c.start + 8 + i * 5, c.start + 14 + i * 5], [0, 1], clamp);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: tt, transform: `translateX(${(1 - tt) * 40}px)` }}>
                <div style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 22, background: t.ok ? GREEN : RED, color: '#FFFFFF', fontFamily: 'Lilita One', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.ok ? '✓' : '✕'}</div>
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, color: INK }}>{t.name}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(27,20,16,0.85)', borderRadius: 20, padding: '14px 18px', opacity: Math.min(1, b) }}>
          <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 58, height: 58, flex: '0 0 58px', borderRadius: 13 }} />
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 30, lineHeight: 1.25, color: '#FFFFFF' }}>{c.tie}</div>
        </div>
      </div>
    </>
  );
};

const Visible: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};

export const ListShort: React.FC<ListShortProps> = (p) => {
  const total = p.items.filter((i) => !i.twist).length;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <style>{FONTS}</style>
      <Visible from={p.hook.start} to={p.hook.end}>
        <Hook h={p.hook} label={p.label} />
      </Visible>
      {p.items.map((it) => (
        <Visible key={it.n} from={it.start} to={it.end}>
          <Item it={it} total={total} />
        </Visible>
      ))}
      <Visible from={p.close.start} to={Number.MAX_SAFE_INTEGER}>
        <Close c={p.close} />
      </Visible>
      {p.sfx
        ? p.items.map((it) => (
            <Sequence key={`w${it.n}`} from={it.start} durationInFrames={15} layout="none">
              <Audio src={staticFile(it.twist ? p.sfx!.reveal : p.sfx!.whoosh)} volume={0.4} />
            </Sequence>
          ))
        : null}
      {p.hook.audio ? (
        <Sequence from={p.hook.start + 2} layout="none">
          <Audio src={staticFile(p.hook.audio)} />
        </Sequence>
      ) : null}
      {p.items.map((it) =>
        it.audio ? (
          <Sequence key={`a${it.n}`} from={it.start + 3} layout="none">
            <Audio src={staticFile(it.audio)} />
          </Sequence>
        ) : null,
      )}
    </AbsoluteFill>
  );
};
