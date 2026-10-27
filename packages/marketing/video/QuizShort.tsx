/**
 * QuizShort v4: the game-show template the genre actually uses.
 *
 * Built from the storyboards of the most-viewed food quiz videos on YouTube
 * (Quiz Blitz 9.2M, Monkey Quiz 18M, Daily Quiz 6.9M, Guessers 4.5M; pulled
 * 2026-10-26, notes in packages/marketing/QUIZ_FORMAT_RESEARCH.md). What they share, and what
 * this does:
 *  - a bright solid background with a faint drifting pattern, a new colour per question
 *  - the food picture as the hero, in a white rounded card
 *  - chunky outlined display type (Lilita One), a question-number badge, a channel mark
 *  - a horizontal timer bar with a mascot riding it: here the RecipeFix icon
 *  - big 3D answer buttons; on the reveal the right one goes green with a burst,
 *    the answer lands in huge type, the rest grey out
 * The flop in the same sample (dark ground, small spaced type) is what the
 * earlier versions of this file looked like.
 *
 * Every text box sits in SAFE (TikTok ∩ Reels).
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, SAFE, clamp } from './kit.js';

export interface QuizQuestionProps {
  question: string;
  options: string[];
  correct: number;
  why: string;
  source: string;
  photo: string;
  start: number;
  countdownAt: number;
  revealAt: number;
  whyAt: number;
  end: number;
  audio: { question: string | null; answer: string | null; why: string | null };
}

export interface QuizShortProps {
  label: string;
  questions: QuizQuestionProps[];
  close: { start: number; tie: string; audio: string | null; photo: string };
  sfx: { tick: string; reveal: string } | null;
  [key: string]: unknown;
}

const INK = '#1B1410';
const GREEN = '#1E9E57';
const RED = '#E0483E';
const GREY = '#B9B2AC';
/** Brand terracotta plus four warm, saturated grounds; one per question, in order. */
const GROUNDS = ['#E07A3F', '#2A9D8F', '#E9A93B', '#C8553D', '#5B8E3E'];
const BADGE = ['#E0483E', '#3B7DD8', '#E9A93B', '#1E9E57'];
const LETTERS = ['A', 'B', 'C', 'D'];
const CX = (SAFE.x0 + SAFE.x1) / 2;
const W = SAFE.x1 - SAFE.x0;

const useSpring = (at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 12, stiffness: 180, mass: 0.9, ...cfg } });
};

/** Display type: white, dark outline, hard drop shadow (the genre's look). */
const display = (size: number, color = '#FFFFFF'): React.CSSProperties => ({
  fontFamily: 'Lilita One',
  fontSize: size,
  lineHeight: 1.08,
  color,
  WebkitTextStroke: `${Math.max(3, size * 0.07)}px ${INK}`,
  paintOrder: 'stroke fill',
  textShadow: `0 ${size * 0.07}px 0 rgba(0,0,0,0.28)`,
  letterSpacing: 0.5,
});

/** Solid ground + faint drifting "?" pattern. */
const Ground: React.FC<{ color: string }> = ({ color }) => {
  const f = useCurrentFrame();
  const drift = (f * 0.6) % 160;
  const marks = [];
  for (let r = -1; r < 14; r++)
    for (let c = -1; c < 8; c++)
      marks.push(
        <div key={`${r}-${c}`} style={{ position: 'absolute', left: c * 160 + (r % 2) * 80 - drift, top: r * 150 + drift * 0.5, fontFamily: 'Lilita One', fontSize: 64, color: 'rgba(255,255,255,0.10)', transform: `rotate(${((r * 7 + c * 13) % 30) - 15}deg)` }}>
          {(r + c) % 3 === 0 ? '?' : '•'}
        </div>,
      );
  return <AbsoluteFill style={{ background: color, overflow: 'hidden' }}>{marks}</AbsoluteFill>;
};

/** Top row: question badge, title banner, RecipeFix mark (the channel's corner logo). */
const TopBar: React.FC<{ label: string; n: number | null; at: number }> = ({ label, n, at }) => {
  const s = useSpring(at, { damping: 14 });
  return (
    <div style={{ position: 'absolute', left: SAFE.x0, top: SAFE.y0 + 6, width: W, height: 96, display: 'flex', alignItems: 'center', gap: 16 }}>
      {n !== null ? (
        <div style={{ width: 84, height: 84, flex: '0 0 84px', borderRadius: 42, background: RED, border: '5px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(46), transform: `scale(${s})` }}>{n}</div>
      ) : null}
      <div style={{ flex: 1, height: 84, borderRadius: 22, background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 7px 0 ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(-1.5deg) scale(${interpolate(s, [0, 1], [0.6, 1])})` }}>
        <span style={{ fontFamily: 'Lilita One', fontSize: 46, color: INK, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 84, height: 84, borderRadius: 20, border: '5px solid #FFFFFF', boxShadow: `0 7px 0 ${INK}`, transform: `scale(${s})` }} />
    </div>
  );
};

const PhotoCard: React.FC<{ src: string; at: number; top: number; height: number; width?: number; answer: string | null; answerAt: number; tone?: string }> = ({ src, at, top, height, width = 680, answer, answerAt, tone = GREEN }) => {
  const f = useCurrentFrame();
  const s = useSpring(at, { damping: 11 });
  const a = useSpring(answerAt, { damping: 9, stiffness: 240 });
  const w = width;
  return (
    <div style={{ position: 'absolute', left: CX - w / 2, top, width: w, height, transform: `rotate(${interpolate(s, [0, 1], [-4, 0.8])}deg) scale(${s})` }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', border: '10px solid #FFFFFF', boxShadow: `0 10px 0 ${INK}, 0 24px 50px rgba(0,0,0,0.3)`, background: '#FFFFFF', boxSizing: 'border-box' }}>
        <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [at, at + 300], [1.0, 1.12], clamp)})` }} />
      </div>
      {answer && f >= answerAt ? (
        <div style={{ position: 'absolute', left: -40, right: -40, top: -46, display: 'flex', justifyContent: 'center', transform: `scale(${interpolate(a, [0, 1], [2.2, 1])}) rotate(-3deg)`, opacity: Math.min(1, a * 2) }}>
          <span style={{ ...display(answer.length > 14 ? 70 : 88), background: tone, padding: '6px 34px 10px', borderRadius: 26, border: `6px solid ${INK}`, boxShadow: `0 8px 0 ${INK}` }}>{answer}</span>
        </div>
      ) : null}
    </div>
  );
};

/** Timer bar: drains green → amber → red; the RecipeFix icon rides its edge. */
const TimerBar: React.FC<{ at: number; len: number; top: number }> = ({ at, len, top }) => {
  const f = useCurrentFrame();
  const show = useSpring(at - 6);
  if (f < at - 6 || f >= at + len) return null;
  const k = Math.max(0, Math.min(1, (f - at) / len));
  const fill = 1 - k;
  const color = fill > 0.5 ? GREEN : fill > 0.22 ? '#F2A71B' : RED;
  const w = 640;
  const bounce = Math.abs(Math.sin(((f - at) / 30) * Math.PI)) * 14;
  return (
    <div style={{ position: 'absolute', left: CX - w / 2, top, width: w, height: 40, opacity: Math.min(1, show) }}>
      <div style={{ width: '100%', height: 40, borderRadius: 20, background: '#FFFFFF', border: `5px solid ${INK}`, overflow: 'hidden', boxSizing: 'border-box' }}>
        <div style={{ width: `${fill * 100}%`, height: '100%', background: color, borderRadius: 16 }} />
      </div>
      <Img
        src={staticFile('brand/recipefix-mark-512.png')}
        style={{ position: 'absolute', left: Math.max(0, fill * w - 40), top: -46 - bounce, width: 76, height: 76, borderRadius: 18, border: `4px solid ${INK}`, transform: `rotate(${Math.sin(f / 4) * 8}deg)` }}
      />
    </div>
  );
};

const Burst: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < 0 || t > 26) return null;
  const colors = ['#FFFFFF', '#F2C94C', GREEN, '#E07A3F', '#3B7DD8'];
  return (
    <>
      {Array.from({ length: 22 }, (_, i) => {
        const ang = (i / 22) * Math.PI * 2 + (i % 3) * 0.2;
        const v = 16 + (i % 5) * 5;
        const px = x + Math.cos(ang) * v * t;
        const py = y + Math.sin(ang) * v * t + 0.9 * t * t;
        return <div key={i} style={{ position: 'absolute', left: px, top: py, width: 16, height: 26, borderRadius: 4, background: colors[i % 5], opacity: 1 - t / 26, transform: `rotate(${i * 40 + t * 22}deg)` }} />;
      })}
    </>
  );
};

const Button: React.FC<{ text: string; size: number; i: number; state: 'idle' | 'right' | 'wrong'; at: number; revealAt: number }> = ({ text, size, i, state, at, revealAt }) => {
  const f = useCurrentFrame();
  const s = useSpring(at + i * 4, { damping: 11 });
  const pop = useSpring(revealAt, { damping: 8, stiffness: 260 });
  const right = state === 'right';
  const wrong = state === 'wrong';
  const shake = wrong && f >= revealAt && f < revealAt + 10 ? Math.sin((f - revealAt) * 2.6) * 8 * (1 - (f - revealAt) / 10) : 0;
  return (
    <div
      style={{
        height: 104,
        borderRadius: 24,
        background: right ? GREEN : wrong ? '#EDE7E2' : '#FFFFFF',
        border: `5px solid ${INK}`,
        boxShadow: `0 8px 0 ${INK}`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 18px 0 14px',
        boxSizing: 'border-box',
        transform: `translateX(${shake}px) scale(${s * (right ? interpolate(pop, [0, 1], [1, 1.06]) : 1)})`,
        opacity: wrong ? 0.75 : 1,
      }}
    >
      <div style={{ width: 62, height: 62, flex: '0 0 62px', borderRadius: 31, background: right ? '#FFFFFF' : wrong ? GREY : BADGE[i], border: `4px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Lilita One', fontSize: 38, color: right ? GREEN : '#FFFFFF' }}>
        {right ? '✓' : wrong ? '✕' : LETTERS[i]}
      </div>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: size, lineHeight: 1.05, whiteSpace: 'nowrap', color: right ? '#FFFFFF' : wrong ? '#6E645D' : INK }}>{text}</div>
    </div>
  );
};

const BigChoice: React.FC<{ text: string; tone: string; state: 'idle' | 'right' | 'wrong'; at: number; revealAt: number }> = ({ text, tone, state, at, revealAt }) => {
  const s = useSpring(at, { damping: 10 });
  const pop = useSpring(revealAt, { damping: 8, stiffness: 260 });
  const right = state === 'right';
  const wrong = state === 'wrong';
  return (
    <div
      style={{
        width: 250,
        height: 250,
        borderRadius: 125,
        background: wrong ? GREY : tone,
        border: '8px solid #FFFFFF',
        boxShadow: `0 10px 0 ${INK}, 0 0 0 6px ${INK}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...display(62),
        transform: `scale(${s * (right ? interpolate(pop, [0, 1], [1, 1.16]) : wrong ? 0.86 : 1)})`,
      }}
    >
      {text}
    </div>
  );
};

const Question: React.FC<{ q: QuizQuestionProps; label: string; index: number; total: number; color: string }> = ({ q, label, index, total, color }) => {
  const f = useCurrentFrame();
  const revealed = f >= q.revealAt;
  const why = f >= q.whyAt;
  const twoWay = q.options.length === 2;
  const qSpring = useSpring(q.start + 4, { damping: 13 });
  // The first question is the cover: on screen from frame 0, no entrance.
  const qIn = q.start === 0 ? 1 : qSpring;
  const optOut = interpolate(f, [q.whyAt, q.whyAt + 8], [1, 0], clamp);
  const whyIn = useSpring(q.whyAt + 4, { damping: 13 });
  // Largest size whose wrapped lines fit the 196 px question box (Lilita ≈ 0.5 em per character).
  const qText = twoWay ? `“${q.question}”` : q.question;
  let qSize = 84;
  while (qSize > 46 && Math.ceil((qText.length * 0.6 * qSize) / (W - 40)) * qSize * 1.12 > 196) qSize -= 2;
  // Buttons never wrap: one size for all four, from the longest label.
  const longest = Math.max(...q.options.map((o) => o.length));
  const optSize = Math.min(44, Math.floor((q.options.length > 2 ? 262 : 560) / (longest * 0.55)));
  const state = (i: number) => (!revealed ? 'idle' : i === q.correct ? 'right' : 'wrong') as 'idle' | 'right' | 'wrong';
  // Layout (owner + reviewer, 2026-10-26): question and answers up top, the dish fills the lower half.
  const OPT = 606;
  const PHOTO_TOP = 940;
  const PHOTO_H = 540;
  return (
    <>
      <Ground color={color} />
      <TopBar label={label} n={total > 1 ? index + 1 : null} at={q.start} />
      <div style={{ position: 'absolute', left: SAFE.x0 + 10, top: 392, width: W - 20, height: 196, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...display(qSize), opacity: Math.min(1, qIn), transform: `scale(${interpolate(qIn, [0, 1], [0.7, 1])})` }}>
        {qText}
      </div>
      <PhotoCard src={q.photo} at={q.start === 0 ? -30 : q.start + 8} top={PHOTO_TOP} height={PHOTO_H} width={880} answer={twoWay ? q.options[q.correct]!.toUpperCase() : q.options[q.correct]!} answerAt={q.revealAt} tone={twoWay && /myth|false|no/i.test(q.options[q.correct]!) ? RED : GREEN} />
      {!revealed ? <TimerBar at={q.countdownAt} len={q.revealAt - q.countdownAt} top={OPT + (twoWay ? 268 : 250)} /> : null}
      {twoWay ? (
        <div style={{ position: 'absolute', left: SAFE.x0, top: OPT - 4, width: W, display: 'flex', justifyContent: 'space-evenly', opacity: optOut }}>
          {q.options.map((o, i) => (
            <BigChoice key={o} text={o.toUpperCase()} tone={/myth|false|no/i.test(o) ? RED : GREEN} state={state(i)} at={q.start === 0 ? -20 : q.start + 14 + i * 5} revealAt={q.revealAt} />
          ))}
        </div>
      ) : (
        <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: OPT, width: W - 12, display: 'grid', gridTemplateColumns: q.options.length > 2 ? '1fr 1fr' : '1fr', gap: 14, opacity: optOut }}>
          {q.options.map((o, i) => (
            <div key={i} style={{ gridColumn: q.options.length === 3 && i === 2 ? '1 / span 2' : undefined }}>
              <Button text={o} size={optSize} i={i} state={state(i)} at={q.start === 0 ? -20 : q.start + 14} revealAt={q.revealAt} />
            </div>
          ))}
        </div>
      )}
      {revealed && !twoWay ? <Burst at={q.revealAt} x={CX} y={PHOTO_TOP} /> : null}
      {revealed && twoWay ? <Burst at={q.revealAt} x={CX} y={PHOTO_TOP} /> : null}
      {why ? (
        <div
          style={{
            position: 'absolute',
            left: SAFE.x0 + 6,
            top: OPT,
            width: W - 12,
            background: '#FFFFFF',
            borderRadius: 28,
            border: `5px solid ${INK}`,
            boxShadow: `0 8px 0 ${INK}`,
            padding: '20px 26px 18px',
            boxSizing: 'border-box',
            opacity: Math.min(1, whyIn),
            transform: `translateY(${(1 - Math.min(1, whyIn)) * 60}px)`,
          }}
        >
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: q.why.length > 100 ? 34 : 38, lineHeight: 1.26, color: INK }}>{q.why}</div>
          <div style={{ marginTop: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 27, color: '#6E645D' }}>{`Source: ${q.source}`}</div>
        </div>
      ) : null}
    </>
  );
};

/** RecipeFix, once, tied to the fact. */
const Close: React.FC<{ c: QuizShortProps['close']; color: string }> = ({ c, color }) => {
  const a = useSpring(c.start + 2, { damping: 12 });
  const b = useSpring(c.start + 14, { damping: 10 });
  return (
    <>
      <Ground color={color} />
      <div style={{ position: 'absolute', left: CX - 140, top: SAFE.y0 + 30, width: 280, height: 280, transform: `scale(${b}) rotate(${interpolate(b, [0, 1], [-20, -4])}deg)` }}>
        <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 280, height: 280, borderRadius: 64, border: '10px solid #FFFFFF', boxShadow: `0 12px 0 ${INK}`, boxSizing: 'border-box' }} />
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + 6, top: SAFE.y0 + 370, width: W - 12, background: '#FFFFFF', borderRadius: 30, border: `5px solid ${INK}`, boxShadow: `0 9px 0 ${INK}`, padding: '26px 30px', boxSizing: 'border-box', opacity: Math.min(1, a), transform: `translateY(${(1 - Math.min(1, a)) * 60}px)` }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 46, lineHeight: 1.22, color: INK }}>{c.tie}</div>
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0, top: SAFE.y0 + 720, width: W, textAlign: 'center', ...display(78), opacity: Math.min(1, b) }}>recipefix.app</div>
    </>
  );
};

const Visible: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};

export const QuizShort: React.FC<QuizShortProps> = (p) => (
  <AbsoluteFill style={{ background: GROUNDS[0] }}>
    <style>{FONTS}</style>
    {p.questions.map((q, i) => (
      <Visible key={`q${i}`} from={q.start} to={q.end}>
        <Question q={q} label={p.label} index={i} total={p.questions.length} color={GROUNDS[i % GROUNDS.length]!} />
      </Visible>
    ))}
    <Visible from={p.close.start} to={Number.MAX_SAFE_INTEGER}>
      <Close c={p.close} color={GROUNDS[p.questions.length % GROUNDS.length]!} />
    </Visible>
    {p.questions.map((q, i) => {
      const secs = Math.round((q.revealAt - q.countdownAt) / 30);
      return (
        <React.Fragment key={`a${i}`}>
          {q.audio.question ? (
            <Sequence from={q.start + 4} layout="none">
              <Audio src={staticFile(q.audio.question)} />
            </Sequence>
          ) : null}
          {p.sfx
            ? Array.from({ length: secs }, (_, k) => (
                <Sequence key={k} from={q.countdownAt + k * 30} durationInFrames={12} layout="none">
                  <Audio src={staticFile(p.sfx!.tick)} volume={k >= secs - 2 ? 0.8 : 0.5} />
                </Sequence>
              ))
            : null}
          {p.sfx ? (
            <Sequence from={q.revealAt} durationInFrames={30} layout="none">
              <Audio src={staticFile(p.sfx.reveal)} volume={0.65} />
            </Sequence>
          ) : null}
          {q.audio.answer ? (
            <Sequence from={q.revealAt + 6} layout="none">
              <Audio src={staticFile(q.audio.answer)} />
            </Sequence>
          ) : null}
          {q.audio.why ? (
            <Sequence from={q.whyAt} layout="none">
              <Audio src={staticFile(q.audio.why)} />
            </Sequence>
          ) : null}
        </React.Fragment>
      );
    })}
    {p.close.audio ? (
      <Sequence from={p.close.start + 4} layout="none">
        <Audio src={staticFile(p.close.audio)} />
      </Sequence>
    ) : null}
  </AbsoluteFill>
);
