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
  stamp: string;
  line: string;
  /** Verbatim excerpt of the source, and where the marker goes in it. */
  /** Shown before the stamp so the viewer guesses first ("What's hiding in it?"). */
  guess?: string;
  /** Show the source quote card (off by default: reviews called it "homework"). */
  showQuote?: boolean;
  quote: string;
  hlAt: number;
  hlLen: number;
  source: string;
  photo: string;
  start: number;
  end: number;
  twist?: boolean;
  audio?: string | null;
}

export interface ListShortProps {
  hook: { text: string; sub?: string; photo: string; start: number; end: number; audio?: string | null };
  items: ListItem[];
  close: { start: number; title: string; tips: Array<{ name: string; stamp: string; ok: boolean; photo?: string }>; save: string; note?: string; photo: string };
  label: string;
  sfx: { whoosh: string; reveal: string } | null;
  [key: string]: unknown;
}

const INK = '#1B1410';
const RED = '#E0483E';
const GREEN = '#1E9E57';
/** Darker stamp tones for white Inter text: #E0483E measured 4.2:1, under WCAG AA. */
const STAMP_RED = '#B8322A';
const STAMP_GREEN = '#17804A';
const W = SAFE.x1 - SAFE.x0;
/** OCR boxes around the outlined display font run ~40 px wide, so display text sits further in. */
const INSET = 44;

const useSpring = (at: number, damping = 13) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Calm motion (owner, 2026-10-27: "still moving too fast"): soft springs, short travel.
  return spring({ frame: f - at, fps, config: { damping: damping + 6, stiffness: 110, mass: 1 } });
};

/**
 * Two looks. "sticker" is the TikTok-native outlined display type; "editorial" is
 * RecipeFix's own type (Instrument Serif, the site and share cards' face) with
 * flat stamps and borderless cards. Reviews of the sticker look kept saying
 * "creator template, not brand" (2026-10-27).
 */
export type ListLook = 'sticker' | 'editorial' | 'magazine' | 'native';
const LookCtx = React.createContext<ListLook>('editorial');
const useLook = () => React.useContext(LookCtx);

/** Balanced wrapping: no orphaned last word ("…5 swaps that / work"). */
const BALANCE = { textWrap: 'balance' } as unknown as React.CSSProperties;

const serif = (size: number): React.CSSProperties => ({
  ...BALANCE,
  fontFamily: 'Instrument Serif',
  fontSize: size * 1.18,
  lineHeight: 1.0,
  letterSpacing: -0.5,
  color: '#FFFFFF',
  textShadow: '0 3px 18px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.5)',
});

/** Headline type for the current look. */
const useDisplay = () => (useLook() === 'sticker' ? display : serif);

/** Stamp (the hidden ingredient) for the current look. */
const stampStyle = (look: ListLook, tone: string, text: string, st: number): React.CSSProperties =>
  look !== 'sticker'
    ? { alignSelf: 'flex-start', background: tone === GREEN ? STAMP_GREEN : STAMP_RED, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: text.length > 10 ? 44 : 50, letterSpacing: 1, textTransform: 'uppercase', padding: '10px 20px', borderRadius: 10, transform: `scale(${interpolate(st, [0, 1], [1.4, 1])})`, transformOrigin: 'left center', opacity: Math.min(1, st * 2) }
    : { alignSelf: 'flex-start', background: tone, border: '6px solid #FFFFFF', borderRadius: 16, padding: '6px 22px 10px', ...display(text.length > 10 ? 64 : 74), transform: `rotate(-3deg) scale(${interpolate(st, [0, 1], [1.8, 1])})`, transformOrigin: 'left center', opacity: Math.min(1, st * 2), boxShadow: `0 8px 0 ${INK}` };

/** White card chrome for the current look. */
const cardChrome = (look: ListLook, radius: number): React.CSSProperties =>
  look !== 'sticker'
    ? { background: '#FFFFFF', borderRadius: radius - 6, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }
    : { background: '#FFFFFF', border: `5px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, borderRadius: radius };

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
const Photo: React.FC<{ src: string; from: number; to: number; dim?: number; punchAt?: number }> = ({ src, from, to, dim = 0.18, punchAt }) => {
  const f = useCurrentFrame();
  // A punch-in halfway through a longer beat: the text stays put while the picture changes,
  // so a readable hold never reads as a static slide (review 2026-10-27).
  const punch = punchAt === undefined ? 0 : interpolate(f, [punchAt, punchAt + 5], [0, 0.16], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 });
  const z = interpolate(f, [from, to], [1.04, 1.12], clamp) + punch;
  const slide = interpolate(f, [from, from + 14], [50, 0], clamp);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: INK }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${slide}px) scale(${z})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, rgba(15,10,8,${dim + 0.25}) 0%, rgba(15,10,8,${dim}) 40%, rgba(15,10,8,${dim}) 70%, rgba(15,10,8,0.55) 100%)` }} />
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ h: ListShortProps['hook']; label: string }> = ({ h, label }) => {
  const display = useDisplay();
  const lookH = useLook();
  const fH = useCurrentFrame();
  if (lookH === 'native') {
    const z = interpolate(fH, [h.start, h.end], [1.08, 1.0], clamp);
    const inn = interpolate(fH, [h.start, h.start + 10], [0.9, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 });
    return (
      <>
        <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
          <Img src={staticFile(h.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})` }} />
          <AbsoluteFill style={{ background: 'rgba(0,0,0,0.38)' }} />
        </AbsoluteFill>
        <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: 560, width: W - 2 * INSET, height: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <div style={{ ...CAP, fontSize: 30, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.95 }}>{label}</div>
          <div style={{ ...CAP, fontSize: h.text.length > 36 ? 88 : 100, transform: `scale(${inn})` }}>{h.text}</div>
          {h.sub ? <div style={{ ...CAP, fontSize: 48, opacity: interpolate(fH, [h.start + 12, h.start + 22], [0, 1], clamp) }}>{h.sub}</div> : null}
        </div>
      </>
    );
  }
  const a = useSpring(h.start - 30, 12);
  const b = useSpring(h.start + 10);
  return (
    <>
      <Photo src={h.photo} from={h.start} to={h.end} dim={0.12} />
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(12,8,6,0.9) 0%, rgba(12,8,6,0.78) 34%, rgba(12,8,6,0.35) 50%, rgba(12,8,6,0) 62%)' }} />
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y0 + 60, width: W - 2 * INSET }}>
        <div style={{ display: 'inline-block', background: INK, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 32, letterSpacing: 3, textTransform: 'uppercase', padding: '10px 18px', borderRadius: 10, transform: `scale(${b})`, transformOrigin: 'left center' }}>{label}</div>
        <div style={{ marginTop: 26, ...display(h.text.length > 32 ? 90 : 102), opacity: Math.min(1, a) }}>{h.text}</div>
        {h.sub ? <div style={{ marginTop: 26, display: 'inline-block', background: '#FFFFFF', color: INK, fontFamily: 'Inter', fontWeight: 700, fontSize: 40, padding: '12px 20px', borderRadius: 14, border: `5px solid ${INK}`, opacity: Math.min(1, b) }}>{h.sub}</div> : null}
      </div>
    </>
  );
};

/**
 * The proof: the source's own words, with a marker sweeping over the part that matters.
 * Reviews asked to "see the label" and called a bare source line "credibility theatre".
 */
const QuoteCard: React.FC<{ it: ListItem; at: number }> = ({ it, at }) => {
  const f = useCurrentFrame();
  const inn = useSpring(at, 15);
  const sweep = interpolate(f, [at + 8, at + 18], [0, 100], clamp);
  const pre = it.quote.slice(0, it.hlAt);
  const hl = it.quote.slice(it.hlAt, it.hlAt + it.hlLen);
  const post = it.quote.slice(it.hlAt + it.hlLen);
  return (
    <div style={{ alignSelf: 'stretch', background: '#FBF6EC', borderRadius: 18, padding: '18px 22px 20px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', borderLeft: `8px solid ${it.twist ? STAMP_GREEN : STAMP_RED}`, opacity: Math.min(1, inn * 1.5), transform: `translateY(${(1 - Math.min(1, inn)) * 40}px)` }}>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', color: '#6A5D50', marginBottom: 8 }}>{`From ${it.source}`}</div>
      <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 40, lineHeight: 1.3, color: INK }}>
        {pre}
        <span style={{ fontWeight: 600, backgroundImage: 'linear-gradient(transparent 12%, #FFD84D 12%, #FFD84D 92%, transparent 92%)', backgroundRepeat: 'no-repeat', backgroundSize: `${sweep}% 100%`, padding: '0 2px' }}>{hl}</span>
        {post}
      </div>
    </div>
  );
};

/**
 * The magazine layout: the photo framed in the top half, a paper panel below with large
 * ink type. No text over a busy photo, so the type can be big. Reviews of text-on-photo
 * kept saying "small text" and "template over phone photos" (2026-10-27).
 */
const PHOTO_BOTTOM = 720;
const BAND_H = SAFE.y1 + 40 - PHOTO_BOTTOM;
const MagazineItem: React.FC<{ it: ListItem; total: number }> = ({ it, total }) => {
  const f = useCurrentFrame();
  const tone = it.twist ? STAMP_GREEN : STAMP_RED;
  const GUESS = it.guess ? 12 : 6;
  const a = useSpring(it.start - 5);
  const st = useSpring(it.start + 7 + GUESS, 10);
  const c = interpolate(f, [it.start + 16 + GUESS, it.start + 22 + GUESS], [0, 1], clamp);
  const z = interpolate(f, [it.start, it.end], [1.04, 1.14], clamp);
  const slide = interpolate(f, [it.start - 4, it.start + 4], [60, 0], clamp);
  return (
    <>
      {/* Behind everything: the same photo, blurred and dimmed, so the strip under the band is backdrop, not dead space. */}
      <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
        <Img src={staticFile(it.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.15)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: PHOTO_BOTTOM, overflow: 'hidden' }}>
        <Img src={staticFile(it.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translateY(${slide}px) scale(${z})` }} />
      </div>
      {/* Paper band across the middle: food above and below, big ink type on clean ground. */}
      <div style={{ position: 'absolute', left: 0, top: PHOTO_BOTTOM, width: 1080, height: BAND_H, background: '#F3EADF', boxShadow: '0 -10px 30px rgba(0,0,0,0.25), 0 10px 30px rgba(0,0,0,0.25)', transform: `scaleY(${interpolate(Math.min(1, a), [0, 1], [0.9, 1])})` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: PHOTO_BOTTOM }}>
        <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y0 + 20, display: 'flex', alignItems: 'center', gap: 14, opacity: Math.min(1, a * 1.5) }}>
          <div style={{ width: 92, height: 92, borderRadius: 46, background: tone, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}>{it.twist && it.n > total ? '✓' : it.n}</div>
          <div style={{ background: 'rgba(17,17,17,0.72)', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 30, padding: '8px 14px', borderRadius: 10 }}>{it.twist && it.n > total ? "And one that's fine" : `${it.n} of ${total}`}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: PHOTO_BOTTOM + 26, width: W - 2 * INSET, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: it.name.length > 20 ? 76 : it.name.length > 14 ? 88 : 104, lineHeight: 0.98, letterSpacing: -1, color: INK, opacity: Math.min(1, a * 1.4), transform: `translateY(${(1 - Math.min(1, a)) * 30}px)` }}>{it.name}</div>
        <div style={{ position: 'relative', height: 78 }}>
          {it.guess ? <div style={{ position: 'absolute', left: 0, top: 6, fontFamily: 'Inter', fontWeight: 600, fontSize: 40, color: '#6A5D50', opacity: interpolate(f, [it.start - 2, it.start + 3, it.start + 5 + GUESS, it.start + 8 + GUESS], [0, 1, 1, 0], clamp) }}>{it.guess}</div> : null}
          <div style={{ position: 'absolute', left: 0, top: 0, ...stampStyle('magazine', it.twist ? GREEN : RED, it.stamp, st) }}>{it.stamp}</div>
        </div>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: it.line.length > 60 ? 38 : 42, lineHeight: 1.2, color: INK, opacity: c, transform: `translateY(${(1 - c) * 20}px)` }}>{it.line}</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 28, color: '#6A5D50', opacity: c }}>{`Source: ${it.source}`}</div>
      </div>
    </>
  );
};

/**
 * The proof shot: the source's own words on paper, a slow scan, the key words marked, and the
 * one-line takeaway under it. Each list item is two shots (the food, then this), so a readable
 * hold never sits on one static frame and the proof is a moment, not a footnote.
 */
const LabelShot: React.FC<{ it: ListItem; total: number; from: number }> = ({ it, total, from }) => {
  const f = useCurrentFrame();
  const inn = useSpring(from - 2, 14);
  const scan = interpolate(f, [from + 4, from + 34], [0, 1], clamp);
  const mark = interpolate(f, [from + 30, from + 44], [0, 100], clamp);
  const box = interpolate(f, [from + 40, from + 48], [0, 1], clamp);
  const take = interpolate(f, [from + 46, from + 58], [0, 1], clamp);
  const tone = it.twist ? STAMP_GREEN : STAMP_RED;
  const pre = it.quote.slice(0, it.hlAt);
  const hl = it.quote.slice(it.hlAt, it.hlAt + it.hlLen);
  const post = it.quote.slice(it.hlAt + it.hlLen);
  return (
    <>
      <AbsoluteFill style={{ background: '#F2EBE1' }} />
      {/* The food stays in view under the proof, in the band the platform's caption covers anyway. */}
      <div style={{ position: 'absolute', left: 0, top: SAFE.y1 + 40, width: 1080, height: 1920 - SAFE.y1 - 40, overflow: 'hidden', borderTop: `8px solid ${tone}` }}>
        <Img src={staticFile(it.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [from, from + 150], [1.05, 1.12], clamp)})` }} />
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y0, width: W - 2 * INSET, height: SAFE.y1 - SAFE.y0 - 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: tone, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.twist && it.n > total ? '✓' : it.n}</div>
          <div style={{ fontFamily: 'Instrument Serif', fontSize: it.name.length > 20 ? 72 : 88, lineHeight: 1, color: INK, ...BALANCE }}>{it.name}</div>
        </div>
        <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 16, padding: '22px 26px 26px', boxShadow: '0 12px 36px rgba(40,25,15,0.18)', borderLeft: `10px solid ${tone}`, overflow: 'hidden', opacity: Math.min(1, inn * 1.4), transform: `translateY(${(1 - Math.min(1, inn)) * 24}px)` }}>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', color: '#6A5D50', marginBottom: 10 }}>{`From ${it.source}`}</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 50, lineHeight: 1.3, color: INK }}>
            {pre}
            <span style={{ fontWeight: 600, backgroundImage: 'linear-gradient(transparent 10%, #FFD84D 10%, #FFD84D 92%, transparent 92%)', backgroundRepeat: 'no-repeat', backgroundSize: `${mark}% 100%`, outline: `${box * 4}px solid ${tone}`, outlineOffset: 4, borderRadius: 4 }}>{hl}</span>
            {post}
          </div>
          {scan > 0 && scan < 1 ? <div style={{ position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 6, background: tone, opacity: 0.35, boxShadow: `0 0 24px ${tone}` }} /> : null}
        </div>
        <div style={{ alignSelf: 'flex-start', ...stampStyle('editorial', it.twist ? GREEN : RED, it.stamp, 1) }}>{it.stamp}</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 58, lineHeight: 1.18, color: INK, opacity: take, transform: `translateY(${(1 - take) * 16}px)`, ...BALANCE }}>{it.line}</div>
      </div>
    </>
  );
};

/**
 * The native look (owner, 2026-10-27: "clip art and Canva, lots of blank space"): what food
 * lists on TikTok actually look like. Full-bleed picture that never stops moving, big centred
 * captions that build the line in short phrases like subtitles, no cards, boxes or paper.
 * When stock or generated footage exists, a clip replaces the still in the same slot.
 */
const CAP: React.CSSProperties = {
  fontFamily: 'Inter',
  fontWeight: 600,
  color: '#FFFFFF',
  textAlign: 'center',
  lineHeight: 1.12,
  letterSpacing: -0.5,
  textShadow: '0 3px 0 rgba(0,0,0,0.55), 0 0 22px rgba(0,0,0,0.65)',
  ...({ textWrap: 'balance' } as unknown as React.CSSProperties),
};

const NativeItem: React.FC<{ it: ListItem; total: number }> = ({ it, total }) => {
  const f = useCurrentFrame();
  const len = it.end - it.start;
  const z = interpolate(f, [it.start - 6, it.end], [1.0, 1.18], clamp);
  const pan = interpolate(f, [it.start - 6, it.end], [it.n % 2 ? -30 : 30, it.n % 2 ? 30 : -30], clamp);
  // Captions in three beats: the name, what is hidden in it, then the takeaway.
  const b1 = it.start - 4;
  const b2 = it.start + Math.round(len * 0.28);
  const b3 = it.start + Math.round(len * 0.52);
  const show = (from: number, to: number) => interpolate(f, [from, from + 8, to - 6, to], [0, 1, 1, 0], clamp);
  const pop = (from: number) => interpolate(f, [from, from + 10], [0.92, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 });
  const tone = it.twist ? STAMP_GREEN : STAMP_RED;
  return (
    <>
      <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
        <Img src={staticFile(it.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${pan}px) scale(${z})` }} />
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)' }} />
        {/* A soft band behind the caption zone: white captions held 3.9-4.5:1 over bright food without it. */}
        <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.42) 40%, rgba(0,0,0,0.42) 66%, rgba(0,0,0,0) 78%)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y0 + 10, width: W - 2 * INSET, textAlign: 'center', ...CAP, fontSize: 34, opacity: show(b1, it.end) }}>{it.twist && it.n > total ? "And one that's fine" : `${it.n} of ${total}`}</div>
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: 700, width: W - 2 * INSET, height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', ...CAP, fontSize: it.name.length > 18 ? 84 : 104, opacity: show(b1, b2), transform: `scale(${pop(b1)})` }}>{it.name}</div>
        <div style={{ position: 'absolute', ...CAP, fontSize: 64, opacity: show(b2, b3), transform: `scale(${pop(b2)})` }}>
          {it.twist ? 'It is ' : 'Hidden: '}<span style={{ color: '#FFFFFF', background: tone, padding: '0 14px', borderRadius: 10, textShadow: 'none' }}>{it.stamp.toLowerCase()}</span>
        </div>
        <div style={{ position: 'absolute', ...CAP, fontSize: it.line.length > 44 ? 60 : 68, opacity: show(b3, it.end + 6), transform: `scale(${pop(b3)})` }}>{it.line}</div>
      </div>
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y1 - 64, width: W - 2 * INSET, ...CAP, fontSize: 30, fontWeight: 600, textShadow: '0 2px 0 rgba(0,0,0,0.8), 0 0 14px rgba(0,0,0,0.9)', opacity: show(b3, it.end + 6) }}>{`Source: ${it.source}`}</div>
    </>
  );
};

const Item: React.FC<{ it: ListItem; total: number }> = ({ it, total }) => {
  const f = useCurrentFrame();
  const a = useSpring(it.start - 5);
  const b = useSpring(it.start - 2);
  const look0 = useLook();
  // The guess: the name lands with a question, the answer slams in ~0.6 s later.
  const GUESS = it.guess ? 12 : 6;
  const st = useSpring(it.start + 7 + GUESS, 10);
  const c = interpolate(f, [it.start + 16 + (it.guess ? 12 : 6), it.start + 22 + (it.guess ? 12 : 6)], [0, 1], clamp);
  const tone = it.twist ? GREEN : RED;
  const look = useLook();
  const display = useDisplay();
  // Two shots: the food, then the proof. The split sits after the name and stamp have landed.
  const split = it.start + Math.round(Math.min(2.0 * 30, (it.end - it.start) * 0.32));
  if (look === 'editorial' && f >= split) return <LabelShot it={it} total={total} from={split} />;
  return (
    <>
      <Photo src={it.photo} from={it.start} to={it.end} />
      {/* Odd items sit high, even items sit low, so five beats are not one layout five times. */}
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y0 + 10, width: W - 2 * INSET, height: SAFE.y1 - SAFE.y0 - 110, display: 'flex', flexDirection: 'column', justifyContent: it.n % 2 ? 'flex-start' : 'flex-end', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, transform: `translateX(${(1 - Math.min(1, a)) * -120}px)`, opacity: Math.min(1, a * 1.5) }}>
          <div style={{ width: 104, height: 104, flex: '0 0 104px', borderRadius: 52, background: tone, border: look === 'editorial' ? 'none' : '6px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(look === 'editorial' ? { fontFamily: 'Inter', fontWeight: 600, fontSize: it.twist ? 50 : 54, color: '#FFFFFF' } : display(it.twist ? 52 : 62)) }}>{it.twist && it.n > total ? '✓' : it.n}</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: it.twist && it.n > total ? 40 : 30, color: '#FFFFFF', textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>{it.twist && it.n > total ? "And one that's fine" : `${it.n} of ${total}`}</div>
        </div>
        <div style={{ ...display(it.name.length > 22 ? 70 : it.name.length > 14 ? 82 : 96), transform: `scale(${interpolate(b, [0, 1], [0.8, 1])})`, transformOrigin: 'left center', opacity: Math.min(1, b * 1.5) }}>{it.name}</div>
        {/* The reveal: what is hidden in it, slammed in like a stamp. */}
        {it.guess ? (
          <div style={{ position: 'relative', height: it.stamp.length > 10 ? 74 : 82 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, fontFamily: 'Inter', fontWeight: 600, fontSize: 40, color: '#FFFFFF', background: 'rgba(17,17,17,0.6)', padding: '12px 20px', borderRadius: 12, opacity: interpolate(f, [it.start - 2, it.start + 3, it.start + 5 + GUESS, it.start + 8 + GUESS], [0, 1, 1, 0], clamp) }}>{it.guess}</div>
            <div style={{ position: 'absolute', left: 0, top: 0, ...stampStyle(look, tone, it.stamp, st) }}>{it.stamp}</div>
          </div>
        ) : (
          <div style={stampStyle(look, tone, it.stamp, st)}>{it.stamp}</div>
        )}
        {look === 'editorial' && it.showQuote ? <QuoteCard it={it} at={it.start + 12 + GUESS} /> : null}
        {look === 'editorial' ? null : <div style={{ alignSelf: 'flex-start', ...cardChrome(look, 22), padding: '16px 22px', maxWidth: W - 2 * INSET, boxSizing: 'border-box', opacity: c, transform: `translateY(${(1 - c) * 24}px)` }}>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: it.line.length > 48 ? 44 : 50, lineHeight: 1.2, color: INK, ...BALANCE }}>{it.line}</div>
          
        </div>}
      </div>
      {look === 'editorial' ? null : <div style={{ position: 'absolute', left: SAFE.x0 + 6, bottom: 1920 - SAFE.y1 + 24, width: W - 12, opacity: c }}>
        <span style={{ display: 'inline-block', maxWidth: W - 12, background: 'rgba(17,17,17,0.92)', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 36, lineHeight: 1.3, padding: '10px 18px', borderRadius: 10 }}>{`Source: ${it.source}`}</span>
      </div>}
    </>
  );
};

/** The end card is something to keep: each item and what is hidden in it. */
const Close: React.FC<{ c: ListShortProps['close'] }> = ({ c }) => {
  const f = useCurrentFrame();
  const a = useSpring(c.start, 12);
  // The card arrives with its first row, so it is never an empty box.
  const card = interpolate(f, [c.start + 2, c.start + 7], [0, 1], clamp);
  const sv = interpolate(f, [c.start + 8 + c.tips.length * 3, c.start + 14 + c.tips.length * 3], [0, 1], clamp);
  const rows = c.tips.length;
  const look = useLook();
  const display = useDisplay();
  return (
    <>
      {look !== 'sticker' ? (
        <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
          <Img src={staticFile(c.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(26px) brightness(0.5)', transform: 'scale(1.15)' }} />
        </AbsoluteFill>
      ) : <Photo src={c.photo} from={c.start} to={c.start + 150} dim={0.62} />}
      <div style={{ position: 'absolute', left: SAFE.x0 + INSET, top: SAFE.y0 + 10, width: W - 2 * INSET, height: SAFE.y1 - SAFE.y0 - 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <div style={{ ...display(72), ...(look !== 'sticker' ? { fontSize: 104 } : {}), opacity: Math.min(1, a), transform: `scale(${interpolate(a, [0, 1], [0.8, 1])})`, transformOrigin: 'left center' }}>{c.title}</div>
        <div style={{ ...cardChrome(look, 26), padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: rows > 5 ? 14 : 22, opacity: card, transform: `translateY(${(1 - card) * 30}px)` }}>
          {c.tips.map((t, i) => {
            const tt = interpolate(f, [c.start + 2 + i * 3, c.start + 7 + i * 3], [0, 1], clamp);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: tt, transform: `translateX(${(1 - tt) * 40}px)` }}>
                {look !== 'sticker' && t.photo ? (
                  <div style={{ position: 'relative', width: 96, height: 96, flex: '0 0 96px' }}>
                    <Img src={staticFile(t.photo)} style={{ width: 96, height: 96, borderRadius: 16, objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', right: -8, bottom: -8, width: 40, height: 40, borderRadius: 20, background: t.ok ? STAMP_GREEN : STAMP_RED, border: '3px solid #FFFFFF', color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.ok ? '✓' : '✕'}</div>
                  </div>
                ) : (
                  <div style={{ width: 48, height: 48, flex: '0 0 48px', borderRadius: 24, background: t.ok ? GREEN : RED, color: '#FFFFFF', fontFamily: 'Lilita One', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.ok ? '✓' : '✕'}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: rows > 5 ? 44 : 50, lineHeight: 1.12, color: INK, ...BALANCE }}>{t.name.replace(/^"|"$/g, '')}</div>
                  <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: rows > 5 ? 36 : 40, lineHeight: 1.15, color: t.ok ? STAMP_GREEN : STAMP_RED }}>{t.stamp}</div>
                </div>
              </div>
            );
          })}
        </div>
        {c.note ? <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, lineHeight: 1.3, color: '#FFFFFF', opacity: sv, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>{c.note}</div> : null}
        {c.save ? <div style={{ alignSelf: 'flex-start', background: look === 'editorial' ? STAMP_RED : INK, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 600, fontSize: 42, padding: '14px 26px', borderRadius: 14, opacity: sv, transform: `scale(${interpolate(sv, [0, 1], [0.9, 1])})`, transformOrigin: 'left center' }}>{c.save}</div> : null}
      </div>
    </>
  );
};

/** The last 0.4 s fades back to the cover photo, so a replay reads as one continuous loop. */
const LoopSeam: React.FC<{ photo: string }> = ({ photo }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(f, [durationInFrames - 12, durationInFrames - 1], [0, 1], clamp);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: o, overflow: 'hidden' }}>
      <Img src={staticFile(photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.04)' }} />
    </AbsoluteFill>
  );
};

const Visible: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};

export const ListShort: React.FC<ListShortProps> = (p) => {
  const total = p.kind === 'swaps' ? p.items.length : p.items.filter((i) => !i.twist).length;
  return (
    <LookCtx.Provider value={(p.look as ListLook) ?? 'editorial'}>
    <AbsoluteFill style={{ background: INK }}>
      <style>{FONTS}</style>
      <Visible from={p.hook.start} to={p.hook.end}>
        <Hook h={p.hook} label={p.label} />
      </Visible>
      {p.items.map((it) => (
        <Visible key={it.n} from={it.start} to={it.end}>
          {((p.look as ListLook) ?? 'editorial') === 'magazine' ? <MagazineItem it={it} total={total} /> : p.look === 'native' ? <NativeItem it={it} total={total} /> : <Item it={it} total={total} />}
        </Visible>
      ))}
      <Visible from={p.close.start} to={Number.MAX_SAFE_INTEGER}>
        <Close c={p.close} />
      </Visible>
      <LoopSeam photo={p.hook.photo} />
      {p.sfx
        ? p.items.map((it) => (
            <React.Fragment key={`s${it.n}`}>
              <Sequence from={it.start} durationInFrames={15} layout="none">
                <Audio src={staticFile(p.sfx!.whoosh)} volume={0.35} />
              </Sequence>
              <Sequence from={it.start + 10} durationInFrames={20} layout="none">
                <Audio src={staticFile(p.sfx!.reveal)} volume={0.4} />
              </Sequence>
            </React.Fragment>
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
    </LookCtx.Provider>
  );
};
