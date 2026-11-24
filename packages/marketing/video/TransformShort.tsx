/**
 * TransformShort: "Recipe Fixed #N", a real RecipeFix result shown as a
 * marked-up recipe. Built for P3 (PLAYBOOK.md §8): the bridge between food
 * content and the product, because the interesting part (the STEP that
 * changes) can only exist because of RecipeFix.
 *
 * Same family as QuizShort (bold warm grounds, Lilita One outlined display
 * type, white cards with ink borders and hard shadows, the RecipeFix mark in
 * the corner), its own grammar: a copy editor's red pen.
 *   hook    the dish + the constraint on frame 1, over the Original's photo
 *   swaps   the original line struck through in red, the new line typed in,
 *           the result's own reason under it; one swap per card, pushed in
 *   step    the step as written vs as fixed: removed words struck, added
 *           words swept with a highlighter, the unchanged number ringed green
 *   result  the photo, the result's name, servings 4 → 6
 *   close   a save-worthy cheat sheet, then RecipeFix as one small line
 *
 * Every word sits in SAFE (TikTok ∩ Reels). Browser-bundled: nothing Node-only.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, SAFE, clamp } from './kit.js';

type SegKind = 'same' | 'del' | 'ins' | 'keep' | 'gap';
interface Seg {
  text: string;
  kind: SegKind;
}

export interface TransformShortProps {
  series: string;
  hook: { title: string; question: string; options: string[]; answer: number; servings: { from: number; to: number } | null; photo: string; end: number };
  swaps: { rows: Array<{ from: string; to: string; why: string }>; rowAt: number[]; start: number; end: number };
  step: { title: string; before: Seg[]; after: Seg[]; why: string; takeaway: string; beforeHead: string; answer: string | null; start: number; end: number; beforeIn: number; strike: number; afterIn: number; sweep: number; keepAt: number; whyAt: number };
  result: { name: string; servings: { from: number; to: number } | null; photo: string; photoLabel: string; start: number; end: number };
  close: { start: number; save: string; swaps: Array<[string, string]>; tips: string[]; tie: string; note: string };
  sfx: { whoosh: string; reveal: string; scribble: string; swipe: string } | null;
  audio: { hook: string; swaps: string; step: string; result: string; close: string } | null;
  [key: string]: unknown;
}

const INK = '#1B1410';
const GREEN = '#1E9E57';
const GREEN_DARK = '#0E6534';
const RED = '#E0483E';
const YELLOW = '#FFD84D';
const MUTED = '#6E645D';
const G = { hook: '#E07A3F', swaps: '#2A9D8F', step: '#C8553D', close: '#5B8E3E' };
const W = SAFE.x1 - SAFE.x0;
const CX = (SAFE.x0 + SAFE.x1) / 2;
const PUSH = 7;

const useSpring = (at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 12, stiffness: 180, mass: 0.9, ...cfg } });
};

const display = (size: number, color = '#FFFFFF'): React.CSSProperties => ({
  fontFamily: 'Lilita One',
  fontSize: size,
  lineHeight: 1.06,
  color,
  WebkitTextStroke: `${Math.max(3, size * 0.07)}px ${INK}`,
  paintOrder: 'stroke fill',
  textShadow: `0 ${size * 0.07}px 0 rgba(0,0,0,0.28)`,
  letterSpacing: 0.5,
});

const card = (bg = '#FFFFFF', border = INK): React.CSSProperties => ({
  background: bg,
  borderRadius: 28,
  border: `5px solid ${border}`,
  boxShadow: `0 8px 0 ${INK}`,
  boxSizing: 'border-box',
});

/** Solid ground with a soft light from above. */
const Ground: React.FC<{ color: string }> = ({ color }) => {
  return (
    <AbsoluteFill
      style={{
        background: color,
        backgroundImage: 'radial-gradient(ellipse at 50% 32%, rgba(255,255,255,0.12), rgba(0,0,0,0.20) 88%)',
      }}
    />
  );
};

/** The dish itself, blurred and tinted, as the ground: food behind the words, not a template stripe. */
const PhotoBed: React.FC<{ src: string; tint: string; from: number; pos?: string }> = ({ src, tint, from, pos = '50% 50%' }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: INK }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, filter: 'blur(5px) saturate(1.2) brightness(1.05)', transform: `scale(${interpolate(f, [from, from + 200], [1.15, 1.26], clamp)})` }} />
      <AbsoluteFill style={{ background: tint }} />
    </AbsoluteFill>
  );
};

const Label: React.FC<{ children: React.ReactNode; bg: string; color?: string }> = ({ children, bg, color = '#FFFFFF' }) => (
  <span style={{ display: 'inline-block', background: bg, color, fontFamily: 'Inter', fontWeight: 600, fontSize: 26, letterSpacing: 2.2, textTransform: 'uppercase', padding: '7px 16px 6px', borderRadius: 12, border: `3px solid ${INK}` }}>{children}</span>
);

/** Series banner + optional counter + the RecipeFix mark (the channel's corner logo). */
const TopBar: React.FC<{ text: string; at: number; counter?: string; tilt?: number }> = ({ text, at, counter, tilt = -1.5 }) => {
  const s = useSpring(at, { damping: 14 });
  return (
    <div style={{ position: 'absolute', left: SAFE.x0, top: SAFE.y0 + 6, width: W, height: 92, display: 'flex', alignItems: 'center', gap: 14 }}>
      {counter ? (
        <div style={{ width: 92, height: 82, flex: '0 0 92px', borderRadius: 41, background: RED, border: '5px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(38), transform: `scale(${s})` }}>{counter}</div>
      ) : null}
      <div style={{ flex: 1, height: 82, borderRadius: 22, background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 7px 0 ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${tilt}deg) scale(${interpolate(s, [0, 1], [0.6, 1])})` }}>
        <span style={{ fontFamily: 'Lilita One', fontSize: text.length > 18 ? 38 : 44, color: INK, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>
      </div>
      <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 82, height: 82, borderRadius: 20, border: '5px solid #FFFFFF', boxShadow: `0 7px 0 ${INK}`, transform: `scale(${s})` }} />
    </div>
  );
};

/** A red marker line drawn through each word in turn. */
const Struck: React.FC<{ text: string; at: number; len: number; color?: string }> = ({ text, at, len, color = RED }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => {
        const p = interpolate(f, [at + (i * len) / words.length, at + ((i + 1) * len) / words.length], [0, 1], clamp);
        return (
          <React.Fragment key={i}>
            <span style={{ position: 'relative', opacity: interpolate(p, [0, 1], [1, 0.86]) }}>
              {w}
              <span style={{ position: 'absolute', left: -4, top: '50%', height: 7, width: `calc(${p * 100}% + ${p * 8}px)`, background: color, borderRadius: 4, transform: 'rotate(-3deg)' }} />
            </span>
            {i < words.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** A highlighter swept left to right across a run of words. */
const Swept: React.FC<{ text: string; at: number; len: number }> = ({ text, at, len }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => {
        const p = interpolate(f, [at + (i * len) / words.length, at + ((i + 1) * len) / words.length], [0, 1], clamp);
        return (
          <span
            key={i}
            style={{
              backgroundImage: `linear-gradient(${YELLOW}, ${YELLOW})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${p * 100}% 86%`,
              backgroundPosition: 'left 60%',
              borderRadius: 4,
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              color: INK,
            }}
          >
            {i < words.length - 1 ? `${w} ` : w}
          </span>
        );
      })}
    </>
  );
};

/** The number that did NOT change, ringed green. */
const Kept: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const k = useSpring(at, { damping: 9, stiffness: 220 });
  const on = Math.min(1, Math.max(0, k));
  return (
    <span
      style={{
        borderRadius: 10,
        padding: '0 2px',
        boxShadow: `0 0 0 ${4.5 * on}px ${GREEN}`,
        background: `rgba(30,158,87,${0.16 * on})`,
        color: on > 0.3 ? GREEN_DARK : 'inherit',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }}
    >
      {text}
    </span>
  );
};

/** One excerpt of a step, its diff marked up. `kind` decides which marks this side shows. */
const Marked: React.FC<{ segs: Seg[]; side: 'before' | 'after'; strikeAt: number; sweepAt: number; keepAt: number }> = ({ segs, side, strikeAt, sweepAt, keepAt }) => {
  let del = 0;
  let ins = 0;
  return (
    <>
      {segs.map((s, i) => {
        const sp = i > 0 && !/^[,.;:]/.test(s.text) ? ' ' : '';
        let body: React.ReactNode = s.text;
        if (s.kind === 'gap') body = <span style={{ color: MUTED }}>{s.text}</span>;
        else if (s.kind === 'keep') body = <Kept text={s.text} at={keepAt} />;
        else if (s.kind === 'del' && side === 'before') body = <Struck text={s.text} at={strikeAt + del++ * 8} len={8} />;
        else if (s.kind === 'ins' && side === 'after') body = <Swept text={s.text} at={sweepAt + ins++ * 12} len={10} />;
        return (
          <React.Fragment key={i}>
            {sp}
            {body}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** A beat pushed in from the right over the previous one. */
const Push: React.FC<{ at: number; children: React.ReactNode; first?: boolean }> = ({ at, children, first }) => {
  const f = useCurrentFrame();
  const x = first ? 0 : interpolate(f, [at, at + PUSH], [1080, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <AbsoluteFill style={{ transform: `translateX(${x}px)`, boxShadow: x > 0 ? '-24px 0 40px rgba(0,0,0,0.35)' : undefined }}>{children}</AbsoluteFill>;
};

// ── Beats ───────────────────────────────────────────────────────────────────

/**
 * The hook is an open loop: the dish, the constraint and a question whose
 * answer is the changed step. The swaps play first ("the easy part"), the
 * step beat is the reveal. Frame 1 holds all of it (it is the cover).
 */
const Hook: React.FC<{ p: TransformShortProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const h = p.hook;
  const bob = Math.sin(f / 9) * 3;
  const nudge = (i: number) => spring({ frame: f - 14 - i * 6, fps, config: { damping: 9, stiffness: 260 } });
  return (
    <>
      <Ground color={G.hook} />
      <div style={{ position: 'absolute', left: CX - 440, top: 1130, width: 880, height: 560, transform: 'rotate(1.5deg)' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', border: '10px solid #FFFFFF', boxShadow: `0 10px 0 ${INK}`, boxSizing: 'border-box' }}>
          <Img src={staticFile(h.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 35%', transform: `scale(${interpolate(f, [0, h.end], [1.02, 1.12], clamp)})` }} />
        </div>
      </div>
      <TopBar text={p.series} at={-30} />
      <div style={{ position: 'absolute', left: SAFE.x0, top: 384, width: W, textAlign: 'center', ...display(88), transform: `translateY(${bob}px)` }}>{h.title}</div>
      {h.servings ? (
        <div style={{ position: 'absolute', left: SAFE.x0, top: 588, width: W, display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...card(YELLOW), borderRadius: 999, padding: '4px 28px 6px', fontFamily: 'Lilita One', fontSize: 46, color: INK, transform: 'rotate(-2deg)' }}>{`${h.servings.from} → ${h.servings.to} servings`}</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 690, width: W - 12, ...card('#FFFFFF'), padding: '14px 24px 16px', textAlign: 'center', fontFamily: 'Lilita One', fontSize: 50, lineHeight: 1.1, color: INK }}>{h.question}</div>
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 880, width: W - 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {h.options.map((o, i) => (
          <div key={i} style={{ ...card('#FFFFFF'), height: 96, display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px', transform: `scale(${1 + Math.max(0, 1 - nudge(i)) * 0.05})` }}>
            <div style={{ width: 62, height: 62, flex: '0 0 62px', borderRadius: 31, background: i === 0 ? RED : '#3B7DD8', border: `4px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Lilita One', fontSize: 38, color: '#FFFFFF' }}>{'AB'[i]}</div>
            <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 46, color: INK, whiteSpace: 'nowrap' }}>{o}</div>
          </div>
        ))}
      </div>
    </>
  );
};

/** A recipe index card: ruled lines, a red margin, running off the bottom (image only below SAFE). */
const IndexCard: React.FC<{ top: number; children: React.ReactNode; tilt?: number }> = ({ top, children, tilt = -0.8 }) => {
  return (
    <div style={{ position: 'absolute', left: SAFE.x0 - 30, top, width: W + 60, height: 1920 - top + 80, transform: `rotate(${tilt}deg)`, ...card('#FFFDF7'), borderRadius: 30, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 63px, rgba(59,125,216,0.10) 63px 66px)', backgroundPosition: '0 40px' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 22, width: 4, background: 'rgba(224,72,62,0.45)' }} />
      <div style={{ position: 'relative', padding: '22px 48px 0 52px' }}>{children}</div>
    </div>
  );
};

const Swaps: React.FC<{ sw: TransformShortProps['swaps']; servingsTo: number | null; photo: string }> = ({ sw, servingsTo, photo }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <PhotoBed src={photo} tint="rgba(34,20,12,0.42)" from={sw.start} pos="50% 30%" />
      <TopBar text="First, the easy swaps" at={sw.start + 2} tilt={1.5} />
      <IndexCard top={392}>
        <Label bg={GREEN}>{servingsTo ? `Dairy-free · for ${servingsTo}` : 'Dairy-free'}</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {sw.rows.map((r, i) => {
            const at = sw.rowAt[i]!;
            const land = spring({ frame: f - at - 4, fps, config: { damping: 12, stiffness: 210 } });
            const why = interpolate(f, [at + 8, at + 14], [0, 1], clamp);
            return (
              <div key={i}>
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 36, lineHeight: 1.2, color: '#5A4F48' }}>
                  <Struck text={r.from} at={at} len={8} />
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'flex-start', opacity: Math.min(1, land * 1.5), transform: `translateX(${(1 - Math.min(1, land)) * 60}px)` }}>
                  <span style={{ fontFamily: 'Lilita One', fontSize: 46, lineHeight: 1.1, color: GREEN }}>→</span>
                  <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 46, lineHeight: 1.1, color: GREEN_DARK }}>{r.to}</span>
                </div>
                <div style={{ marginTop: 6, marginLeft: 52, fontFamily: 'Inter', fontWeight: 600, fontSize: 37, lineHeight: 1.18, color: '#4A403A', opacity: why }}>
                  <span style={{ fontWeight: 600, color: RED }}>why </span>
                  {r.why}
                </div>
              </div>
            );
          })}
        </div>
      </IndexCard>
    </>
  );
};

/**
 * The broiler change as a picture, under the safe box (no words): one crowded
 * sheet gets an X; two uncrowded sheets broil one at a time, the chicken
 * charring under the glow. `split` < 0 draws the finished state (the close).
 */
const CHUNK = ['#F2D2AE', '#B5652E'];
const mix = (a: string, b: string, t: number) => {
  const h = (x: string, i: number) => parseInt(x.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(h(a, i) + (h(b, i) - h(a, i)) * t)).join(',')})`;
};
const Pan: React.FC<{ x: number; y: number; w: number; h: number; n: number; cols: number; char: number; crowded?: boolean; seed: number }> = ({ x, y, w, h, n, cols, char, crowded, seed }) => {
  const rows = Math.ceil(n / cols);
  const cw = (w - 40) / cols;
  const ch = (h - 40) / rows;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={18} fill="#7D8890" stroke={INK} strokeWidth={6} />
      <rect x={x + 12} y={y + 12} width={w - 24} height={h - 24} rx={10} fill="#D9DEE2" />
      {Array.from({ length: n }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const jx = (((i * 37 + seed) % 11) - 5) * (crowded ? 1.6 : 0.8);
        const jy = (((i * 53 + seed) % 9) - 4) * (crowded ? 1.6 : 0.8);
        const sw = crowded ? cw * 1.05 : cw * 0.62;
        const sh = crowded ? ch * 1.0 : ch * 0.6;
        const cx = x + 20 + c * cw + (cw - sw) / 2 + jx;
        const cy = y + 20 + r * ch + (ch - sh) / 2 + jy;
        const rot = ((i * 29 + seed) % 40) - 20;
        return (
          <g key={i} transform={`rotate(${rot} ${cx + sw / 2} ${cy + sh / 2})`}>
            <rect x={cx} y={cy} width={sw} height={sh} rx={sh * 0.35} fill={mix(CHUNK[0]!, CHUNK[1]!, char)} stroke="rgba(27,20,16,0.55)" strokeWidth={2.5} />
            {char > 0.45 ? <circle cx={cx + sw * 0.3} cy={cy + sh * 0.4} r={Math.min(sw, sh) * 0.16 * Math.min(1, (char - 0.45) * 3)} fill="#3A2418" /> : null}
            {char > 0.65 ? <circle cx={cx + sw * 0.7} cy={cy + sh * 0.62} r={Math.min(sw, sh) * 0.12 * Math.min(1, (char - 0.65) * 4)} fill="#3A2418" /> : null}
          </g>
        );
      })}
    </g>
  );
};
const Broiler: React.FC<{ x: number; y: number; w: number; on: number }> = ({ x, y, w, on }) => {
  const f = useCurrentFrame();
  const flick = 0.85 + Math.sin(f / 2.3) * 0.15;
  return (
    <g opacity={on}>
      <rect x={x + 10} y={y} width={w - 20} height={16} rx={8} fill="#FF6A2B" stroke={INK} strokeWidth={4} />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M ${x + 40 + i * ((w - 80) / 6)} ${y + 22} q 8 14 0 28`} stroke="#FFB23F" strokeWidth={5} fill="none" strokeLinecap="round" opacity={flick * (0.5 + ((i + Math.floor(f / 4)) % 2) * 0.5)} />
      ))}
    </g>
  );
};
/** Diagram canvas: 1080×520 units, drawn at `scale` with its top-left at (left, top). */
const Pans: React.FC<{ split: number; pan1: number; pan2: number; len: number; left: number; top: number; scale: number }> = ({ split, pan1, pan2, len, left, top, scale }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const done = split < 0;
  const k = done ? 1 : spring({ frame: f - split, fps, config: { damping: 14, stiffness: 150 } });
  const xMark = done ? 1 : interpolate(f, [split + 4, split + 12], [0, 1], clamp);
  const c1 = done ? 1 : interpolate(f, [pan1, pan1 + len], [0, 1], clamp);
  const c2 = done ? 1 : interpolate(f, [pan2, pan2 + len], [0, 1], clamp);
  const on1 = done ? 0 : interpolate(f, [pan1 - 4, pan1, pan1 + len, pan1 + len + 6], [0, 1, 1, 0], clamp);
  const on2 = done ? 0 : interpolate(f, [pan2 - 4, pan2, pan2 + len, pan2 + len + 6], [0, 1, 1, 0], clamp);
  // One crowded sheet: centred until the fix, then moved aside and crossed out.
  // Big while it is the whole story ("as written"), then small beside the fix.
  const cx = interpolate(k, [0, 1], [270, 15]);
  const cy = interpolate(k, [0, 1], [70, 150]);
  const cw = interpolate(k, [0, 1], [540, 310]);
  const chh = interpolate(k, [0, 1], [350, 200]);
  const PW = 300;
  const PH = 190;
  return (
    <svg width={1080 * scale} height={520 * scale} viewBox="0 0 1080 520" style={{ position: 'absolute', left, top, overflow: 'visible' }}>
      <g opacity={done ? 0 : 1}>
        <Pan x={cx} y={cy} w={cw} h={chh} n={18} cols={6} char={0.12} crowded seed={7} />
        <g opacity={xMark} transform={`translate(${cx + cw / 2} ${cy + chh / 2}) scale(${0.6 + xMark * 0.4})`}>
          <path d="M -80 -80 L 80 80 M 80 -80 L -80 80" stroke={RED} strokeWidth={24} strokeLinecap="round" />
        </g>
        <path d="M 345 250 L 400 250 M 382 232 L 402 250 L 382 268" stroke="#FFFFFF" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={k} />
      </g>
      <g opacity={k} transform={done ? 'translate(-205 0)' : `translate(${(1 - k) * 260} 0)`}>
        <Broiler x={430} y={100} w={PW} on={on1} />
        <Pan x={430} y={160} w={PW} h={PH} n={9} cols={5} char={c1} seed={3} />
        <Broiler x={760} y={100} w={PW} on={on2} />
        <Pan x={760} y={160} w={PW} h={PH} n={9} cols={5} char={c2} seed={11} />
        <circle cx={580} cy={392} r={24} fill={c1 >= 1 ? GREEN : '#FFFFFF'} stroke={INK} strokeWidth={5} />
        <circle cx={910} cy={392} r={24} fill={c2 >= 1 ? GREEN : '#FFFFFF'} stroke={INK} strokeWidth={5} />
        {c1 >= 1 ? <path d="M 569 392 l 8 8 l 15 -16" stroke="#FFFFFF" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {c2 >= 1 ? <path d="M 899 392 l 8 8 l 15 -16" stroke="#FFFFFF" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      </g>
    </svg>
  );
};

/**
 * The step: the insight first (the takeaway), the picture second, then ONE
 * text slot that shows the step as written (removed words struck) and flips to
 * the step as fixed (added words highlighted, the unchanged time ringed).
 */
const Step: React.FC<{ s: TransformShortProps['step']; servings: { from: number; to: number } | null }> = ({ s, servings }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame: f - s.start - 2, fps, config: { damping: 11, stiffness: 200 } });
  const bIn = spring({ frame: f - s.beforeIn, fps, config: { damping: 14, stiffness: 240 } });
  const flip = spring({ frame: f - s.afterIn, fps, config: { damping: 14, stiffness: 200 } });
  const showAfter = f >= s.afterIn;
  return (
    <>
      <Ground color={showAfter ? G.step : '#3A2A26'} />
      <TopBar text={s.title} at={s.start + 2} />
      <div style={{ position: 'absolute', left: SAFE.x0, top: 388, width: W, display: 'flex', justifyContent: 'center' }}>
        {showAfter ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, transform: `scale(${interpolate(Math.min(1, flip), [0, 1], [1.5, 1])}) rotate(-1.5deg)`, opacity: Math.min(1, flip * 2) }}>
            {s.answer ? <div style={{ width: 84, height: 84, flex: '0 0 84px', borderRadius: 42, background: GREEN, border: `5px solid ${INK}`, boxShadow: `0 6px 0 ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Lilita One', fontSize: 52, color: '#FFFFFF' }}>{s.answer}</div> : null}
            <div style={{ ...card(YELLOW), borderRadius: 22, padding: '8px 20px 12px', textAlign: 'center', fontFamily: 'Lilita One', fontSize: s.answer ? 46 : 50, lineHeight: 1.08, color: INK }}>{s.takeaway}</div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', ...display(62), transform: `scale(${interpolate(Math.min(1, head), [0, 1], [0.75, 1])})`, opacity: Math.min(1, head * 1.5) }}>{s.beforeHead}</div>
        )}
      </div>
      <Pans split={s.afterIn} pan1={s.afterIn + 10} pan2={s.afterIn + 10 + 40} len={36} left={58} top={488} scale={0.86} />
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 946, width: W - 12 }}>
        {!showAfter ? (
          <div style={{ ...card('#F3EDE7'), padding: '14px 24px 18px', opacity: Math.min(1, bIn * 1.6), transform: `scale(${interpolate(Math.min(1, bIn), [0, 1], [0.94, 1])}) rotate(-0.8deg)` }}>
            <Label bg={MUTED}>{servings ? `As written · serves ${servings.from}` : 'As written'}</Label>
            <div style={{ marginTop: 8, fontFamily: 'Inter', fontWeight: 600, fontSize: 46, lineHeight: 1.26, color: '#4A403A' }}>
              <Marked segs={s.before} side="before" strikeAt={s.strike} sweepAt={0} keepAt={s.keepAt} />
            </div>
          </div>
        ) : (
          <div style={{ ...card('#FFFFFF'), boxShadow: `0 8px 0 ${INK}, inset 0 0 0 5px ${GREEN}`, padding: '14px 24px 18px', transform: `rotateX(${(1 - Math.min(1, flip)) * 80}deg) rotate(0.6deg)`, transformOrigin: '50% 0%' }}>
            <Label bg={GREEN}>{servings ? `RecipeFix · serves ${servings.to}` : 'RecipeFix'}</Label>
            <div style={{ marginTop: 8, fontFamily: 'Inter', fontWeight: 600, fontSize: 44, lineHeight: 1.26, color: INK }}>
              <Marked segs={s.after} side="after" strikeAt={0} sweepAt={s.sweep} keepAt={s.keepAt} />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const Result: React.FC<{ r: TransformShortProps['result'] }> = ({ r }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = spring({ frame: f - r.start - 6, fps, config: { damping: 12, stiffness: 170 } });
  const flip = spring({ frame: f - r.start - 12, fps, config: { damping: 9, stiffness: 220 } });
  const nSize = Math.min(58, Math.floor((W - 60) / (Math.ceil(r.name.length / 2) * 0.5)));
  return (
    <>
      <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
        <Img src={staticFile(r.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [r.start, r.end + PUSH], [1.12, 1.0], clamp)})` }} />
        <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(20,15,12,0.55) 0%, rgba(20,15,12,0) 26%, rgba(20,15,12,0) 50%, rgba(20,15,12,0.55) 78%, rgba(20,15,12,0.75) 100%)' }} />
      </AbsoluteFill>
      <TopBar text="The result" at={r.start + 2} />
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 860, width: W - 12, ...card('#FFFFFF'), padding: '22px 26px 24px', transform: `translateY(${(1 - Math.min(1, cardIn)) * 400}px) rotate(-1deg)` }}>
        <div style={{ fontFamily: 'Lilita One', fontSize: nSize, lineHeight: 1.08, color: INK }}>{r.name}</div>
        {r.servings ? (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'Lilita One', fontSize: 64, color: INK }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 36, color: MUTED, textTransform: 'uppercase', letterSpacing: 2 }}>Serves</span>
            <span style={{ position: 'relative', color: MUTED }}>
              {r.servings.from}
              <span style={{ position: 'absolute', left: -6, right: -6, top: '48%', height: 7, background: RED, borderRadius: 4, transform: `rotate(-12deg) scaleX(${Math.min(1, Math.max(0, flip))})`, transformOrigin: 'left' }} />
            </span>
            <span>→</span>
            <span style={{ display: 'inline-block', background: YELLOW, border: `4px solid ${INK}`, borderRadius: 16, padding: '0 18px 4px', transform: `scale(${Math.max(0, flip)}) rotate(-4deg)` }}>{r.servings.to}</span>
          </div>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: 1176, width: W - 12, display: 'flex' }}>
        <span style={{ background: 'rgba(20,15,12,0.82)', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 32, padding: '8px 16px', borderRadius: 10 }}>{r.photoLabel}</span>
      </div>
    </>
  );
};

const Close: React.FC<{ c: TransformShortProps['close']; photo: string }> = ({ c, photo }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f - c.start - 4, fps, config: { damping: 12 } });
  const brandAt = c.start + 16;
  const b = interpolate(f, [brandAt, brandAt + 10], [0, 1], clamp);
  return (
    <>
      <PhotoBed src={photo} tint="rgba(34,20,12,0.5)" from={c.start} pos="50% 20%" />
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: SAFE.y0 + 10, width: W - 12, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ textAlign: 'center', opacity: Math.min(1, a), transform: `scale(${interpolate(a, [0, 1], [0.7, 1])})` }}>
          {c.save.split(/:\s*/).map((part, i) => (
            <div key={i} style={{ ...display(i === 0 ? 78 : Math.min(56, Math.floor((W - 20) / (part.length * 0.5)))), whiteSpace: 'nowrap' }}>{part}</div>
          ))}
        </div>
        <div style={{ ...card('#FFFFFF'), padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 6, opacity: Math.min(1, a * 1.5) }}>
          {c.swaps.map(([from, to], i) => {
            const tt = interpolate(f, [c.start + 2 + i * 3, c.start + 8 + i * 3], [0, 1], clamp);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap', fontFamily: 'Inter', fontWeight: 600, fontSize: from.length + to.length > 28 ? 36 : 40, lineHeight: 1.3, opacity: tt, transform: `translateX(${(1 - tt) * 40}px)` }}>
                <span style={{ color: MUTED }}>{from}</span>
                <span style={{ fontFamily: 'Lilita One', color: RED }}>→</span>
                <span style={{ color: GREEN_DARK }}>{to}</span>
              </div>
            );
          })}
        </div>
        <div style={{ ...card('#FFFFFF'), padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10, opacity: interpolate(f, [c.start + 8, c.start + 12], [0, 1], clamp) }}>
          {c.tips.map((t, i) => {
            const tt = interpolate(f, [c.start + 8 + i * 4, c.start + 12 + i * 4], [0, 1], clamp);
            return (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: tt, transform: `translateX(${(1 - tt) * 40}px)` }}>
                <div style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 22, background: GREEN, border: `3px solid ${INK}`, color: '#FFFFFF', fontFamily: 'Lilita One', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>✓</div>
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, lineHeight: 1.24, color: INK }}>{t}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, opacity: b, background: 'rgba(27,20,16,0.88)', borderRadius: 22, padding: '14px 18px' }}>
          <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 58, height: 58, flex: '0 0 58px', borderRadius: 14 }} />
          <div>
            <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, lineHeight: 1.25, color: '#FFFFFF' }}>{c.tie}</div>
            <div style={{ marginTop: 6, fontFamily: 'Inter', fontWeight: 600, fontSize: 28, lineHeight: 1.3, color: '#E9E1DA' }}>{c.note}</div>
          </div>
        </div>
      </div>
    </>
  );
};

const Visible: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};

const At: React.FC<{ from: number; src: string | null | undefined; volume?: number }> = ({ from, src, volume = 1 }) =>
  src ? (
    <Sequence from={Math.max(0, Math.round(from))} layout="none">
      <Audio src={staticFile(src)} volume={volume} />
    </Sequence>
  ) : null;

export const TransformShort: React.FC<TransformShortProps> = (p) => {
  const sv = p.hook.servings;
  const st = p.step;
  const dels = st.before.filter((x) => x.kind === 'del').length;
  const ins = st.after.filter((x) => x.kind === 'ins').length;
  return (
    <AbsoluteFill style={{ background: G.hook }}>
      <style>{FONTS}</style>
      <Visible from={0} to={p.hook.end + PUSH}>
        <Push at={0} first>
          <Hook p={p} />
        </Push>
      </Visible>
      <Visible from={p.swaps.start} to={p.swaps.end + PUSH}>
        <Push at={p.swaps.start}>
          <Swaps sw={p.swaps} servingsTo={sv?.to ?? null} photo={p.result.photo} />
        </Push>
      </Visible>
      <Visible from={st.start} to={st.end + PUSH}>
        <Push at={st.start}>
          <Step s={st} servings={sv} />
        </Push>
      </Visible>
      <Visible from={p.result.start} to={p.result.end + PUSH}>
        <Push at={p.result.start}>
          <Result r={p.result} />
        </Push>
      </Visible>
      <Visible from={p.close.start} to={Number.MAX_SAFE_INTEGER}>
        <Push at={p.close.start}>
          <Close c={p.close} photo={p.result.photo} />
        </Push>
      </Visible>
      {p.sfx ? (
        <>
          {[p.swaps.start, st.start, p.result.start, p.close.start].map((t, i) => (
            <At key={`w${i}`} from={t} src={p.sfx!.whoosh} volume={0.55} />
          ))}
          {p.swaps.rowAt.map((t, i) => (
            <At key={`s${i}`} from={t} src={p.sfx!.scribble} volume={0.7} />
          ))}
          {Array.from({ length: dels }, (_, k) => (
            <At key={`d${k}`} from={st.strike + k * 8} src={p.sfx!.scribble} volume={0.6} />
          ))}
          {Array.from({ length: ins }, (_, k) => (
            <At key={`h${k}`} from={st.sweep + k * 12} src={p.sfx!.swipe} volume={0.8} />
          ))}
          <At from={st.keepAt} src={p.sfx.reveal} volume={0.55} />
          <At from={p.result.start + 12} src={p.sfx.reveal} volume={0.45} />
        </>
      ) : null}
      {p.audio ? (
        <>
          <At from={4} src={p.audio.hook} />
          <At from={p.swaps.start + 6} src={p.audio.swaps} />
          <At from={st.start + 8} src={p.audio.step} />
          <At from={p.result.start + 6} src={p.audio.result} />
          <At from={p.close.start + 6} src={p.audio.close} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
