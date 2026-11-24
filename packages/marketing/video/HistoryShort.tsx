/**
 * HistoryShort: a narrated food-history story, 25–40 s.
 *
 * Editorial, not a game show: an aged-paper page (drawn here with SVG noise, no
 * stock texture), a year that rolls back from today and lands, story beats
 * that each own one visual (a Ken Burns print, a ruled ledger, a typed quote, a
 * pin, a stamp), word-by-word captions on the narrator's own clock, a source
 * lower third on the payoff, then one RecipeFix line over the dish photo.
 *
 * Zones (1080×1920, all text inside SAFE x 120–900, y 270–1250):
 *   270–330  kicker row        360–960  the beat's visual
 *   990–1130 captions          1160–1240 source lower third
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, SAFE, clamp } from './kit.js';

export interface HistoryWord {
  text: string;
  at: number;
}

export interface HistoryBeat {
  kind: 'hook' | 'photo' | 'ledger' | 'quote' | 'place' | 'list' | 'versus' | 'stamp';
  start: number;
  end: number;
  screen?: string;
  chip?: string;
  title?: string;
  rows?: Array<{ label: string; value: string; at: number }>;
  quote?: string;
  /** Frame each word of the quote is spoken (typed-in in sync); empty when not spoken. */
  quoteWords?: number[];
  place?: string;
  sub?: string;
  items?: Array<{ text: string; at: number }>;
  left?: string;
  right?: string;
  rightAt?: number;
  arrow?: boolean;
  stamp?: string;
  stampAt?: number;
}

export interface HistoryCue {
  start: number;
  end: number;
  words: HistoryWord[];
}

export interface HistoryShortProps {
  kicker: string;
  year: number;
  fromYear: number;
  /** 16:9 crop for the print inside the page. */
  photo: string;
  /** 9:16 crop for the full-bleed close. */
  closePhoto: string;
  focus: string;
  beats: HistoryBeat[];
  cues: HistoryCue[];
  source: string;
  /** `words`: the frame each word of the tie is said, so the line inks in with the voice. */
  close: { start: number; tie: string; words?: number[] };
  /** One take, cut at `splitAt` (timeline frame) and resumed `pause` frames later for the close. */
  audio: { file: string; at: number; splitAt: number; pause: number; rate?: number } | null;
  sfx: { whoosh: string; stamp: string; tick: string } | null;
  [key: string]: unknown;
}

const PAPER = '#EFE5CF';
const INK = '#221A14';
const RED = '#A8322A';
/** Darker red for small type on paper (AA at 30 px). */
const RED_TEXT = '#8E2620';
const W = SAFE.x1 - SAFE.x0;
/** A beat lifts out over this many frames AFTER its end, while the next one rises in: never a blank page. */
const EXIT = 7;
const CX = (SAFE.x0 + SAFE.x1) / 2;

const useSpr = (at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 14, stiffness: 140, mass: 0.9, ...cfg } });
};

/**
 * Aged paper: the texture is drawn once per run (SVG noise rasterised by the
 * format builder into paper.png and grain.png) and it does NOT move. A grain
 * that jumped every other frame made every frame new noise: 95 MB for 40 s at
 * CRF 17. The page holds still; everything on it moves.
 */
const Paper: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Img src={staticFile('paper.png')} style={{ position: 'absolute', inset: 0, width: 1080, height: 1920 }} />
    <AbsoluteFill style={{ backgroundImage: `url(${staticFile('grain.png')})`, backgroundSize: '256px 256px', opacity: 0.4, mixBlendMode: 'multiply' }} />
  </AbsoluteFill>
);

/** Entrance and exit for a beat's visual: rises in on a spring, lifts out over its last frames. */
const useBeatMotion = (b: HistoryBeat) => {
  const f = useCurrentFrame();
  const s = useSpr(b.start, { damping: 15 });
  const out = interpolate(f, [b.end - 2, b.end + EXIT], [0, 1], clamp);
  return { opacity: Math.min(1, s) * (1 - out), transform: `translateY(${(1 - s) * 90 - out * 80}px)` };
};

const Hook: React.FC<{ b: HistoryBeat; year: number }> = ({ b, year }) => {
  const f = useCurrentFrame();
  const out = interpolate(f, [b.end - 2, b.end + EXIT], [0, 1], clamp);
  const line = interpolate(f, [8, 30], [0, 1], clamp);
  // The headline is the cover: readable from frame 0. The push stays inside the safe box (40 px margin).
  const push = interpolate(f, [b.start, b.end], [1, 1.04], clamp);
  return (
    <div style={{ position: 'absolute', left: SAFE.x0 + 30, top: 400, width: W - 60, opacity: 1 - out, transform: `scale(${push}) translateY(${-out * 80}px)`, transformOrigin: '50% 30%' }}>
      {/* Round-2 reviews (2026-10-27): the rolling odometer made the cover a broken half-number. The year is
          whole from frame 0 and lands with a punch-in instead; */}
      <div style={{ height: 392, lineHeight: '392px', textAlign: 'center', fontFamily: 'Instrument Serif', fontSize: 400, color: RED, textShadow: '0 3px 0 rgba(90,40,20,0.18)', transform: `scale(${interpolate(f, [0, 12], [1.1, 1], clamp)})` }}>{year}</div>
      <div style={{ margin: '10px auto 0', height: 6, width: 560 * line, background: INK }} />
      <div style={{ marginTop: 40, textAlign: 'center', fontFamily: 'Instrument Serif', fontSize: 92, lineHeight: 1.03, color: INK, textShadow: '0 4px 18px rgba(70,45,20,0.18)' }}>{b.screen}</div>
    </div>
  );
};

const PhotoPrint: React.FC<{ b: HistoryBeat; photo: string; focus: string }> = ({ b, photo, focus }) => {
  const f = useCurrentFrame();
  const m = useBeatMotion(b);
  const z = interpolate(f, [b.start, b.end], [1.06, 1.22], clamp);
  const dx = interpolate(f, [b.start, b.end], [18, -18], clamp);
  const sepia = interpolate(f, [b.start + 6, b.start + 36], [1, 0.15], clamp);
  const chip = useSpr(b.start + 12, { damping: 11, stiffness: 200 });
  return (
    <div style={{ position: 'absolute', left: 140, top: 380, width: 760, height: 620, ...m }}>
      <div style={{ width: '100%', height: '100%', background: '#FBF7EE', padding: 18, boxSizing: 'border-box', boxShadow: '0 18px 40px rgba(60,35,15,0.35)', transform: 'rotate(-1.6deg)' }}>
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <Img src={staticFile(photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus, transform: `scale(${z}) translateX(${dx}px)`, filter: `sepia(${sepia}) contrast(1.05)` }} />
        </div>
      </div>
      {b.chip ? (
        <div style={{ position: 'absolute', left: 26, bottom: -26, transform: `rotate(-3deg) scale(${chip})`, transformOrigin: '0% 50%', background: '#F3E3B5', padding: '12px 26px', boxShadow: '0 6px 14px rgba(60,35,15,0.25)', fontFamily: 'Inter', fontWeight: 600, fontSize: 40, color: INK, whiteSpace: 'nowrap' }}>
          {b.chip}
        </div>
      ) : null}
    </div>
  );
};

const Ledger: React.FC<{ b: HistoryBeat }> = ({ b }) => {
  const f = useCurrentFrame();
  const m = useBeatMotion(b);
  return (
    <div style={{ position: 'absolute', left: SAFE.x0 + 10, top: 440, width: W - 20, ...m }}>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 38, letterSpacing: 5, textTransform: 'uppercase', color: RED_TEXT, textAlign: 'center' }}>{b.title}</div>
      <div style={{ marginTop: 26, height: 4, background: INK }} />
      {(b.rows ?? []).map((r, i) => {
        const k = spring({ frame: f - r.at, fps: 30, config: { damping: 12, stiffness: 190 } });
        const rule = interpolate(f, [r.at, r.at + 14], [0, 1], clamp);
        return (
          <div key={i} style={{ position: 'relative', height: 210, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
            <span style={{ fontFamily: 'Instrument Serif', fontSize: 120, color: INK, opacity: Math.min(1, k), transform: `translateX(${(1 - k) * -40}px)` }}>{r.label}</span>
            <span style={{ fontFamily: 'Instrument Serif', fontSize: 140, color: RED, opacity: Math.min(1, k), transform: `scale(${interpolate(k, [0, 1], [1.8, 1])})` }}>{r.value}</span>
            <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${rule * 100}%`, background: 'rgba(34,26,20,0.45)' }} />
          </div>
        );
      })}
    </div>
  );
};

/** A typed archival card; each word inks in as it is said (or types on, when it is shown and not said). */
const QuoteCard: React.FC<{ b: HistoryBeat; small?: boolean }> = ({ b, small }) => {
  const f = useCurrentFrame();
  const words = (b.quote ?? '').split(/\s+/);
  const times = b.quoteWords?.length === words.length ? b.quoteWords : words.map((_, i) => b.start + 8 + i * 4);
  const ql = (b.quote ?? '').length;
  const size = small ? (ql > 44 ? 72 : 88) : ql > 44 ? 88 : ql > 32 ? 112 : 120;
  return (
    <div style={{ background: '#FFFDF8', borderRadius: 18, padding: small ? '30px 40px 40px' : '40px 44px 52px', boxSizing: 'border-box', boxShadow: '0 18px 44px rgba(70,45,20,0.20)', transform: 'rotate(0.6deg)' }}>
      <div style={{ fontFamily: 'Instrument Serif', fontSize: small ? 150 : 190, lineHeight: 0.6, height: small ? 60 : 80, color: RED }}>“</div>
      <div style={{ fontFamily: 'Instrument Serif', fontSize: size, lineHeight: 1.1, color: INK }}>
        {words.map((w, i) => {
          const on = interpolate(f, [times[i]! - 2, times[i]! + 3], [0, 1], clamp);
          return (
            <span key={i} style={{ opacity: 0.12 + on * 0.88 }}>
              {w}{' '}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Quote: React.FC<{ b: HistoryBeat }> = ({ b }) => {
  const m = useBeatMotion(b);
  return (
    <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 410, width: W - 12, ...m }}>
      <QuoteCard b={b} />
    </div>
  );
};

const Place: React.FC<{ b: HistoryBeat }> = ({ b }) => {
  const f = useCurrentFrame();
  const m = useBeatMotion(b);
  const drop = useSpr(b.start + 4, { damping: 9, stiffness: 170 });
  const name = useSpr(b.start + 12, { damping: 14 });
  const size = (b.place ?? '').length > 9 ? 150 : 190;
  return (
    <div style={{ position: 'absolute', left: SAFE.x0, top: 400, width: W, textAlign: 'center', ...m }}>
      <div style={{ position: 'relative', height: 330 }}>
        {[0, 1, 2].map((i) => {
          const t = ((f - b.start - i * 14) % 42) / 42;
          const live = f - b.start - i * 14 >= 0;
          return live ? (
            <div key={i} style={{ position: 'absolute', left: CX - SAFE.x0 - 60 - t * 110, top: 236 - t * 40, width: 120 + t * 220, height: 44 + t * 80, borderRadius: '50%', border: `4px solid ${RED}`, opacity: (1 - t) * 0.7 }} />
          ) : null;
        })}
        <div
          style={{
            position: 'absolute',
            left: CX - SAFE.x0 - 70,
            top: 40 + (1 - drop) * -260,
            width: 140,
            height: 140,
            background: RED,
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(-45deg)',
            boxShadow: '0 10px 0 rgba(34,26,20,0.3)',
          }}
        >
          <div style={{ position: 'absolute', left: 42, top: 42, width: 56, height: 56, borderRadius: 28, background: PAPER }} />
        </div>
      </div>
      <div style={{ fontFamily: 'Instrument Serif', fontSize: size, lineHeight: 1, color: INK, opacity: Math.min(1, name), transform: `translateY(${(1 - name) * 40}px)` }}>{b.place}</div>
      <div style={{ marginTop: 24, fontFamily: 'Inter', fontWeight: 600, fontSize: 40, letterSpacing: 4, textTransform: 'uppercase', color: RED_TEXT, opacity: Math.min(1, name) }}>{b.sub}</div>
    </div>
  );
};

const ListBeat: React.FC<{ b: HistoryBeat }> = ({ b }) => {
  const f = useCurrentFrame();
  const m = useBeatMotion(b);
  const head = useSpr(b.start + 4, { damping: 14 });
  return (
    <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 400, width: W - 12, ...m }}>
      {b.title ? (
        <div style={{ fontFamily: 'Instrument Serif', fontSize: b.title.length > 20 ? 64 : 80, lineHeight: 1.02, color: INK, textAlign: 'center', margin: '0 30px 28px', opacity: Math.min(1, head), transform: `translateY(${(1 - head) * 30}px)` }}>{b.title}</div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        {(b.items ?? []).map((it, i) => {
          const k = spring({ frame: f - it.at, fps: 30, config: { damping: 10, stiffness: 210 } });
          const slot = interpolate(f, [b.start + 6 + i * 3, b.start + 14 + i * 3], [0, 1], clamp);
          return (
            <div key={i} style={{ position: 'relative', height: 150 }}>
              {/* The empty slot is drawn first, so the page is never blank while the list is read. */}
              <div style={{ position: 'absolute', inset: 0, border: `4px dashed rgba(34,26,20,0.35)`, opacity: slot }} />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 16,
                  background: '#FFFDF8',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  fontSize: it.text.length > 11 ? 44 : 54,
                  color: INK,
                  opacity: f < it.at - 1 ? 0.0 : Math.min(1, k),
                  transform: `scale(${interpolate(k, [0, 1], [1.6, 1])}) rotate(${(i % 2 ? 1 : -1) * 1.5}deg)`,
                  boxShadow: '0 12px 28px rgba(70,45,20,0.18)',
                }}
              >
                {it.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Versus: React.FC<{ b: HistoryBeat }> = ({ b }) => {
  const f = useCurrentFrame();
  const m = useBeatMotion(b);
  const l = useSpr(b.start + 4, { damping: 13 });
  // The right-hand name lands when it is said, but never later than 1.3 s in: the page is never one word for long.
  const rightAt = Math.min(b.rightAt ?? b.start + 20, b.start + 40);
  const r = useSpr(rightAt, { damping: 11, stiffness: 180 });
  const mid = useSpr(rightAt - 8, { damping: 9, stiffness: 220 });
  const size = (s: string) => (s.length > 11 ? 112 : 140);
  const arrowLen = interpolate(f, [b.start + 6, b.start + 30], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: SAFE.x0, top: 410, width: W, height: 600, ...m }}>
      <div style={{ position: 'absolute', left: 40, top: 0, fontFamily: 'Instrument Serif', fontSize: size(b.left ?? ''), lineHeight: 1, color: INK, opacity: Math.min(1, l), transform: `translateX(${(1 - l) * -80}px)` }}>{b.left}</div>
      {b.arrow ? (
        <svg width={W} height={240} style={{ position: 'absolute', left: 0, top: 180 }}>
          <path d={`M 80 20 C 260 180, 520 180, ${W - 90} 60`} fill="none" stroke={RED} strokeWidth={8} strokeDasharray="22 16" pathLength={1000} strokeDashoffset={0} style={{ clipPath: `inset(0 ${(1 - arrowLen) * 100}% 0 0)` }} />
          <path d={`M ${W - 130} 40 L ${W - 84} 58 L ${W - 112} 100`} fill="none" stroke={RED} strokeWidth={8} opacity={arrowLen > 0.95 ? 1 : 0} />
        </svg>
      ) : (
        <div style={{ position: 'absolute', left: W / 2 - 90, top: 220, width: 180, height: 180, borderRadius: 80, background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Instrument Serif', fontSize: 92, color: PAPER, transform: `scale(${mid}) rotate(${interpolate(mid, [0, 1], [-30, -6])}deg)` }}>
          vs
        </div>
      )}
      <div style={{ position: 'absolute', right: 40, top: 440, fontFamily: 'Instrument Serif', fontSize: size(b.right ?? ''), lineHeight: 1, color: b.arrow ? RED : INK, textAlign: 'right', opacity: Math.min(1, r), transform: `translateX(${(1 - r) * 80}px)` }}>{b.right}</div>
    </div>
  );
};

const Stamp: React.FC<{ b: HistoryBeat; photo: string; focus: string; usePhoto: boolean }> = ({ b, photo, focus, usePhoto }) => {
  const f = useCurrentFrame();
  const at = b.stampAt ?? b.start + 20;
  const s = useSpr(at, { damping: 11, stiffness: 260, mass: 0.7 });
  const m = useBeatMotion(b);
  const text = (b.stamp ?? '').toUpperCase();
  const size = Math.min(180, Math.floor(680 / (text.length * 0.66)));
  const z = interpolate(f, [b.start, b.end], [1.04, 1.16], clamp);
  return (
    <div style={{ position: 'absolute', left: SAFE.x0, top: 380, width: W, height: 620, ...m }}>
      {b.quote ? (
        <div style={{ position: 'absolute', left: 6, top: 20, width: W - 12 }}>
          <QuoteCard b={b} small />
        </div>
      ) : null}
      {usePhoto && !b.quote ? (
        <div style={{ position: 'absolute', left: 20, top: 0, width: W - 40, height: 620, background: '#FBF7EE', padding: 16, boxSizing: 'border-box', transform: 'rotate(1.2deg)', boxShadow: '0 14px 30px rgba(60,35,15,0.3)' }}>
          <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            <Img src={staticFile(photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus, transform: `scale(${z})`, filter: 'sepia(0.85) contrast(1.05) brightness(1.05)', opacity: 0.55 }} />
          </div>
        </div>
      ) : null}
      {f >= at - 1 ? (
        <div style={{ position: 'absolute', left: 0, top: b.quote ? 420 : 0, width: W, height: b.quote ? 230 : 620, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              border: `8px solid ${RED}`,
              borderRadius: 10,
              padding: '14px 30px',
              fontFamily: 'Inter',
              fontWeight: 600,
              fontSize: size,
              letterSpacing: 4,
              lineHeight: 1,
              color: RED,
              background: 'rgba(248,241,225,0.82)',
              transform: `rotate(-5deg) scale(${interpolate(s, [0, 1], [2.4, 1])})`,
              opacity: Math.min(1, s * 1.6),
            }}
          >
            {text}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Word-by-word captions: one short line at a time, the whole phrase set in
 * place so it never reflows, each word inking in as it is said and the word
 * being said marked in red.
 */
const Captions: React.FC<{ cues: HistoryCue[]; until: number }> = ({ cues, until }) => {
  const f = useCurrentFrame();
  const i = cues.findIndex((c, j) => f >= c.start && f < Math.min(cues[j + 1]?.start ?? c.end + 12, c.end + 12));
  const cue = cues[i];
  if (!cue || f >= until) return null;
  const len = cue.words.map((w) => w.text).join(' ').length;
  const size = len > 16 ? 66 : 76;
  const pop = spring({ frame: f - cue.start, fps: 30, config: { damping: 13, stiffness: 260 } });
  return (
    <div style={{ position: 'absolute', left: SAFE.x0 + 10, top: 1046, width: W - 20, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', whiteSpace: 'nowrap', transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})` }}>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: size, lineHeight: 1.2, color: INK }}>
        {cue.words.map((w, k) => {
          const next = cue.words[k + 1]?.at ?? cue.end;
          const said = f >= w.at;
          const now = said && f < next;
          return (
            <React.Fragment key={k}>
              <span style={{ display: 'inline-block', opacity: said ? 1 : 0.28, background: now ? RED : 'transparent', color: now ? '#FFF8EC' : INK, borderRadius: 12, padding: '0 10px', margin: '0 -4px', transform: now ? 'translateY(-3px)' : undefined }}>{w.text}</span>{' '}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/** Under the platform's own caption: the year again, huge and faint, drifting. Decoration only, outside the safe box. */
const Watermark: React.FC<{ year: number }> = ({ year }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: -60 - Math.floor(f / 4), top: 1300, fontFamily: 'Instrument Serif', fontSize: 560, lineHeight: 1, color: 'rgba(140,60,35,0.075)', whiteSpace: 'nowrap' }}>
      {year} {year}
    </div>
  );
};

const SourceBar: React.FC<{ at: number; until: number; text: string }> = ({ at, until, text }) => {
  const f = useCurrentFrame();
  const k = useSpr(at, { damping: 16 });
  if (f < at || f >= until) return null;
  // Fits the bar on one line, never clipped: Inter 600 is ~0.55 em per character.
  const size = Math.min(30, Math.floor(600 / (text.length * 0.55)));
  return (
    <div style={{ position: 'absolute', left: SAFE.x0, top: 1168, width: W, height: 76, display: 'flex', alignItems: 'center', transform: `translateX(${(1 - k) * -820}px)` }}>
      <div style={{ height: 76, background: RED, color: '#FFF8EC', display: 'flex', alignItems: 'center', padding: '0 18px', fontFamily: 'Inter', fontWeight: 600, fontSize: 24, letterSpacing: 3 }}>SOURCE</div>
      <div style={{ height: 76, flex: 1, background: INK, color: '#FFF8EC', display: 'flex', alignItems: 'center', padding: '0 20px', fontFamily: 'Inter', fontWeight: 600, fontSize: size, whiteSpace: 'nowrap', overflow: 'hidden' }}>{text}</div>
    </div>
  );
};

const Kicker: React.FC<{ text: string; year: number }> = ({ text, year }) => (
  <div style={{ position: 'absolute', left: SAFE.x0, top: 282, width: W, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 34, letterSpacing: 6, textTransform: 'uppercase', color: INK }}>
      {text} <span style={{ color: RED_TEXT }}>· {year}</span>
    </div>
    <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 56, height: 56, borderRadius: 13 }} />
  </div>
);

const Close: React.FC<{ start: number; tie: string; words?: number[]; photo: string; focus: string; source: string }> = ({ start, tie, words, photo, focus, source }) => {
  const f = useCurrentFrame();
  const wipe = interpolate(f, [start, start + 14], [0, 100], clamp);
  const z = interpolate(f, [start, start + 200], [1.08, 1.24], clamp);
  const col = interpolate(f, [start + 4, start + 34], [1, 0], clamp);
  const t = useSpr(start + 10, { damping: 15 });
  const b = useSpr(start + 26, { damping: 13 });
  return (
    <AbsoluteFill style={{ clipPath: `inset(${100 - wipe}% 0 0 0)` }}>
      <AbsoluteFill style={{ overflow: 'hidden', background: INK }}>
        <Img src={staticFile(photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus, transform: `scale(${z})`, filter: `sepia(${col})` }} />
        <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(24,16,10,0.88) 0%, rgba(24,16,10,0.82) 45%, rgba(24,16,10,0.55) 70%, rgba(24,16,10,0.75) 100%)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: SAFE.x0 + 16, top: 400, width: W - 32, fontFamily: 'Instrument Serif', fontSize: tie.length > 95 ? 80 : 88, lineHeight: 1.08, color: '#FFF8EC', opacity: Math.min(1, t), transform: `translateY(${(1 - t) * 40}px)` }}>
        {tie.split(/\s+/).map((w, i, all) => {
          const at = words?.length === all.length ? words[i]! : start + 10;
          const k = interpolate(f, [at - 2, at + 4], [0.3, 1], clamp);
          // RecipeFix's own name is set in the brand peach as it is said.
          const brand = /^RecipeFix/.test(w) && f >= at;
          return (
            <span key={i} style={{ opacity: k, color: brand ? '#F2C9B4' : undefined }}>
              {w}{' '}
            </span>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + 16, top: 900, display: 'flex', alignItems: 'center', gap: 22, opacity: Math.min(1, b), transform: `translateY(${(1 - b) * 30}px)` }}>
        <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 92, height: 92, borderRadius: 20 }} />
        <div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 52, color: '#FFFFFF' }}>RecipeFix</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 38, color: '#F2C9B4' }}>recipefix.app</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + 16, top: 1170, width: W - 32, whiteSpace: 'nowrap', fontFamily: 'Inter', fontWeight: 600, fontSize: Math.min(28, Math.floor(740 / ((source.length + 8) * 0.55))), color: 'rgba(255,248,236,0.9)', opacity: Math.min(1, b) }}>{`Source: ${source}`}</div>
    </AbsoluteFill>
  );
};

export const HistoryShort: React.FC<HistoryShortProps> = (p) => {
  const f = useCurrentFrame();
  const stamp = p.beats.find((b) => b.kind === 'stamp');
  // A page-wide push and a tiny shake when the stamp lands: the camera is never still.
  const push = interpolate(f, [0, p.close.start], [1, 1.035], clamp);
  const shakeT = stamp?.stampAt !== undefined ? f - stamp.stampAt : -1;
  const shake = shakeT >= 0 && shakeT < 9 ? Math.sin(shakeT * 3.1) * 9 * (1 - shakeT / 9) : 0;
  const photoBeats = p.beats.some((b) => b.kind === 'photo');
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <style>{FONTS}</style>
      <Paper />
      <Watermark year={p.year} />
      <AbsoluteFill style={{ transform: `scale(${push}) translate(${shake}px, ${shake * 0.6}px)` }}>
        <Kicker text={p.kicker} year={p.year} />
        {p.beats.map((b, i) =>
          f >= b.start && f < b.end + EXIT ? (
            <React.Fragment key={i}>
              {b.kind === 'hook' ? <Hook b={b} year={p.year} /> : null}
              {b.kind === 'photo' ? <PhotoPrint b={b} photo={p.photo} focus={p.focus} /> : null}
              {b.kind === 'ledger' ? <Ledger b={b} /> : null}
              {b.kind === 'quote' ? <Quote b={b} /> : null}
              {b.kind === 'place' ? <Place b={b} /> : null}
              {b.kind === 'list' ? <ListBeat b={b} /> : null}
              {b.kind === 'versus' ? <Versus b={b} /> : null}
              {b.kind === 'stamp' ? <Stamp b={b} photo={p.photo} focus={p.focus} usePhoto={photoBeats} /> : null}
            </React.Fragment>
          ) : null,
        )}
        <Captions cues={p.cues} until={p.close.start} />
        {stamp ? <SourceBar at={stamp.start + 12} until={p.close.start} text={p.source} /> : null}
      </AbsoluteFill>
      {f >= p.close.start ? <Close start={p.close.start} tie={p.close.tie} words={p.close.words} photo={p.closePhoto} focus={p.focus} source={p.source} /> : null}
      {p.audio ? (
        <>
          <Sequence from={p.audio.at} durationInFrames={p.audio.splitAt - p.audio.at} layout="none">
            <Audio src={staticFile(p.audio.file)} playbackRate={p.audio.rate ?? 1} />
          </Sequence>
          <Sequence from={p.audio.splitAt + p.audio.pause} layout="none">
            <Audio src={staticFile(p.audio.file)} startFrom={p.audio.splitAt - p.audio.at} />
          </Sequence>
        </>
      ) : null}
      {p.sfx
        ? p.beats.slice(1).map((b, i) => (
            <Sequence key={`w${i}`} from={Math.max(0, b.start - 4)} durationInFrames={14} layout="none">
              <Audio src={staticFile(p.sfx!.whoosh)} volume={0.32} />
            </Sequence>
          ))
        : null}
      {p.sfx && stamp?.stampAt !== undefined ? (
        <Sequence from={stamp.stampAt} durationInFrames={20} layout="none">
          <Audio src={staticFile(p.sfx.stamp)} volume={0.9} />
        </Sequence>
      ) : null}
      {p.sfx
        ? [0, 1, 2, 3].map((i) => (
            <Sequence key={`t${i}`} from={8 + i * 5} durationInFrames={6} layout="none">
              <Audio src={staticFile(p.sfx!.tick)} volume={0.35} />
            </Sequence>
          ))
        : null}
      {p.sfx ? (
        <Sequence from={Math.max(0, p.close.start - 4)} durationInFrames={14} layout="none">
          <Audio src={staticFile(p.sfx.whoosh)} volume={0.4} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
