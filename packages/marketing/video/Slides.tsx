/**
 * Still formats: one composition frame = one slide. Three families, three
 * layouts on purpose (owner: "each post type its own layout, not one template"):
 *
 *  - QuizDeck: the game-show quiz as a swipe carousel. Bold solid grounds that
 *    change per question, Lilita One outlined display type, the dish in a
 *    white card, A–D tiles, answers on a cream answer key, one RecipeFix line.
 *  - SwapDeck: the editorial swap guide. RecipeFix cream and terracotta,
 *    Instrument Serif, the strike-through diff (brand.md §2: the most ownable
 *    visual RecipeFix has), real app screens, the method change on an ink panel.
 *  - FactCard: a single feed image. Full-bleed photo, a white card that
 *    overlaps it with the question, "Answer below": the answer lives in the
 *    caption or the reply, never on the image.
 *
 * Every word sits inside TEXT_SAFE for its canvas; photos are pre-cropped to
 * their exact box (see slideLayout.ts) and drawn with objectFit cover.
 */
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, FONTS } from './kit.js';
import { CANVAS, CHAR_EM, FACT, QUIZ, SWAP, fitSize, wrapLines, type Box, type Canvas } from './slideLayout.js';

const INK = '#1B1410';
const GREEN = '#1E7F48';
const RED = '#C9372C';
const YELLOW = '#F2C94C';
const SECONDARY = '#5A4F47';
const BADGE = ['#C9372C', '#2F6FC4', '#B7791F', '#1E7F48'];
const LETTERS = ['A', 'B', 'C', 'D'];

const abs = (b: Box): React.CSSProperties => ({ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h });

/** Display type: white, dark outline, hard drop shadow. */
const display = (size: number, color = '#FFFFFF', stroke = true): React.CSSProperties => ({
  fontFamily: 'Lilita One',
  fontSize: size,
  lineHeight: 1.1,
  color,
  ...(stroke ? { WebkitTextStroke: `${Math.max(3, size * 0.07)}px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 ${size * 0.07}px 0 rgba(0,0,0,0.28)` } : {}),
  letterSpacing: 0.5,
});

const Pattern: React.FC<{ glyph?: string; tone?: string }> = ({ glyph = '?', tone = 'rgba(255,255,255,0.10)' }) => {
  const marks = [];
  for (let r = -1; r < 14; r++)
    for (let c = -1; c < 8; c++)
      marks.push(
        <div key={`${r}-${c}`} style={{ position: 'absolute', left: c * 160 + (r % 2) * 80 + 20, top: r * 150 + 30, fontFamily: 'Lilita One', fontSize: 64, color: tone, transform: `rotate(${((r * 7 + c * 13) % 30) - 15}deg)` }}>
          {(r + c) % 3 === 0 ? glyph : '•'}
        </div>,
      );
  return <AbsoluteFill style={{ overflow: 'hidden' }}>{marks}</AbsoluteFill>;
};

/** A photo pre-cropped to exactly this box; `card` adds the white border the quiz genre uses. */
const Photo: React.FC<{ src: string; box: Box; card?: boolean; tilt?: number; radius?: number }> = ({ src, box, card = false, tilt = 0, radius = 34 }) => (
  <div style={{ ...abs(box), transform: tilt ? `rotate(${tilt}deg)` : undefined }}>
    <div style={{ width: '100%', height: '100%', borderRadius: card ? radius : 0, overflow: 'hidden', border: card ? '10px solid #FFFFFF' : undefined, boxShadow: card ? `0 10px 0 ${INK}, 0 24px 50px rgba(0,0,0,0.25)` : undefined, boxSizing: 'border-box', background: '#FFFFFF' }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  </div>
);

const Arrow: React.FC<{ size: number; color?: string }> = ({ size, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: `0 0 ${size}px` }}>
    <path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The swipe affordance: a yellow sticker with an arrow, slightly tilted. */
const SwipeSticker: React.FC<{ size?: number; label?: string }> = ({ size = 46, label = 'Swipe' }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: YELLOW, border: `5px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, borderRadius: 24, padding: `${size * 0.22}px ${size * 0.5}px`, transform: 'rotate(-3deg)' }}>
    <span style={{ fontFamily: 'Lilita One', fontSize: size, color: INK, textTransform: 'uppercase', lineHeight: 1 }}>{label}</span>
    <Arrow size={size * 1.05} />
  </div>
);

const Mark: React.FC<{ size: number; border?: string }> = ({ size, border = '#FFFFFF' }) => (
  <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: size, height: size, borderRadius: size * 0.24, border: `${Math.max(3, size * 0.06)}px solid ${border}`, boxShadow: `0 ${size * 0.08}px 0 ${INK}`, boxSizing: 'border-box', flex: `0 0 ${size}px` }} />
);

// ─────────────────────────────── QuizDeck ───────────────────────────────

export type QuizSlide =
  | { kind: 'cover'; kicker: string; headline: string; photo: string; count: number; color: string }
  | { kind: 'question'; n: number; total: number; kicker: string; question: string; options: string[]; myth: boolean; photo: string; color: string }
  | { kind: 'answers'; title: string; items: Array<{ n: number; question: string; answer: string; myth: boolean; correctIsMyth: boolean; why: string; source: string }> }
  | { kind: 'close'; tie: string; save: string; color: string };

export interface QuizDeckProps {
  canvas: Canvas;
  slides: QuizSlide[];
  [key: string]: unknown;
}

const Banner: React.FC<{ box: Box; text: string; n?: number }> = ({ box, text, n }) => (
  <div style={{ ...abs(box), display: 'flex', alignItems: 'center', gap: 16 }}>
    {n !== undefined ? (
      <div style={{ width: box.h, height: box.h, flex: `0 0 ${box.h}px`, borderRadius: box.h / 2, background: RED, border: '5px solid #FFFFFF', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(box.h * 0.52) }}>{n}</div>
    ) : null}
    <div style={{ flex: 1, height: box.h, borderRadius: 22, background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 7px 0 ${INK}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-1.2deg)' }}>
      <span style={{ fontFamily: 'Lilita One', fontSize: box.h * 0.48, color: INK, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
    <Mark size={box.h} />
  </div>
);

const Tile: React.FC<{ text: string; i: number; size: number; h: number }> = ({ text, i, size, h }) => (
  <div style={{ height: h, borderRadius: 24, background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px 0 14px', boxSizing: 'border-box' }}>
    <div style={{ width: 62, height: 62, flex: '0 0 62px', borderRadius: 31, background: BADGE[i], border: `4px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Lilita One', fontSize: 38, color: '#FFFFFF' }}>{LETTERS[i]}</div>
    <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: size, lineHeight: 1.05, whiteSpace: 'nowrap', color: INK }}>{text}</div>
  </div>
);

const MythFact: React.FC<{ box: Box }> = ({ box }) => {
  const d = Math.min(box.h - 16, 230);
  return (
    <div style={{ ...abs(box), display: 'flex', justifyContent: 'space-evenly', alignItems: 'center' }}>
      {[
        ['MYTH', RED],
        ['FACT', GREEN],
      ].map(([t, tone]) => (
        <div key={t} style={{ width: d, height: d, borderRadius: d / 2, background: tone, border: '8px solid #FFFFFF', boxShadow: `0 10px 0 ${INK}, 0 0 0 6px ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(d * 0.27) }}>
          {t}
        </div>
      ))}
    </div>
  );
};

const QuizCover: React.FC<{ s: Extract<QuizSlide, { kind: 'cover' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const L = QUIZ[canvas];
  const size = fitSize(s.headline, L.coverHead.w, L.coverHead.h, canvas === 'feed' ? 112 : 96, 56, CHAR_EM.lilita, 1.1);
  const footSize = canvas === 'feed' ? 34 : 27;
  return (
    <>
      <AbsoluteFill style={{ background: s.color }} />
      <Pattern />
      <Banner box={L.banner} text={s.kicker} />
      <div style={{ ...abs(L.coverHead), display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...display(size) }}>{s.headline}</div>
      <Photo src={s.photo} box={L.coverPhoto} card tilt={1.2} />
      <div style={{ ...abs(L.coverFoot), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ background: INK, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: footSize, lineHeight: 1.2, padding: '14px 20px', borderRadius: 18, whiteSpace: 'nowrap' }}>{`${s.count} questions, answers at the end`}</div>
        <SwipeSticker size={canvas === 'feed' ? 50 : 44} />
      </div>
    </>
  );
};

const QuizQuestion: React.FC<{ s: Extract<QuizSlide, { kind: 'question' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const L = QUIZ[canvas];
  const text = s.myth ? `“${s.question}”` : s.question;
  const size = fitSize(text, L.question.w - 20, L.question.h, canvas === 'feed' ? 104 : 88, 46, CHAR_EM.lilita, 1.1);
  const cols = s.options.length > 2 || canvas === 'feed' ? 2 : 1;
  const rows = Math.ceil(s.options.length / cols);
  const tileH = Math.min(112, (L.options.h - (rows - 1) * 16) / rows);
  const tileTextW = (cols === 2 ? (L.options.w - 16) / 2 : L.options.w) - 110;
  const longest = Math.max(...s.options.map((o) => o.length));
  const optSize = Math.min(56, Math.floor(tileTextW / (longest * CHAR_EM.inter)));
  return (
    <>
      <AbsoluteFill style={{ background: s.color }} />
      <Pattern />
      <Banner box={L.banner} text={`${s.kicker}: ${s.n} of ${s.total}`} n={undefined} />
      <div style={{ ...abs(L.question), display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...display(size) }}>{text}</div>
      {s.myth ? (
        <MythFact box={L.options} />
      ) : (
        <div style={{ ...abs(L.options), display: 'grid', gridTemplateColumns: cols === 2 ? '1fr 1fr' : '1fr', gap: 16, alignContent: 'center' }}>
          {s.options.map((o, i) => (
            <div key={i} style={{ gridColumn: s.options.length === 3 && i === 2 ? '1 / span 2' : undefined }}>
              <Tile text={o} i={i} size={optSize} h={tileH} />
            </div>
          ))}
        </div>
      )}
      <Photo src={s.photo} box={L.qPhoto} card tilt={-0.8} radius={28} />
      <div style={{ ...abs(L.qFoot), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: INK, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: canvas === 'feed' ? 32 : 30, padding: '12px 24px', borderRadius: 18 }}>
          {s.n === s.total ? 'Lock it in, then swipe for the answers' : 'Lock it in, then swipe'}
          <Arrow size={34} color="#FFFFFF" />
        </div>
      </div>
    </>
  );
};

const QuizAnswers: React.FC<{ s: Extract<QuizSlide, { kind: 'answers' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const L = QUIZ[canvas];
  const gap = canvas === 'feed' ? 30 : 24;
  const itemH = (L.answers.h - gap * (s.items.length - 1)) / s.items.length;
  const textW = L.answers.w - 92;
  return (
    <>
      <AbsoluteFill style={{ background: C.cream }} />
      <Pattern glyph="✓" tone="rgba(166,83,54,0.07)" />
      <div style={{ ...abs(L.banner), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...display(L.banner.h * 0.9, C.terracotta), paddingLeft: 12 }}>{s.title}</span>
        <Mark size={L.banner.h} border={INK} />
      </div>
      <div style={{ ...abs(L.answers), display: 'flex', flexDirection: 'column', gap }}>
        {s.items.map((a) => {
          const solo = s.items.length === 1;
          const whySize = fitSize(a.why, textW, solo ? 420 : itemH - 170, solo ? 52 : canvas === 'feed' ? 46 : 40, 29, CHAR_EM.inter, 1.28);
          return (
            <div key={a.n} style={{ flex: s.items.length > 1 ? 1 : undefined, display: 'flex', alignItems: 'center', gap: 20, background: '#FFFFFF', borderRadius: 26, border: `4px solid ${INK}`, boxShadow: `0 7px 0 ${INK}`, padding: '20px 24px 20px 18px', boxSizing: 'border-box' }}>
              <div style={{ width: 58, height: 58, flex: '0 0 58px', borderRadius: 29, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Lilita One', fontSize: 34, color: '#FFFFFF' }}>{a.n}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {solo ? <div style={{ fontFamily: 'Lilita One', fontSize: 40, lineHeight: 1.12, color: INK, marginBottom: 18 }}>{a.question}</div> : null}
                <span style={{ display: 'inline-block', background: a.myth ? (a.correctIsMyth ? RED : GREEN) : GREEN, borderRadius: 14, padding: '4px 18px 6px', ...display(canvas === 'feed' ? 52 : 44, '#FFFFFF', false) }}>{a.answer}</span>
                <div style={{ marginTop: 12, fontFamily: 'Inter', fontWeight: 600, fontSize: whySize, lineHeight: 1.28, color: INK }}>{a.why}</div>
                <div style={{ marginTop: 12, fontFamily: 'Inter', fontWeight: 600, fontSize: canvas === 'feed' ? 30 : 28, lineHeight: 1.25, color: SECONDARY }}>{`Source: ${a.source}`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

const QuizClose: React.FC<{ s: Extract<QuizSlide, { kind: 'close' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const safe = canvas === 'feed' ? { x: 64, y: 90, w: 952, h: 1170 } : { x: 120, y: 290, w: 780, h: 950 };
  const feed = canvas === 'feed';
  return (
    <>
      <AbsoluteFill style={{ background: s.color }} />
      <Pattern />
      <div style={{ ...abs(safe), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: feed ? 48 : 36, textAlign: 'center' }}>
        <div style={{ ...display(fitSize(s.save, safe.w, feed ? 260 : 220, feed ? 80 : 66, 44, CHAR_EM.lilita, 1.1)) }}>{s.save}</div>
        <div style={{ background: '#FFFFFF', borderRadius: 30, border: `5px solid ${INK}`, boxShadow: `0 9px 0 ${INK}`, padding: feed ? '30px 36px' : '24px 28px', display: 'flex', alignItems: 'center', gap: 26, textAlign: 'left' }}>
          <Mark size={feed ? 120 : 96} border={INK} />
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: feed ? 42 : 34, lineHeight: 1.24, color: INK }}>{s.tie}</div>
        </div>
        <div style={{ ...display(feed ? 76 : 64) }}>recipefix.app</div>
      </div>
    </>
  );
};

export const QuizDeck: React.FC<QuizDeckProps> = ({ canvas, slides }) => {
  const s = slides[useCurrentFrame()];
  return (
    <AbsoluteFill style={{ background: INK }}>
      <style>{FONTS}</style>
      {!s ? null : s.kind === 'cover' ? <QuizCover s={s} canvas={canvas} /> : s.kind === 'question' ? <QuizQuestion s={s} canvas={canvas} /> : s.kind === 'answers' ? <QuizAnswers s={s} canvas={canvas} /> : <QuizClose s={s} canvas={canvas} />}
    </AbsoluteFill>
  );
};

// ─────────────────────────────── SwapDeck ───────────────────────────────

export type SwapSlide =
  | { kind: 'cover'; kicker: string; headline: string; sub: string; photo: string; photoLabel: string }
  | { kind: 'proof'; kicker: string; headline: string; shots: Array<{ src: string; w: number; h: number }>; lines: string[] }
  | { kind: 'swap'; n: number; total: number; label?: string; stepsLabel?: string; from: string; to: string; asWritten: string; adapted: string; servesFrom: number; servesTo: number; why: string; steps: string[] }
  | { kind: 'expect'; title: string; lines: string[] }
  | { kind: 'close'; tie: string; save: string; photo: string };

export interface SwapDeckProps {
  canvas: Canvas;
  slides: SwapSlide[];
  footer: string;
  /** Tall canvas only: a photo band below the text safe area (behind TikTok's caption), so the slide never ends in blank. */
  band?: string;
  [key: string]: unknown;
}

const serif = (size: number, color: string = C.ink): React.CSSProperties => ({ fontFamily: 'Instrument Serif', fontSize: size, lineHeight: 1.04, color, letterSpacing: -0.5 });
const inter = (size: number, color: string = C.ink, weight = 400): React.CSSProperties => ({ fontFamily: 'Inter', fontWeight: weight, fontSize: size, lineHeight: 1.28, color });
const TERRA_TEXT = '#8A3F27';
const KICK: React.CSSProperties = { fontFamily: 'Lilita One', color: TERRA_TEXT, textTransform: 'uppercase', letterSpacing: 1.5, lineHeight: 1 };

const SwapCover: React.FC<{ s: Extract<SwapSlide, { kind: 'cover' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const L = SWAP[canvas];
  const feed = canvas === 'feed';
  const text = feed ? { x: 72, y: L.coverPhoto.h + 40, w: 936, h: 1280 - L.coverPhoto.h - 40 } : { x: 134, y: L.coverPhoto.h + 36, w: 752, h: 1240 - L.coverPhoto.h - 36 };
  const head = fitSize(s.headline, text.w, feed ? 210 : 190, feed ? 92 : 78, 54, CHAR_EM.serif, 1.04);
  return (
    <>
      <Photo src={s.photo} box={L.coverPhoto} />
      {/* scrim under the photo label only */}
      <div style={{ position: 'absolute', left: 0, top: L.coverPhoto.h - 170, width: 1080, height: 170, background: 'linear-gradient(to bottom, rgba(20,15,12,0) 0%, rgba(20,15,12,0.82) 100%)' }} />
      <div style={{ position: 'absolute', left: feed ? 72 : 134, top: L.coverPhoto.h - (feed ? 104 : 140), maxWidth: feed ? 900 : 680, background: 'rgba(20,15,12,0.78)', borderRadius: 12, padding: '8px 14px', ...inter(28, '#FFFFFF', 600), lineHeight: 1.2 }}>{s.photoLabel}</div>
      <div style={{ position: 'absolute', left: feed ? 72 : 134, top: L.coverPhoto.h - 40, background: C.terracottaDeep, color: '#FFFFFF', fontFamily: 'Lilita One', fontSize: feed ? 40 : 36, letterSpacing: 1.5, textTransform: 'uppercase', padding: '14px 26px', borderRadius: 18, border: `4px solid ${INK}`, boxShadow: `0 6px 0 ${INK}`, transform: 'rotate(-2deg)' }}>{s.kicker}</div>
      <div style={{ ...abs(text), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 34, boxSizing: 'border-box' }}>
        <div>
          <div style={serif(head)}>{s.headline}</div>
          <div style={{ marginTop: 20, ...inter(feed ? 38 : 32, SECONDARY, 600) }}>{s.sub}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SwipeSticker size={feed ? 44 : 40} />
        </div>
      </div>
    </>
  );
};

const SwapProof: React.FC<{ s: Extract<SwapSlide, { kind: 'proof' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const L = SWAP[canvas];
  const feed = canvas === 'feed';
  return (
    <>
      <div style={{ ...abs(L.pad), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: feed ? 26 : 22 }}>
        <div style={{ alignSelf: 'stretch' }}>
          <div style={{ ...KICK, fontSize: feed ? 40 : 36 }}>{s.kicker}</div>
          <div style={{ marginTop: 14, ...serif(feed ? 64 : 50) }}>{s.headline}</div>
        </div>
        {s.shots.map((sh) => (
          <div key={sh.src} style={{ width: sh.w, height: sh.h, borderRadius: 22, overflow: 'hidden', border: `3px solid #D9CBBE`, boxShadow: '0 14px 34px rgba(39,34,30,0.16)', flex: `0 0 ${sh.h}px` }}>
            <Img src={staticFile(sh.src)} style={{ width: sh.w, height: sh.h, display: 'block' }} />
          </div>
        ))}
        <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {s.lines.map((l) => (
            <div key={l} style={inter(feed ? 30 : 27, SECONDARY, 600)}>
              {l}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const SwapCard: React.FC<{ s: Extract<SwapSlide, { kind: 'swap' }>; canvas: Canvas; footer: string }> = ({ s, canvas, footer }) => {
  const L = SWAP[canvas];
  const feed = canvas === 'feed';
  const T = feed
    ? { kick: 46, from: 80, toMax: 116, label: 32, amount: 35, why: 35, foot: 29, gap: 30, panelLabel: 29, stepMax: 52 }
    : { kick: 38, from: 56, toMax: 80, label: 27, amount: 28, why: 28, foot: 26, gap: 18, panelLabel: 25, stepMax: 40 };
  const W = L.pad.w;
  const labelW = feed ? 190 : 150;
  const toSize = fitSize(s.to, W - 90, T.toMax * 1.1, T.toMax, 56, CHAR_EM.serif, 1.04);
  const lh = (t: string, size: number, w: number) => wrapLines(t, size, w, CHAR_EM.inter) * size * 1.28;
  const amountsH = lh(s.asWritten, T.amount, W - labelW - 64) + lh(s.adapted, T.amount, W - labelW - 64) + 12 + (feed ? 40 : 32);
  const whyH = lh(`Why: ${s.why}`, T.why, W);
  const fixed = T.kick * 1.1 + T.from * 1.06 + toSize * 1.12 + amountsH + whyH + T.foot * 1.3 + T.gap * 5 + T.panelLabel * 1.3 + (feed ? 60 : 50) + 14 * s.steps.length;
  const stepSize = fitSize(s.steps.join(' '), W - (feed ? 92 : 74), Math.max(120, L.pad.h - fixed - (feed ? 0 : 40)), T.stepMax, feed ? 36 : 28, CHAR_EM.inter, 1.3);
  return (
    <>
      <div style={{ ...abs(L.pad), display: 'flex', flexDirection: 'column', gap: T.gap }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ ...KICK, fontSize: T.kick }}>{`Swap ${s.n} of ${s.total}`}</span>
          {s.label ? <span style={inter(T.label, SECONDARY, 600)}>{s.label}</span> : null}
        </div>
        <div>
          <div style={{ ...serif(T.from, SECONDARY), textDecoration: 'line-through', textDecorationColor: C.terracottaDeep, textDecorationThickness: 5 }}>{s.from}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <Arrow size={toSize * 0.6} color={C.terracottaDeep} />
            <span style={{ ...serif(toSize, C.terracottaDeep), borderBottom: `5px solid ${C.terracottaDeep}`, paddingBottom: 2 }}>{s.to}</span>
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '3px solid #D9CBBE', borderRadius: 22, padding: feed ? '20px 26px' : '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            [`Serves ${s.servesFrom}`, s.asWritten, SECONDARY],
            [`Serves ${s.servesTo}`, s.adapted, TERRA_TEXT],
          ].map(([k, v, tone]) => (
            <div key={k} style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: `0 0 ${labelW}px`, ...inter(T.amount, tone, 600) }}>{k}</div>
              <div style={inter(T.amount, C.ink)}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, background: C.ink, borderRadius: 28, padding: feed ? '26px 32px 28px' : '20px 22px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...inter(T.panelLabel, C.peach, 600), letterSpacing: 2.2, textTransform: 'uppercase' }}>{s.stepsLabel ?? 'What changes in the steps'}</div>
          {s.steps.map((t) => (
            <div key={t} style={{ display: 'flex', gap: 16, marginTop: 20 }}>
              <div style={{ width: 16, height: 16, flex: '0 0 16px', borderRadius: 8, background: C.terracotta, marginTop: stepSize * 0.45 }} />
              <div style={{ ...inter(stepSize, '#FFFFFF', 600), lineHeight: 1.3 }}>{t}</div>
            </div>
          ))}
        </div>
        <div style={inter(T.why, SECONDARY)}>
          <span style={{ fontWeight: 600, color: C.ink }}>Why: </span>
          {s.why}
        </div>
        <div style={inter(T.foot, SECONDARY, 600)}>{footer}</div>
      </div>
    </>
  );
};

const SwapExpect: React.FC<{ s: Extract<SwapSlide, { kind: 'expect' }>; canvas: Canvas; footer: string }> = ({ s, canvas, footer }) => {
  const L = SWAP[canvas];
  const feed = canvas === 'feed';
  const title = feed ? 120 : 96;
  const each = (L.pad.h - title * 1.1 - 80 - (feed ? 60 : 44) * s.lines.length) / s.lines.length;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: canvas === 'tall' ? 1290 : 1350, background: C.terracottaDeep }} />
      <div style={{ ...abs(L.pad), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={serif(title, '#FFFFFF')}>{s.title}</div>
        {s.lines.map((l) => (
          <div key={l} style={{ borderLeft: `8px solid ${C.peach}`, paddingLeft: 30 }}>
            <div style={serif(fitSize(`“${l}”`, L.pad.w - 44, each, feed ? 80 : 66, 40, CHAR_EM.serif, 1.06), '#FFFFFF')}>{`“${l}”`}</div>
          </div>
        ))}
        <div style={inter(feed ? 29 : 27, '#FFFFFF', 600)}>{footer}</div>
      </div>
    </>
  );
};

const SwapClose: React.FC<{ s: Extract<SwapSlide, { kind: 'close' }>; canvas: Canvas }> = ({ s, canvas }) => {
  const L = SWAP[canvas];
  const feed = canvas === 'feed';
  const ph = feed ? 360 : 300;
  return (
    <>
      <div style={{ ...abs(L.pad), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: feed ? 44 : 34, textAlign: 'center' }}>
        <div style={{ width: ph, height: ph, borderRadius: ph / 2, overflow: 'hidden', border: `8px solid #FFFFFF`, boxShadow: '0 18px 40px rgba(39,34,30,0.22)' }}>
          <Img src={staticFile(s.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <div style={serif(fitSize(s.tie, L.pad.w, feed ? 260 : 240, feed ? 68 : 56, 44, CHAR_EM.serif, 1.06))}>{s.tie}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Mark size={feed ? 84 : 72} border={C.cream} />
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: feed ? 50 : 44, color: C.terracottaDeep }}>recipefix.app</span>
        </div>
        <div style={{ ...KICK, fontSize: feed ? 38 : 34 }}>{s.save}</div>
      </div>
    </>
  );
};

export const SwapDeck: React.FC<SwapDeckProps> = ({ canvas, slides, footer, band }) => {
  const s = slides[useCurrentFrame()];
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <style>{FONTS}</style>
      {canvas === 'tall' && band ? (
        <>
          <Photo src={band} box={{ x: 0, y: 1290, w: 1080, h: 630 }} />
          <div style={{ position: 'absolute', left: 0, top: 1288, width: 1080, height: 200, background: `linear-gradient(to bottom, ${s?.kind === 'expect' ? C.terracottaDeep : C.cream} 0%, rgba(245,237,228,0) 100%)` }} />
        </>
      ) : null}
      {!s ? null : s.kind === 'cover' ? (
        <SwapCover s={s} canvas={canvas} />
      ) : s.kind === 'proof' ? (
        <SwapProof s={s} canvas={canvas} />
      ) : s.kind === 'swap' ? (
        <SwapCard s={s} canvas={canvas} footer={footer} />
      ) : s.kind === 'expect' ? (
        <SwapExpect s={s} canvas={canvas} footer={footer} />
      ) : (
        <SwapClose s={s} canvas={canvas} />
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────── FactCard ───────────────────────────────

export interface FactCardProps {
  kicker: string;
  question: string;
  options: string[];
  myth: boolean;
  photo: string;
  color: string;
  foot: string;
  [key: string]: unknown;
}

export const FactCard: React.FC<FactCardProps> = (p) => {
  const card = FACT.card;
  const padX = 44;
  const innerW = card.w - padX * 2;
  const text = p.myth ? `“${p.question}”` : p.question;
  const qSize = fitSize(text, innerW, 250, 96, 48, CHAR_EM.lilita, 1.08);
  const longest = Math.max(...p.options.map((o) => o.length));
  const cols = 2;
  const optSize = Math.min(40, Math.floor(((innerW - 16) / cols - 100) / (longest * CHAR_EM.inter)));
  return (
    <AbsoluteFill style={{ background: p.color }}>
      <style>{FONTS}</style>
      <Photo src={p.photo} box={FACT.photo} />
      <div style={{ ...abs(card), background: '#FFFFFF', borderRadius: 40, border: `6px solid ${INK}`, boxShadow: `0 12px 0 ${INK}`, boxSizing: 'border-box', padding: `70px ${padX - 6}px 34px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minHeight: 230, display: 'flex', alignItems: 'center', fontFamily: 'Lilita One', fontSize: qSize, lineHeight: 1.08, color: INK }}>{text}</div>
        {p.myth ? (
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              ['Myth', RED],
              ['Fact', GREEN],
            ].map(([t, tone]) => (
              <div key={t} style={{ flex: 1, height: 130, borderRadius: 30, background: tone, border: `5px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(70) }}>
                {t?.toUpperCase()}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {p.options.map((o, i) => (
              <div key={i} style={{ gridColumn: p.options.length === 3 && i === 2 ? '1 / span 2' : undefined }}>
                <Tile text={o} i={i} size={optSize} h={100} />
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Lilita One', fontSize: 46, color: C.terracottaDeep }}>{p.foot}</span>
          <Mark size={72} border={INK} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: card.x + 40, top: card.y - 40, background: YELLOW, border: `5px solid ${INK}`, boxShadow: `0 7px 0 ${INK}`, borderRadius: 20, padding: '10px 26px', transform: 'rotate(-3deg)', fontFamily: 'Lilita One', fontSize: 42, color: INK, textTransform: 'uppercase', letterSpacing: 1 }}>{p.kicker}</div>
    </AbsoluteFill>
  );
};

export const STILL_SIZES = CANVAS;
