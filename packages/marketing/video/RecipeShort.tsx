/**
 * RecipeShort — a RecipeFix Original in about half a minute.
 *
 *   hook (the dish, its time and yield) → everything you need → one card per
 *   method section → "need it dairy-free?" (the product, in its claim's words)
 *   → sign-off
 *
 * The photo is the Original's licensed stock photo of the dish; it is never
 * presented as RecipeFix's own. All text inside SAFE; everything said is shown.
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Boxed, C, FONTS, PhotoGround, Progress, SAFE, SAFE_W, TX, clamp, fadeIn, usePop } from './kit.js';

interface Beat {
  start: number;
  end: number;
  audio: string | null;
}

export interface RecipeShortProps {
  title: string;
  meta: string;
  kicker: string;
  photo: string;
  photoLabel: string;
  hook: Beat;
  ingredients: Beat & { groups: Array<{ title: string | null; items: string[] }> };
  steps: Array<Beat & { n: number; total: number; title: string; line: string }>;
  twist: Beat & { ask: string; line: string; diets: string[] };
  close: Beat & { headline: string; product: string };
  [key: string]: unknown;
}

const Hook: React.FC<{ p: RecipeShortProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [p.hook.start, p.hook.end], [1.02, 1.12], clamp);
  const t = usePop(p.hook.start + 3);
  const m = fadeIn(f, p.hook.start + 16, 10);
  return (
    <>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img src={staticFile(p.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, transformOrigin: '50% 45%' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(20,15,12,0.55) 0%, rgba(20,15,12,0.05) 22%, rgba(20,15,12,0.10) 42%, rgba(20,15,12,0.82) 62%, rgba(20,15,12,0.92) 100%)' }} />
      <div style={{ position: 'absolute', left: TX, top: 800, width: SAFE_W }}>
        <div style={{ opacity: t }}>
          <Boxed size={34} bg="#111111" color="#FFFFFF">
            {p.kicker}
          </Boxed>
        </div>
        <div style={{ marginTop: 26, fontFamily: 'Instrument Serif', fontSize: p.title.length > 24 ? 100 : 118, lineHeight: 0.98, color: C.white, opacity: t, transform: `translateY(${(1 - t) * 30}px)` }}>{p.title}</div>
        <div style={{ marginTop: 26, fontFamily: 'Inter', fontWeight: 600, fontSize: 44, color: C.peach, opacity: m }}>{p.meta}</div>
      </div>
      <div style={{ position: 'absolute', left: TX, top: SAFE.y0 + 4, fontFamily: 'Inter', fontSize: 24, color: 'rgba(255,255,255,0.75)' }}>{p.photoLabel}</div>
    </>
  );
};

const Ingredients: React.FC<{ p: RecipeShortProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const g = p.ingredients.groups;
  const n = g.reduce((a, x) => a + x.items.length, 0);
  const heads = g.filter((x) => x.title).length;
  // Fit the list to the card: largest size whose WRAPPED rows fit 830 px (Inter ≈ 0.54 em per char, 650 px measure).
  const items = g.flatMap((x) => x.items);
  let size = 56;
  const rowsAt = (z: number) => items.reduce((a, it) => a + Math.ceil((it.length * 0.5 * z) / 650), 0);
  while (size > 26 && rowsAt(size) * size * 1.3 + n * size * 0.24 + heads * size * 1.9 > 800) size -= 1;
  const line = Math.round(size * 1.3);
  const card = usePop(p.ingredients.start);
  let k = 0;
  return (
    <>
      <PhotoGround src={p.photo} from={p.ingredients.start} to={p.ingredients.end} strength={0.75} blur={14} />
      {/* The card hugs its content (never a fixed height, so nothing can be clipped) and sits centred in the safe box. */}
      <div style={{ position: 'absolute', left: SAFE.x0, top: SAFE.y0, width: SAFE.x1 - SAFE.x0, height: SAFE.y1 - SAFE.y0, display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          width: '100%',
          background: C.cream,
          borderRadius: 34,
          padding: '48px 48px 40px',
          boxSizing: 'border-box',
          boxShadow: '0 30px 70px rgba(0,0,0,0.4)',
          opacity: card,
          transform: `translateY(${(1 - card) * 40}px)`,
        }}
      >
        <div style={{ fontFamily: 'Instrument Serif', fontSize: 76, lineHeight: 1, color: C.ink }}>What you need</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 28, color: C.terracottaDeep, marginTop: 10, marginBottom: 18, letterSpacing: 1 }}>{`${n} INGREDIENTS · ${p.meta.toUpperCase()}`}</div>
        {g.map((grp, gi) => (
          <div key={gi}>
            {grp.title ? (
              <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: size * 0.8, color: C.terracottaDeep, marginTop: gi ? size * 0.5 : 0, height: size * 1.2, display: 'flex', alignItems: 'flex-end' }}>{grp.title}</div>
            ) : null}
            {grp.items.map((it, ii) => {
              const t = fadeIn(f, p.ingredients.start + 8 + (k++ * 32) / Math.max(8, n), 8);
              return (
                <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: size * 0.22, opacity: t, transform: `translateX(${(1 - t) * 24}px)` }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: C.terracotta, flex: '0 0 12px', marginTop: line / 2 - 6 }} />
                  <div style={{ fontFamily: 'Inter', fontSize: size, lineHeight: `${line}px`, color: C.ink }}>{it}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </>
  );
};

const Step: React.FC<{ p: RecipeShortProps; s: RecipeShortProps['steps'][number] }> = ({ p, s }) => {
  const f = useCurrentFrame();
  const a = usePop(s.start);
  const b = fadeIn(f, s.start + 10, 12);
  const pct = s.n / s.total;
  return (
    <>
      <PhotoGround src={p.photo} from={s.start} to={s.end} mode="top" zoom={[1.12 + 0.12 * (s.n % 2), 1.28 + 0.12 * (s.n % 2)]} origin={`${[50, 25, 75, 40, 60][s.n % 5]}% ${[78, 70, 85, 75, 80][s.n % 5]}%`} />
      <div style={{ position: 'absolute', left: TX, top: SAFE.y0 + 10, width: SAFE_W }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: a }}>
          <div style={{ width: 92, height: 92, borderRadius: 46, background: C.terracotta, color: C.white, fontFamily: 'Instrument Serif', fontSize: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.n}</div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, color: 'rgba(255,255,255,0.85)', letterSpacing: 2 }}>{`STEP ${s.n} OF ${s.total}`}</div>
        </div>
        <div style={{ marginTop: 40, fontFamily: 'Instrument Serif', fontSize: 104, lineHeight: 1, color: C.white, opacity: a, transform: `translateY(${(1 - a) * 26}px)` }}>{s.title}</div>
        <div style={{ marginTop: 40, fontFamily: 'Inter', fontSize: 52, lineHeight: 1.28, color: C.white, opacity: b, transform: `translateY(${(1 - b) * 18}px)` }}>{s.line}</div>
        <div style={{ marginTop: 50, display: 'flex', gap: 10 }}>
          {Array.from({ length: s.total }, (_, i) => (
            <div key={i} style={{ height: 8, flex: 1, borderRadius: 4, background: i < s.n ? C.peach : 'rgba(255,255,255,0.25)' }} />
          ))}
        </div>
      </div>
    </>
  );
};

const Twist: React.FC<{ p: RecipeShortProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const a = usePop(p.twist.start + 2);
  const b = fadeIn(f, p.twist.start + 22, 12);
  return (
    <>
      <PhotoGround src={p.photo} from={p.twist.start} to={p.twist.end} mode="top" zoom={[1.3, 1.1]} origin="50% 70%" />
      <div style={{ position: 'absolute', left: TX + 20, top: SAFE.y0 + 40, width: SAFE_W - 40, display: 'flex', flexDirection: 'column', gap: 30 }}>
        <div style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
          <Boxed size={84}>{p.twist.ask}</Boxed>
        </div>
        <div style={{ opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>
          <Boxed size={54}>{p.twist.line}</Boxed>
        </div>
      </div>
    </>
  );
};

const EndCard: React.FC<{ c: RecipeShortProps['close'] }> = ({ c }) => {
  const a = usePop(c.start + 2);
  const b = usePop(c.start + 16);
  return (
    <div style={{ position: 'absolute', left: TX + 20, top: SAFE.y0 + 110, width: SAFE_W - 40, display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <Boxed size={70}>{c.headline}</Boxed>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, opacity: b, transform: `scale(${0.85 + 0.15 * b})`, transformOrigin: 'left center' }}>
        <Img src={staticFile('brand/recipefix-mark-512.png')} style={{ width: 112, height: 112, borderRadius: 25, boxShadow: '0 8px 22px rgba(0,0,0,0.4)' }} />
        <Boxed size={46} bg="#111111" color="#FFFFFF">
          {c.product}
        </Boxed>
      </div>
    </div>
  );
};

export const RecipeShort: React.FC<RecipeShortProps> = (p) => {
  const f = useCurrentFrame();
  const at = (b: Beat) => f >= b.start && f < b.end;
  const beats: Beat[] = [p.hook, p.ingredients, ...p.steps, p.twist, p.close];
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <style>{FONTS}</style>
      {at(p.hook) ? <Hook p={p} /> : null}
      {at(p.ingredients) ? <Ingredients p={p} /> : null}
      {p.steps.map((s, i) => (at(s) ? <Step key={i} p={p} s={s} /> : null))}
      {at(p.twist) ? <Twist p={p} /> : null}
      {f >= p.close.start ? (
        <>
          <PhotoGround src={p.photo} from={p.close.start} to={p.close.end} mode="top" zoom={[1.0, 1.08]} origin="50% 60%" />
          <EndCard c={p.close} />
        </>
      ) : null}
      <Progress />
      {beats.map((b, i) =>
        b.audio ? (
          <Sequence key={i} from={b.start + 3} layout="none">
            <Audio src={staticFile(b.audio)} />
          </Sequence>
        ) : null,
      )}
    </AbsoluteFill>
  );
};
