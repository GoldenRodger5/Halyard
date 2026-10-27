/**
 * VersusShort: "this or that", three rounds, split screen.
 *
 * Two bold typographic tiles meet at a VS badge; the badge becomes a 3-second
 * countdown ring; the winner's tile shoves the loser aside and the loser goes
 * grey; both numbers count up from zero; a ratio badge pops; a card says why
 * and names the source. Then the next pair slams in.
 *
 * Tiles are colour fields and type, never pictures of food: none of the
 * licensed Originals photos is an orange or a can of cola, and a generated
 * picture would be a fake. The one photo is the close, under the RecipeFix line.
 *
 * Zones (1080×1920, text inside SAFE x 120–900, y 270–1250):
 *   282–340 header   360–500 question + basis   520–1010 tiles   1030–1245 why card
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, SAFE, clamp } from './kit.js';

export interface VersusSide {
  name: string;
  sub: string;
  value: number;
  color: string;
}

export interface VersusRound {
  question: string;
  unit: string;
  basis: string;
  left: VersusSide;
  right: VersusSide;
  winner: 0 | 1;
  ratio: string;
  why: string;
  source: string;
  start: number;
  countdownAt: number;
  revealAt: number;
  whyAt: number;
  end: number;
  audio: { q: string | null; a: string | null };
}

export interface VersusShortProps {
  label: string;
  rounds: VersusRound[];
  recap: VersusRecap;
  sfx: { tick: string; reveal: string; whoosh: string; thud: string } | null;
  [key: string]: unknown;
}

const BG = '#141016';
const CREAM = '#FFF6EA';
const INK = '#18120E';
const W = SAFE.x1 - SAFE.x0;
const TILE_TOP = 520;
/** Where the names sit, and where the numbers (and before them the VS badge) sit. */
const NAME_TOP = 616;
const NUM_TOP = 890;
const GAP = 10;

const useSpr = (at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 14, stiffness: 170, mass: 0.9, ...cfg } });
};

const fmt = (v: number, target: number) => {
  const dp = Number.isInteger(target) ? 0 : String(target).split('.')[1]!.length;
  return v.toFixed(dp);
};

/** Diagonal stripes that never stop sliding: the ground is never a still. */
const Ground: React.FC = () => {
  const f = useCurrentFrame();
  const o = (f * 1.4) % 80;
  return (
    <AbsoluteFill style={{ background: BG, overflow: 'hidden' }}>
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 40px, transparent 40px 80px)', backgroundPosition: `${o}px 0`, transform: 'scale(1.2)' }} />
    </AbsoluteFill>
  );
};

/** Ink or cream, whichever reads on this tile (WCAG relative luminance). */
const textOn = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return (L + 0.05) / (0.0144 + 0.05) >= (1.05 / (L + 0.05)) ? INK : CREAM;
};

/**
 * A colour field running from the tile top to the bottom of the frame (no dead black under it).
 * Name block from NAME_TOP; the number lands at NUM_TOP after the reveal, where the VS badge was.
 */
const Tile: React.FC<{ side: VersusSide; x: number; w: number; textX0: number; textX1: number; state: 'idle' | 'win' | 'lose'; r: VersusRound; enter: number; isLeft: boolean }> = ({ side, x, w, textX0, textX1, state, r, enter, isLeft }) => {
  const f = useCurrentFrame();
  const lose = state === 'lose' ? interpolate(f, [r.revealAt, r.revealAt + 10], [0, 1], clamp) : 0;
  const tw = textX1 - textX0;
  const name = side.name.toUpperCase();
  const longest = Math.max(...name.split(' ').map((p) => p.length));
  const size = Math.max(40, Math.min(78, Math.floor(tw / (longest * 0.72))));
  // Round-3 reviews read a count-up caught at 1 fps as "the numbers change between frames": the real number lands at once, with a pop.
  const numIn = useSpr(r.revealAt + 2, { damping: 11, stiffness: 220 });
  const win = state === 'win';
  const numSize = win ? 104 : Math.min(64, Math.floor(tw / (String(side.value).length * 0.62 + 1.2)));
  const drift = Math.sin((f - r.start) / 26) * 14;
  const slide = (1 - enter) * (isLeft ? -620 : 620);
  // A losing tile darkens to near-black grey, so its cream type keeps its contrast.
  const ink = lose > 0.5 ? CREAM : textOn(side.color);
  const H = 1920 - TILE_TOP;
  return (
    <div style={{ position: 'absolute', left: x + slide, top: TILE_TOP, width: w, height: H, overflow: 'hidden', borderRadius: '6px 6px 0 0' }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(170deg, ${side.color} 0%, ${side.color} 60%, rgba(0,0,0,0.45) 130%), ${side.color}`, filter: `grayscale(${lose}) brightness(${1 - lose * 0.62})` }} />
      {/* A giant initial drifting behind the name: texture with no picture in it. Kept below the text block. */}
      <div style={{ position: 'absolute', left: (isLeft ? 10 : w - 460) + drift, top: NUM_TOP - TILE_TOP + 120, fontFamily: 'Instrument Serif', fontSize: 760, lineHeight: 1, color: 'rgba(255,255,255,0.12)' }}>{side.name[0]}</div>
      {win ? <div style={{ position: 'absolute', inset: 0, border: `10px solid ${CREAM}`, borderBottom: 'none', opacity: interpolate(f, [r.revealAt, r.revealAt + 6], [0, 1], clamp), borderRadius: '6px 6px 0 0' }} /> : null}
      <div style={{ position: 'absolute', left: textX0 - x, top: NAME_TOP - TILE_TOP, width: tw, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: size, lineHeight: 1.02, color: ink }}>{name}</div>
        {side.sub ? <div style={{ marginTop: 14, fontFamily: 'Inter', fontWeight: 600, fontSize: 30, letterSpacing: 3, textTransform: 'uppercase', color: ink, opacity: 0.92 }}>{side.sub}</div> : null}
      </div>
      {f >= r.revealAt ? (
        <div style={{ position: 'absolute', left: textX0 - x, top: NUM_TOP - TILE_TOP, width: tw, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter', fontWeight: 600, fontSize: numSize, lineHeight: 1, color: ink, transform: `scale(${numIn})`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(side.value, side.value)}
          <span style={{ fontSize: numSize * 0.42, marginLeft: 8 }}>{r.unit}</span>
        </div>
      ) : null}
    </div>
  );
};

/** The seam badge: "VS", then a draining ring with 3, 2, 1, then it bursts away on the reveal. */
const Badge: React.FC<{ r: VersusRound; x: number }> = ({ r, x }) => {
  const f = useCurrentFrame();
  const inS = useSpr(r.start + 8, { damping: 9, stiffness: 240 });
  const gone = interpolate(f, [r.revealAt, r.revealAt + 8], [1, 0], clamp);
  if (gone <= 0) return null;
  const counting = f >= r.countdownAt && f < r.revealAt;
  const k = Math.max(0, Math.min(1, (f - r.countdownAt) / (r.revealAt - r.countdownAt)));
  const n = Math.ceil(3 - k * 3);
  const beat = counting ? 1 + 0.12 * Math.max(0, 1 - ((f - r.countdownAt) % 30) / 8) : 1;
  const R = 92;
  const C = 2 * Math.PI * (R - 9);
  const first = r.start === 0;
  return (
    <div style={{ position: 'absolute', left: x - R, top: NUM_TOP + 65 - R, width: R * 2, height: R * 2, transform: `scale(${(first ? 1 : inS) * gone * beat}) rotate(${counting ? 0 : -8}deg)` }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: R, background: CREAM, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }} />
      {counting ? (
        <svg width={R * 2} height={R * 2} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx={R} cy={R} r={R - 9} fill="none" stroke={k > 0.66 ? '#D7372B' : INK} strokeWidth={12} strokeDasharray={C} strokeDashoffset={C * k} strokeLinecap="round" />
        </svg>
      ) : null}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Instrument Serif', fontSize: counting ? 110 : 84, color: counting && k > 0.66 ? '#D7372B' : INK, lineHeight: 1 }}>{counting ? n : 'vs'}</div>
    </div>
  );
};

const Round: React.FC<{ r: VersusRound; index: number; total: number; label: string }> = ({ r, index, total }) => {
  // Round-4 reviews: the cover had "no surprising claim". The header now states the gap, computed from the FDC numbers.
  const f = useCurrentFrame();
  const first = r.start === 0;
  // The next pair starts sliding in 5 frames before the cut: never an empty frame between rounds.
  const enterS = useSpr(r.start, { damping: 15, stiffness: 190 });
  const enter = first ? 1 : enterS;
  // Hard cut, no crossfade: two rounds' text half-visible at once read as a broken export (round-3 review).
  const exit = 0;
  const revealed = f >= r.revealAt;
  const grow = useSpr(r.revealAt, { damping: 12, stiffness: 150 });
  const shift = revealed ? interpolate(grow, [0, 1], [0, 140]) * (r.winner === 0 ? 1 : -1) : 0;
  const split = 540 + shift;
  const q = useSpr(r.start + 2, { damping: 14 });
  // The question is there at the cut (scale only), so a cut never shows an empty header.
  const qIn = first ? 1 : Math.max(0.6, q);
  const why = useSpr(r.whyAt, { damping: 15 });
  const ratio = useSpr(r.revealAt + 22, { damping: 8, stiffness: 260 });
  const state = (i: 0 | 1) => (!revealed ? 'idle' : i === r.winner ? 'win' : 'lose') as 'idle' | 'win' | 'lose';
  const winX = r.winner === 0 ? (SAFE.x0 + split - GAP) / 2 : (split + GAP + SAFE.x1) / 2;
  return (
    <AbsoluteFill style={{ opacity: 1 - exit, transform: `translateY(${-exit * 40}px)` }}>
      <div style={{ position: 'absolute', left: SAFE.x0, top: 282, width: W, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 30, letterSpacing: 6, color: CREAM, textTransform: 'uppercase' }}>{`One has ${r.ratio.replace('×', 'x')} more`}</span>
        <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 28, letterSpacing: 2, color: INK, background: CREAM, padding: '8px 18px', borderRadius: 999 }}>{`Round ${index + 1} of ${total}`}</span>
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0, top: 360, width: W, textAlign: 'center', opacity: Math.min(1, qIn), transform: `scale(${interpolate(qIn, [0, 1], [0.85, 1])})` }}>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 104, lineHeight: 1, color: CREAM }}>{r.question}</div>
        <div style={{ marginTop: 14, fontFamily: 'Inter', fontWeight: 600, fontSize: 30, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,246,234,0.78)' }}>{r.basis}</div>
      </div>
      <Tile side={r.left} x={0} w={split - GAP / 2} textX0={SAFE.x0 + 10} textX1={split - GAP / 2 - 24} state={state(0)} r={r} enter={enter} isLeft />
      <Tile side={r.right} x={split + GAP / 2} w={1080 - split - GAP / 2} textX0={split + GAP / 2 + 24} textX1={SAFE.x1 - 10} state={state(1)} r={r} enter={enter} isLeft={false} />
      <Badge r={r} x={split} />
      {revealed ? (
        <div style={{ position: 'absolute', left: winX - 110, top: TILE_TOP + 14, width: 220, display: 'flex', justifyContent: 'center', transform: `scale(${ratio}) rotate(-6deg)` }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 50, color: INK, background: CREAM, padding: '6px 22px', borderRadius: 14, boxShadow: '0 6px 0 rgba(0,0,0,0.35)' }}>{r.ratio}</span>
        </div>
      ) : null}
      {f >= r.whyAt ? (
        <div style={{ position: 'absolute', left: SAFE.x0 + 4, top: 1030, width: W - 8, background: CREAM, borderRadius: 22, padding: '22px 28px 20px', boxSizing: 'border-box', opacity: Math.min(1, why), transform: `translateY(${(1 - Math.min(1, why)) * 50}px)` }}>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: r.why.length > 80 ? 32 : 35, lineHeight: 1.25, color: INK }}>{r.why}</div>
          <div style={{ marginTop: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 24, color: '#6A5D53' }}>{`Source: ${r.source}`}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export interface VersusRecap {
  start: number;
  title: string;
  rows: Array<{ winner: string; loser: string; metric: string; wv: number; lv: number; unit: string; color: string }>;
  source: string;
}

/** The last frame is for the viewer: the three answers in one screenshot, no brand card. */
const Recap: React.FC<{ c: VersusRecap }> = ({ c }) => {
  const f = useCurrentFrame();
  // Enters a few frames before the last round's cut, so there is never an empty frame.
  const t = useSpr(c.start - 4, { damping: 15 });
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: SAFE.x0 + 10, top: 330, width: W - 20, textAlign: 'center', fontFamily: 'Instrument Serif', fontSize: 92, lineHeight: 1.02, color: CREAM, textShadow: '0 4px 18px rgba(0,0,0,0.35)', opacity: Math.min(1, t), transform: `translateY(${(1 - t) * 30}px)` }}>{c.title}</div>
      {c.rows.map((r, i) => {
        const k = spring({ frame: f - (c.start + i * 6), fps: 30, config: { damping: 13, stiffness: 190 } });
        return (
          <div key={i} style={{ position: 'absolute', left: SAFE.x0 + 6, top: 500 + i * 228, width: W - 12, height: 200, borderRadius: 22, background: '#FFFFFF', boxShadow: '0 16px 40px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', overflow: 'hidden', opacity: Math.min(1, k), transform: `translateX(${(1 - k) * 120}px)` }}>
            <div style={{ width: 22, alignSelf: 'stretch', background: r.color }} />
            <div style={{ padding: '0 30px', flex: 1 }}>
              <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', color: '#6A5D53' }}>{r.metric}</div>
              <div style={{ marginTop: 6, fontFamily: 'Inter', fontWeight: 600, fontSize: r.winner.length > 12 ? 48 : 56, lineHeight: 1.05, color: INK }}>{r.winner}</div>
              <div style={{ marginTop: 8, fontFamily: 'Inter', fontWeight: 600, fontSize: 30, color: '#4A4038' }}>{`${r.wv} ${r.unit} vs ${r.lv} ${r.unit}, ${r.loser.toLowerCase()}`}</div>
            </div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: SAFE.x0 + 10, top: 1186, width: W - 20, textAlign: 'center', fontFamily: 'Inter', fontWeight: 600, fontSize: 28, color: 'rgba(255,246,234,0.9)', opacity: Math.min(1, t) }}>{`Source: ${c.source}, per 100 g`}</div>
    </AbsoluteFill>
  );
};

export const VersusShort: React.FC<VersusShortProps> = (p) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: BG }}>
      <style>{FONTS}</style>
      <Ground />
      {p.rounds.map((r, i) => (f >= r.start && f < r.end ? <Round key={i} r={r} index={i} total={p.rounds.length} label={p.label} /> : null))}
      {f >= p.recap.start ? <Recap c={p.recap} /> : null}
      {p.rounds.map((r, i) => {
        // One tick per digit on the badge (3, 2, 1), however long the countdown is.
        const secs = 3;
        const step = Math.round((r.revealAt - r.countdownAt) / 3);
        return (
          <React.Fragment key={`a${i}`}>
            {p.sfx && r.start > 0 ? (
              <Sequence from={r.start} durationInFrames={20} layout="none">
                <Audio src={staticFile(p.sfx.thud)} volume={0.7} />
              </Sequence>
            ) : null}
            {r.audio.q ? (
              <Sequence from={r.start + 6} layout="none">
                <Audio src={staticFile(r.audio.q)} />
              </Sequence>
            ) : null}
            {p.sfx
              ? Array.from({ length: secs }, (_, k) => (
                  <Sequence key={k} from={r.countdownAt + k * step} durationInFrames={12} layout="none">
                    <Audio src={staticFile(p.sfx!.tick)} volume={k === secs - 1 ? 0.8 : 0.55} />
                  </Sequence>
                ))
              : null}
            {p.sfx ? (
              <Sequence from={r.revealAt} durationInFrames={30} layout="none">
                <Audio src={staticFile(p.sfx.reveal)} volume={0.6} />
              </Sequence>
            ) : null}
            {r.audio.a ? (
              <Sequence from={r.revealAt + 8} layout="none">
                <Audio src={staticFile(r.audio.a)} />
              </Sequence>
            ) : null}
          </React.Fragment>
        );
      })}
      {p.sfx ? (
        <Sequence from={Math.max(0, p.recap.start - 4)} durationInFrames={14} layout="none">
          <Audio src={staticFile(p.sfx.whoosh)} volume={0.4} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
