/**
 * MethodShort — a 1080×1920 short that teaches one method change with real
 * data, animated diagrams and burned-in captions, then shows the real product
 * screen. No generated food, no fake UI.
 *
 * Why not Halyard's `TransformationDiff`: its scenes pad 12% top/bottom and
 * 72px at the sides with no right-rail reservation, so its text lands outside
 * the TikTok/Reels box this lane must hold (x 120–900, y 270–1250). This
 * composition declares that box as a constant and places every word inside it.
 * Everything outside the box is image only.
 *
 * Browser-bundled by Remotion: import nothing Node-only here (Halyard gotcha 10).
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const TEXT_BOX = { x0: 120, y0: 270, x1: 900, y1: 1250 } as const;
const BW = TEXT_BOX.x1 - TEXT_BOX.x0; // 780
/** Text inset inside the box: serif capitals (W, T) overhang their advance by a few px. */
const TX = TEXT_BOX.x0 + 8;
const TW = BW - 16;
const C = {
  cream: '#F5EDE4',
  terracotta: '#A65336',
  ink: '#27221E',
  secondary: '#60554D',
  rule: '#D9CBBE',
  sauce: '#B4532A',
  sauceDark: '#8E3E1F',
  pan: '#3A3430',
  chicken: '#C98B4E',
  char: '#5A3A22',
};

export interface Beat {
  role: string;
  kicker: string;
  onScreen: string;
  start: number;
  end: number;
}
export interface Cue {
  start: number;
  end: number;
  text: string;
}
export interface Clip {
  src: string;
  label: string;
  frames: number;
  width: number;
  height: number;
}
export interface MethodShortProps {
  beats: Beat[];
  captions: Cue[];
  audio: string | null;
  clips: Clip[];
  photo: string | null;
  photoLabel: string;
  provenance: string;
  data: { from: number; to: number; amountBefore: string; amountAfter: string; amountLabel: string; broil: string; checkAt: string };
  [key: string]: unknown;
}

const FONTS = `
@font-face{font-family:'Inter';font-weight:400;src:url('${staticFile('fonts/Inter-Regular.woff')}') format('woff');font-display:block}
@font-face{font-family:'Inter';font-weight:600;src:url('${staticFile('fonts/Inter-SemiBold.woff')}') format('woff');font-display:block}
@font-face{font-family:'Instrument Serif';font-weight:400;src:url('${staticFile('fonts/InstrumentSerif-Regular.ttf')}') format('truetype');font-display:block}
`;

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
function rise(frame: number, start: number, dur = 12, from = 0) {
  const t = interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { opacity: from + (1 - from) * t, transform: `translateY(${(1 - t) * 28}px)` };
}

/** Kicker + headline, top of the text box. */
const Head: React.FC<{ kicker: string; text: string; size?: number; light?: boolean }> = ({ kicker, text, size = 84, light = false }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: TX, top: TEXT_BOX.y0 + 10, width: TW }}>
      <div style={{ ...rise(f, 0, 8, 0.6), fontFamily: 'Inter', fontWeight: 600, fontSize: 40, letterSpacing: 3, color: light ? '#F2C9B4' : C.terracotta, textTransform: 'uppercase' }}>{kicker}</div>
      <div style={{ ...rise(f, 0, 10, 0.6), fontFamily: 'Instrument Serif', fontSize: size, lineHeight: 1.04, color: light ? 'white' : C.ink, marginTop: 14 }}>{text}</div>
    </div>
  );
};

/** The Original's licensed photo, full bleed with a slow push and a scrim; image only, label inside the text box. */
const PhotoGround: React.FC<{ src: string; label: string }> = ({ src, label }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(f, [0, durationInFrames], [1.0, 1.1]);
  return (
    <>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img src={staticFile(src)} style={{ width: 1080, height: 1920, objectFit: 'cover', transform: `scale(${z})`, transformOrigin: '60% 45%' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(20,14,10,0.80) 0%, rgba(20,14,10,0.55) 38%, rgba(20,14,10,0.55) 58%, rgba(20,14,10,0.85) 100%)' }} />
      <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 975, width: BW, fontFamily: 'Inter', fontSize: 34, lineHeight: 1.25, color: 'rgba(255,255,255,0.9)' }}>{label}</div>
    </>
  );
};

/** Visual stage: the band between the headline and the captions. */
const Stage: React.FC<{ top?: number; height?: number; children: React.ReactNode }> = ({ top = 640, height = 400, children }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // A slow push through the beat: the diagram keeps moving after its build (motion QA: freeze share).
  const z = interpolate(f, [0, durationInFrames], [1.0, 1.1]);
  return (
    <div style={{ position: 'absolute', left: 0, top, width: 1080, height, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${z})`, transformOrigin: '50% 50%' }}>{children}</div>
  );
};

const Hook: React.FC<{ b: Beat; d: MethodShortProps['data']; photo: string | null; label: string }> = ({ b, d, photo, label }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  const flip = interpolate(f, [10, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <>
      {photo ? <PhotoGround src={photo} label={label} /> : null}
      <Head kicker={b.kicker} text={b.onScreen} light={Boolean(photo)} />
      <Stage top={560} height={460}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 40, transform: `scale(${0.85 + 0.15 * s})`, fontFamily: 'Instrument Serif', color: photo ? 'white' : C.ink }}>
          <div style={{ fontSize: 300, lineHeight: 1, opacity: 1 - flip * 0.55 }}>{d.from}</div>
          <svg width="150" height="80" viewBox="0 0 150 80" style={{ opacity: flip }}>
            <path d={`M10 40 H${10 + 120 * flip}`} stroke={C.terracotta} strokeWidth="10" strokeLinecap="round" />
            <path d="M100 12 L135 40 L100 68" fill="none" stroke={C.terracotta} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity={flip} />
          </svg>
          <div style={{ fontSize: 300, lineHeight: 1, color: photo ? '#F2C9B4' : C.terracotta, opacity: flip, transform: `translateY(${(1 - flip) * 40}px)` }}>{d.to}</div>
        </div>
      </Stage>
    </>
  );
};

const Amounts: React.FC<{ b: Beat; d: MethodShortProps['data'] }> = ({ b, d }) => {
  const f = useCurrentFrame();
  const strike = interpolate(f, [14, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <Head kicker={b.kicker} text={b.onScreen} />
      <Stage top={640} height={400}>
        <div style={{ width: 640, display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter' }}>
          <div style={{ position: 'relative', alignSelf: 'flex-start', fontSize: 64, color: C.secondary, ...rise(f, 4) }}>
            {d.amountBefore} {d.amountLabel}
            <div style={{ position: 'absolute', left: 0, top: '52%', height: 6, width: `${strike * 100}%`, background: C.secondary }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, ...rise(f, 24) }}>
            <div style={{ fontSize: 76, fontWeight: 600, color: C.ink }}>{d.amountAfter} {d.amountLabel}</div>
          </div>
          <div style={{ alignSelf: 'flex-start', ...rise(f, 34), background: C.terracotta, color: 'white', fontWeight: 600, fontSize: 56, padding: '6px 26px', borderRadius: 16 }}>
            ×{(d.to / d.from).toString()}
          </div>
          {/* One plate per serving: the two new plates arrive after the maths, so the beat keeps moving. */}
          <div style={{ display: 'flex', gap: 22, marginTop: 26 }}>
            {Array.from({ length: d.to }, (_, i) => {
              const at = i < d.from ? 46 + i * 6 : 80 + (i - d.from) * 24;
              const t = interpolate(f, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
              return (
                <div key={i} style={{ width: 84, height: 84, borderRadius: 42, border: `8px solid ${i < d.from ? C.rule : C.terracotta}`, background: 'white', opacity: t, transform: `scale(${0.6 + 0.4 * t})` }} />
              );
            })}
          </div>
        </div>
      </Stage>
    </>
  );
};

/** A sheet pan seen from above with chicken pieces; `crowd` packs them tight. */
const SheetPan: React.FC<{ x: number; y: number; w: number; h: number; pieces: number; seed: number; char: number }> = ({ x, y, w, h, pieces, seed, char }) => {
  const cols = Math.ceil(Math.sqrt((pieces * w) / h));
  const rows = Math.ceil(pieces / cols);
  const items = Array.from({ length: pieces }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const jx = Math.sin(i * 12.9 + seed) * 6;
    const jy = Math.cos(i * 7.3 + seed) * 6;
    return { cx: x + 26 + ((c + 0.5) * (w - 52)) / cols + jx, cy: y + 26 + ((r + 0.5) * (h - 52)) / rows + jy, rx: Math.min(34, (w - 52) / cols / 2 + 4), ry: Math.min(26, (h - 52) / rows / 2 + 2) };
  });
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={22} fill="#9A948E" />
      <rect x={x + 10} y={y + 10} width={w - 20} height={h - 20} rx={16} fill="#C9C4BE" />
      {items.map((p, i) => (
        <g key={i}>
          <ellipse cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={C.chicken} stroke="#8E5E30" strokeWidth={2} />
          <ellipse cx={p.cx - p.rx * 0.25} cy={p.cy - p.ry * 0.2} rx={p.rx * 0.45} ry={p.ry * 0.35} fill={C.char} opacity={char} />
        </g>
      ))}
    </g>
  );
};

const Broil: React.FC<{ b: Beat; d: MethodShortProps['data'] }> = ({ b, d }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const split = interpolate(f, [Math.round(durationInFrames * 0.35), Math.round(durationInFrames * 0.35) + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const char = interpolate(f, [Math.round(durationInFrames * 0.55), durationInFrames - 6], [0, 0.85], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const one = { x: 270, y: 50, w: 540, h: 300 };
  return (
    <>
      <Head kicker={b.kicker} text={b.onScreen} />
      <Stage top={600} height={470}>
        <svg width="1080" height="470" viewBox="0 0 1080 470">
          <g opacity={1 - split}>
            <SheetPan {...one} pieces={18} seed={1} char={0} />
          </g>
          <g opacity={split} transform={`translate(${(1 - split) * 120} 0)`}>
            <SheetPan x={170} y={60} w={350} h={270} pieces={9} seed={2} char={char} />
          </g>
          <g opacity={split} transform={`translate(${(split - 1) * 120} 0)`}>
            <SheetPan x={560} y={60} w={350} h={270} pieces={9} seed={3} char={char} />
          </g>
          {[0, 1].map((k) => (
            <g key={k} opacity={split}>
              <rect x={k === 0 ? 235 : 625} y={360} width={220} height={70} rx={35} fill={C.ink} />
              <text x={k === 0 ? 345 : 735} y={407} textAnchor="middle" fontFamily="Inter" fontWeight={600} fontSize={38} fill="white">{`${d.broil} min`}</text>
            </g>
          ))}
        </svg>
      </Stage>
    </>
  );
};

const Reduce: React.FC<{ b: Beat; d: MethodShortProps['data'] }> = ({ b, d }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(f, [6, Math.round(durationInFrames * 0.55)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const trail = interpolate(f, [Math.round(durationInFrames * 0.6), Math.round(durationInFrames * 0.6) + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  // Narrow pot loses level slowly; the wide pan's surface drops faster (same volume, more surface).
  const narrowLevel = 150 - 34 * t;
  const wideLevel = 72 - 46 * t;
  return (
    <>
      <Head kicker={b.kicker} text={b.onScreen} />
      <Stage top={610} height={460}>
        <svg width="1080" height="460" viewBox="0 0 1080 460">
          {/* narrow, deep pot */}
          <rect x={150} y={70} width={230} height={230} rx={14} fill="none" stroke={C.pan} strokeWidth={12} />
          <rect x={156} y={300 - narrowLevel} width={218} height={narrowLevel - 6} fill={C.sauce} />
          {/* wide, shallow pan */}
          <rect x={470} y={190} width={470} height={110} rx={14} fill="none" stroke={C.pan} strokeWidth={12} />
          <rect x={476} y={300 - wideLevel} width={458} height={wideLevel - 6} fill={C.sauce} />
          {/* steam: more off the wide surface */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${520 + i * 75} ${180 - ((f * 2 + i * 20) % 60)} q 12 -18 0 -36`} stroke="#B9AFA6" strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.55 * (1 - trail)} />
          ))}
          {[0, 1].map((i) => (
            <path key={`n${i}`} d={`M${230 + i * 70} ${60 - ((f * 2 + i * 30) % 50)} q 10 -16 0 -30`} stroke="#B9AFA6" strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.55 * (1 - trail)} />
          ))}
          {/* the spoon trail, drawn across the wide pan's surface */}
          <path d={`M500 ${300 - wideLevel + 18} L${500 + 400 * trail} ${300 - wideLevel + 18}`} stroke={C.sauceDark} strokeWidth={14} strokeLinecap="round" opacity={trail} />
          {/* the spoon, dragged across as the trail is drawn */}
          <g opacity={trail > 0 && trail < 1 ? 1 : trail >= 1 ? 0.0 : 0} transform={`translate(${500 + 400 * trail - 20} ${300 - wideLevel - 150}) rotate(18)`}>
            <rect x={14} y={0} width={14} height={150} rx={7} fill="#8C8279" />
            <ellipse cx={21} cy={160} rx={26} ry={34} fill="#8C8279" />
          </g>
          <g opacity={trail}>
            <rect x={520} y={350} width={320} height={70} rx={35} fill={C.ink} />
            <text x={680} y={397} textAnchor="middle" fontFamily="Inter" fontWeight={600} fontSize={36} fill="white">{`check at ${d.checkAt} min`}</text>
          </g>
        </svg>
      </Stage>
    </>
  );
};

const Simmer: React.FC<{ b: Beat }> = ({ b }) => {
  // stage sits below the diff line
  const f = useCurrentFrame();
  const bubbles = Array.from({ length: 16 }, (_, i) => {
    const phase = (f * 0.9 + i * 13) % 60;
    return { cx: 360 + ((i * 97) % 360), cy: 330 - phase * 1.8, r: 9 + (i % 3) * 5, o: phase < 50 ? 0.9 : 0 };
  });
  return (
    <>
      <Head kicker={b.kicker} text={b.onScreen} />
      <Stage top={650} height={440}>
        <svg width="1080" height="440" viewBox="0 0 1080 440">
          <path d="M300 110 H780 V360 Q780 410 730 410 H350 Q300 410 300 360 Z" fill="none" stroke={C.pan} strokeWidth={14} />
          <path d="M307 180 H773 V360 Q773 403 730 403 H350 Q307 403 307 360 Z" fill="#E9D6BE" />
          {bubbles.map((p, i) => (p.cy > 190 ? <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke="#C7AE8E" strokeWidth={3} opacity={p.o} /> : null))}
          <rect x={262} y={100} width={38} height={22} rx={6} fill={C.pan} />
          <rect x={780} y={100} width={38} height={22} rx={6} fill={C.pan} />
        </svg>
      </Stage>
      <SimmerDiff />
    </>
  );
};

/** The diff primitive in motion: "hard boil" struck, "gentle simmer" arrives. */
const SimmerDiff: React.FC = () => {
  const f = useCurrentFrame();
  const strike = interpolate(f, [20, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 560, width: BW, display: 'flex', gap: 24, alignItems: 'center', fontFamily: 'Inter', fontWeight: 600, fontSize: 44 }}>
      <div style={{ position: 'relative', color: C.secondary, ...rise(f, 6) }}>
        hard boil
        <div style={{ position: 'absolute', left: 0, top: '54%', height: 5, width: `${strike * 100}%`, background: C.secondary }} />
      </div>
      <div style={{ color: C.terracotta, ...rise(f, 38) }}>→ gentle simmer</div>
    </div>
  );
};

const Proof: React.FC<{ b: Beat; clips: Clip[]; provenance: string }> = ({ b, clips, provenance }) => {
  const f = useCurrentFrame();
  let offset = 0;
  return (
    <>
      <div style={{ position: 'absolute', left: TX, top: TEXT_BOX.y0 + 10, width: TW }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, letterSpacing: 3, color: C.terracotta, textTransform: 'uppercase' }}>{b.kicker}</div>
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 64, lineHeight: 1.05, color: C.ink, marginTop: 10 }}>{b.onScreen}</div>
      </div>
      {clips.map((c) => {
        const from = offset;
        offset += c.frames;
        const scale = BW / c.width;
        return (
          <Sequence key={c.src} from={from} durationInFrames={c.frames}>
            <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 470, width: BW, fontFamily: 'Inter', fontWeight: 600, fontSize: 38, color: C.ink }}>{c.label}</div>
            <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 530, width: BW, height: c.height * scale, overflow: 'hidden', borderRadius: 20, border: `3px solid ${C.rule}`, background: 'white' }}>
              <Img
                src={staticFile(c.src)}
                style={{ width: BW, height: c.height * scale, transform: `scale(${1 + 0.03 * interpolate(f - from, [0, c.frames], [0, 1], { extrapolateRight: 'clamp' })})`, transformOrigin: '20% 20%' }}
              />
            </div>
          </Sequence>
        );
      })}
      <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 1000, width: BW, fontFamily: 'Inter', fontSize: 34, lineHeight: 1.2, color: C.secondary }}>{provenance}</div>
    </>
  );
};

const Close: React.FC<{ b: Beat; photo: string | null; label: string }> = ({ b, photo, label }) => {
  const f = useCurrentFrame();
  return (
    <>
      {photo ? <PhotoGround src={photo} label={label} /> : null}
      <div style={{ position: 'absolute', left: TX, top: TEXT_BOX.y0 + 10, width: TW }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 40, letterSpacing: 3, color: photo ? '#F2C9B4' : C.terracotta, textTransform: 'uppercase' }}>{b.kicker}</div>
        {b.onScreen.split(/(?<=\.)\s+/).map((line, i) => (
          <div key={i} style={{ ...rise(f, i * 24, 14), fontFamily: 'Instrument Serif', fontSize: 104, lineHeight: 1.04, color: photo ? 'white' : C.ink, marginTop: i === 0 ? 14 : 4 }}>{line}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 860, width: BW, ...rise(f, 60), fontFamily: 'Inter', fontWeight: 600, fontSize: 48, color: photo ? '#F2C9B4' : C.terracotta }}>recipefix.app</div>
    </>
  );
};

const Captions: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const f = useCurrentFrame();
  const cue = cues.find((c) => f >= c.start && f < c.end);
  if (!cue) return null;
  return (
    <div style={{ position: 'absolute', left: TEXT_BOX.x0, top: 1110, width: BW, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.ink, color: 'white', fontFamily: 'Inter', fontWeight: 600, fontSize: 50, lineHeight: 1.15, padding: '10px 24px', borderRadius: 14, textAlign: 'center', maxWidth: BW }}>{cue.text}</div>
    </div>
  );
};

/** A thin progress bar at the very top: image only, outside the text box. */
const Progress: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, top: 0, height: 12, width: (1080 * f) / Math.max(1, durationInFrames - 1), background: C.terracotta, zIndex: 5 }} />;
};

export const MethodShort: React.FC<MethodShortProps> = (p) => {
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <style>{FONTS}</style>
      <Progress />
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
      {p.beats.map((b) => (
        <Sequence key={`${b.role}-${b.start}`} from={b.start} durationInFrames={b.end - b.start}>
          {b.role === 'hook' ? <Hook b={b} d={p.data} photo={p.photo} label={p.photoLabel} /> : null}
          {b.role === 'amounts' ? <Amounts b={b} d={p.data} /> : null}
          {b.role === 'broil' ? <Broil b={b} d={p.data} /> : null}
          {b.role === 'reduce' ? <Reduce b={b} d={p.data} /> : null}
          {b.role === 'simmer' ? <Simmer b={b} /> : null}
          {b.role === 'proof' ? <Proof b={b} clips={p.clips} provenance={p.provenance} /> : null}
          {b.role === 'close' ? <Close b={b} photo={p.photo} label={p.photoLabel} /> : null}
        </Sequence>
      ))}
      <Captions cues={p.captions} />
    </AbsoluteFill>
  );
};
