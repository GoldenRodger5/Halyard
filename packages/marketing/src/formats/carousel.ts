/**
 * Instagram carousel, 1080×1350: the copy contract and the slide renderer.
 *
 * Rendered with `@halyard/render`'s Satori path (`renderElement`, its bundled
 * fonts, `box`/`text`/`arrowRight`). The existing `carousel_6` layouts set the
 * kicker, counter and wordmark at 26px, below the 36px secondary minimum in
 * QUALITY_AND_OPERATIONS §2, and do not expose where text sits; so these slides
 * declare their REGIONS as constants, the QA reads text back from the PNG and
 * checks every word landed inside its slide's safe box.
 */
import { arrowRight, box, renderElement, text, type SatoriElement } from '@halyard/render';
import { verifyClaims } from '@halyard/core/qc';
import type { CopyLine } from '../copyGate.js';

export const W = 1080;
export const H = 1350;
export const MX = 72;

/** RecipeFix marketing palette (knowledge/brand.md §2). */
export const PALETTE = {
  cream: '#F5EDE4',
  terracotta: '#A65336',
  ink: '#27221E',
  secondary: '#60554D',
  rule: '#D9CBBE',
  white: '#FFFFFF',
};

export const SIZES = { kicker: 38, footer: 36, headline: 96, coverHeadline: 100, body: 54, why: 50, struck: 46, label: 38, pill: 42 } as const;

/** Instagram feed: ≥60px from the sides (the 3:4 grid shows the centre 1012px), and clear of the slide edges. */
/**
 * Read-back bar for struck-through lines. The strike crosses every glyph at
 * mid x-height, so OCR recall on the cleaned copy is poor: measured 0.73–0.90
 * on renders verified correct by eye (2026-10-26, longer quoted lines score
 * lowest). Lowered from 0.80 to 0.70 after the "As written" quotes; the line
 * is still checked, against this recorded bar. Unstruck lines stay at 0.95.
 */
export const STRUCK_MIN = 0.7;

/** The source recipe is RecipeFix's own Original, quoted at the commit the proof is pinned to. */
export const AS_WRITTEN_LABEL = 'As written (serves 4)';

export const SAFE_BOX = { x0: 60, y0: 48, x1: W - 60, y1: H - 32 };

export interface CarouselCopy {
  slides: Array<
    | { role: 'cover'; kicker: string; headline: string; photo_label: string; claim_ids?: string[]; fact_ids?: string[] }
    | { role: 'swaps'; kicker: string; headline: string; rows: Array<{ before: string; after: string }>; claim_ids?: string[]; fact_ids?: string[] }
    | {
        role: 'method';
        kicker: string;
        headline: string;
        /** The Original's own words, quoted (director review 2026-10-26: never an invented counterfactual). */
        as_written: string;
        /** Strike only when the rewrite replaces it; false when RecipeFix only added the reason. */
        as_written_struck?: boolean;
        rewrite_label?: string;
        rewrite: string;
        why: string;
        source: string;
        claim_ids?: string[];
        fact_ids?: string[];
      }
    | { role: 'proof'; kicker: string; headline: string; recap: string[]; claim_ids?: string[]; fact_ids?: string[] }
  >;
  caption: string;
  hashtags: string[];
  caption_claim_ids?: string[];
  caption_fact_ids?: string[];
}

export const LIMITS = {
  kicker: 32,
  headline: 52,
  coverHeadline: 56,
  photo_label: 64,
  before: 30,
  after: 32,
  as_written: 72,
  rewrite: 56,
  why: 84,
  recap: 28,
};

export const CAROUSEL_SCHEMA = `Reply with this JSON object and nothing else:
{
  "slides": [
    {"role":"cover","kicker":"≤${LIMITS.kicker} chars","headline":"≤${LIMITS.coverHeadline} chars","photo_label":"≤${LIMITS.photo_label} chars","claim_ids":[],"fact_ids":[]},
    {"role":"swaps","kicker":"…","headline":"≤${LIMITS.headline}","rows":[{"before":"≤${LIMITS.before}","after":"≤${LIMITS.after}"}],"claim_ids":[],"fact_ids":[]},
    {"role":"method","kicker":"…","headline":"≤${LIMITS.headline}","as_written":"≤${LIMITS.as_written}: the Original recipe's own words for this step, quoted","rewrite":"≤${LIMITS.rewrite}: what the rewritten step says to do","why":"≤${LIMITS.why}: the reason, in the step's own terms","source":"1 to 3 comma-separated proof paths that together support rewrite+why, e.g. steps[4].updated_note, steps[4].instruction","claim_ids":[],"fact_ids":[]},
    … one object per slide in the order given …,
    {"role":"proof","kicker":"…","headline":"≤${LIMITS.headline}","recap":["≤${LIMITS.recap}","≤${LIMITS.recap}","≤${LIMITS.recap}"],"claim_ids":[],"fact_ids":[]}
  ],
  "caption": "Instagram caption, 60–140 words, useful on its own, ends with one line pointing to the link in bio",
  "hashtags": ["3 to 5 specific tags, no #"],
  "caption_claim_ids": [],
  "caption_fact_ids": []
}
Rules for the fields:
- Any sentence that mentions RecipeFix, the app or Plus must list a quotable claim id in that slide's claim_ids.
- fact_ids lists the FACT SOURCES whose numbers a slide uses (numbers copied from the PROOF need none).
- No em dashes, no ellipses, no exclamation marks. Write "8 to 10 minutes", not "8-10 min".
- kicker is a short label, not a sentence. Uppercase is applied by the renderer; write it in sentence case.`;

/** Everything a viewer reads, as gate lines. */
export function carouselLines(copy: CarouselCopy): CopyLine[] {
  const lines: CopyLine[] = [];
  copy.slides.forEach((s, i) => {
    const at = (f: string) => `slide ${i + 1} ${f}`;
    const ids = { claimIds: s.claim_ids ?? [], factIds: s.fact_ids ?? [] };
    lines.push({ where: at('kicker'), text: s.kicker, ...ids }, { where: at('headline'), text: s.headline, ...ids });
    if (s.role === 'cover') lines.push({ where: at('photo label'), text: s.photo_label, ...ids });
    if (s.role === 'swaps') s.rows.forEach((r, j) => lines.push({ where: at(`row ${j + 1}`), text: `${r.before} → ${r.after}`, ...ids }));
    if (s.role === 'method') {
      lines.push({ where: at('as written'), text: s.as_written, ...ids }, { where: at('rewrite'), text: s.rewrite, ...ids }, { where: at('why'), text: s.why, ...ids });
    }
    if (s.role === 'proof') s.recap.forEach((r, j) => lines.push({ where: at(`recap ${j + 1}`), text: r, ...ids }));
  });
  return lines;
}

/** Shape, length and proof-support checks specific to this format. */
export function carouselShapeProblems(
  copy: CarouselCopy,
  expectedRoles: string[],
  proof: Record<string, unknown>,
  neverShow: string[],
): string[] {
  const p: string[] = [];
  if (!Array.isArray(copy.slides)) return ['slides is not an array'];
  const roles = copy.slides.map((s) => s.role);
  if (roles.join(',') !== expectedRoles.join(',')) p.push(`slide roles must be exactly [${expectedRoles.join(', ')}], got [${roles.join(', ')}]`);
  const len = (where: string, value: unknown, max: number) => {
    if (typeof value !== 'string' || !value.trim()) p.push(`${where} is empty`);
    else if (value.length > max) p.push(`${where} is ${value.length} chars; max ${max}`);
  };
  copy.slides.forEach((s, i) => {
    const at = `slide ${i + 1}`;
    len(`${at} kicker`, s.kicker, LIMITS.kicker);
    len(`${at} headline`, s.headline, s.role === 'cover' ? LIMITS.coverHeadline : LIMITS.headline);
    if (s.role === 'cover') len(`${at} photo_label`, s.photo_label, LIMITS.photo_label);
    if (s.role === 'swaps') {
      if (!Array.isArray(s.rows) || s.rows.length !== 3) p.push(`${at} needs exactly 3 rows`);
      else s.rows.forEach((r, j) => (len(`${at} row ${j + 1} before`, r.before, LIMITS.before), len(`${at} row ${j + 1} after`, r.after, LIMITS.after)));
    }
    if (s.role === 'method') {
      len(`${at} as_written`, s.as_written, LIMITS.as_written);
      len(`${at} rewrite`, s.rewrite, LIMITS.rewrite);
      len(`${at} why`, s.why, LIMITS.why);
      const support = supportedBy(`${s.rewrite} ${s.why}`, s.source, proof);
      if (support) p.push(`${at}: ${support}`);
    }
    if (s.role === 'proof') {
      if (!Array.isArray(s.recap) || s.recap.length !== 3) p.push(`${at} recap needs exactly 3 items`);
      else s.recap.forEach((r, j) => len(`${at} recap ${j + 1}`, r, LIMITS.recap));
    }
  });
  if (!Array.isArray(copy.hashtags) || copy.hashtags.length < 3 || copy.hashtags.length > 5) p.push('hashtags: 3 to 5 required (Instagram cap is 5)');
  const everything = JSON.stringify(copy).toLowerCase();
  for (const banned of neverShow) {
    const core = banned.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (everything.replace(/[^a-z0-9]+/g, ' ').includes(core)) p.push(`must never show "${banned}"`);
  }
  return p;
}

/**
 * Whether `claim` is supported by the proof at `sources` (1–3 comma-separated
 * paths, read together). Uses Halyard's claim verifier unchanged: every path
 * must resolve, and the joined text must support the claim — including every
 * number in it, which the verifier treats as disqualifying when absent.
 */
export function supportedBy(claim: string, sources: string, proof: Record<string, unknown>): string | null {
  const paths = String(sources ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (paths.length === 0 || paths.length > 3) return `source must list 1 to 3 proof paths, got "${sources}"`;
  const joined: string[] = [];
  for (const path of paths) {
    const one = verifyClaims([{ text: 'x', source: path }], proof).results[0]!;
    if (one.verdict === 'unresolvable_path') return `source path ${path} does not resolve against the proof`;
    joined.push(one.resolved ?? '');
  }
  const r = verifyClaims([{ text: claim, source: 'joined' }], { joined: joined.join(' ') }).results[0]!;
  return r.verdict === 'verified' ? null : `"${claim}" is ${r.verdict} by ${paths.join(' + ')} (support ${r.support}); every number and most content words must appear there`;
}

// ─── rendering ────────────────────────────────────────────────────────────────

export interface SlideAssets {
  /** JPEG data URI, already cropped to W×H. */
  coverPhoto: string;
  /** Real product screen crops per slide index (0-based), already sized to render width. */
  shots: Record<number, Array<{ uri: string; width: number; height: number }>>;
}

/** A real RecipeFix screen crop: rounded, hairline border, soft shadow. Never a drawn device frame. */
function screen(shot: { uri: string; width: number; height: number }, marginTop = 30): SatoriElement {
  return box(
    {
      marginTop, width: shot.width, height: shot.height, borderRadius: 24, overflow: 'hidden',
      borderWidth: 2, borderStyle: 'solid', borderColor: PALETTE.rule, boxShadow: '0 18px 40px rgba(39,34,30,0.16)',
    },
    { type: 'img', props: { src: shot.uri, style: { width: shot.width, height: shot.height } } } as SatoriElement,
  );
}

export interface RenderedSlide {
  index: number;
  role: string;
  png: Buffer;
  /** Regions text is allowed in, for the safe-zone check. */
  safeBox: typeof SAFE_BOX;
  /** Every string drawn, for the text read-back. */
  intended: Array<string | { text: string; min?: number }>;
  /** Background colour behind body text (cream slides), or null when text sits on a photo/scrim. */
  ground: string | null;
}

const kickerText = (s: string, color: string) =>
  text(s.toUpperCase(), { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.kicker, letterSpacing: 3, color });

function footer(index: number, total: number, provenance: string, onPhoto = false): SatoriElement {
  const color = onPhoto ? 'rgba(255,255,255,0.86)' : PALETTE.secondary;
  return box(
    { position: 'absolute', left: MX, right: MX, bottom: 52, justifyContent: 'space-between', alignItems: 'center' },
    text(provenance, { fontFamily: 'Inter', fontSize: SIZES.footer, color }),
    text(`${index}/${total}`, { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.footer, color }),
  );
}

/**
 * A cream slide: the content group is centred in the space above the footer,
 * so a short slide does not leave the lower third empty (round-0 review: the
 * first render read as a document with a blank bottom 40%).
 */
function cream(content: SatoriElement[], foot: SatoriElement): SatoriElement {
  return box(
    { width: W, height: H, position: 'relative', flexDirection: 'column', backgroundColor: PALETTE.cream, color: PALETTE.ink },
    box(
      { position: 'absolute', left: MX, right: MX, top: 80, bottom: 150, flexDirection: 'column', justifyContent: 'center' },
      ...content,
    ),
    foot,
  );
}

function headline(s: string, size: number = SIZES.headline, color = PALETTE.ink): SatoriElement {
  return text(s, { fontFamily: 'Instrument Serif', fontSize: size, lineHeight: 1.04, color, marginTop: 22 });
}

export function slideElement(
  copy: CarouselCopy,
  i: number,
  assets: SlideAssets,
  provenance: string,
): { element: SatoriElement; intended: Array<string | { text: string; min?: number }>; ground: string | null } {
  const s = copy.slides[i]!;
  const total = copy.slides.length;
  const n = i + 1;

  if (s.role === 'cover') {
    return {
      ground: null,
      intended: [s.kicker.toUpperCase(), s.headline, s.photo_label],
      element: box(
        { width: W, height: H, position: 'relative', backgroundColor: PALETTE.ink },
        { type: 'img', props: { src: assets.coverPhoto, style: { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' } } } as SatoriElement,
        box({
          position: 'absolute', left: 0, bottom: 0, width: W, height: 900,
          backgroundImage: 'linear-gradient(to bottom, rgba(20,14,10,0) 0%, rgba(20,14,10,0.78) 42%, rgba(20,14,10,0.92) 100%)',
        }),
        box(
          { position: 'absolute', left: MX, right: MX, bottom: 120, flexDirection: 'column' },
          kickerText(s.kicker, '#F2C9B4'),
          headline(s.headline, SIZES.coverHeadline, PALETTE.white),
          text(s.photo_label, { fontFamily: 'Inter', fontSize: SIZES.label, lineHeight: 1.3, color: 'rgba(255,255,255,0.86)', marginTop: 30 }),
        ),
        box(
          { position: 'absolute', left: MX, right: MX, bottom: 52, justifyContent: 'flex-end' },
          text(`${n}/${total}`, { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.footer, color: 'rgba(255,255,255,0.86)' }),
        ),
      ),
    };
  }

  const shots = assets.shots[i] ?? [];

  if (s.role === 'swaps') {
    // With a real screen: the app's own swapped row + its "Was" card carries swap 1; the other two are compact rows.
    const rest = shots.length ? s.rows.slice(1) : s.rows;
    return {
      ground: PALETTE.cream,
      intended: [s.kicker.toUpperCase(), s.headline, ...rest.flatMap((r) => [{ text: r.before, min: STRUCK_MIN }, r.after]), provenance, `${n}/${total}`],
      element: cream([
        kickerText(s.kicker, PALETTE.terracotta),
        headline(s.headline, shots.length ? 84 : SIZES.headline),
        ...(shots[0] ? [screen(shots[0], 30)] : []),
        box(
          { flexDirection: 'column', marginTop: shots.length ? 26 : 44 },
          ...rest.map((r, j) =>
            box(
              {
                flexDirection: 'column', alignItems: 'flex-start',
                paddingTop: shots.length ? 10 : 26, paddingBottom: shots.length ? 10 : 26,
                borderTopWidth: j === 0 && !shots.length ? 2 : 0, borderBottomWidth: shots.length ? 0 : 2, borderStyle: 'solid', borderColor: PALETTE.rule,
              },
              text(r.before, { fontFamily: 'Inter', fontSize: shots.length ? 40 : SIZES.struck, color: PALETTE.secondary, textDecoration: 'line-through' }),
              box(
                { alignItems: 'center', marginTop: shots.length ? 4 : 10 },
                box({ marginRight: 12 }, arrowRight(PALETTE.terracotta, shots.length ? 36 : 44)),
                text(r.after, { fontFamily: 'Inter', fontWeight: 600, fontSize: shots.length ? 46 : SIZES.body, color: PALETTE.ink }),
              ),
            ),
          ),
        ),
      ], footer(n, total, provenance)),
    };
  }

  if (s.role === 'method' && shots[0]) {
    // Dense layout: the Original's words, the rewrite, then the app's own changed step as proof (≥ 40% of the slide).
    return {
      ground: PALETTE.cream,
      intended: [s.kicker.toUpperCase(), s.headline, AS_WRITTEN_LABEL, s.as_written_struck === false ? s.as_written : { text: s.as_written, min: STRUCK_MIN }, `In short: ${s.rewrite}`, provenance, `${n}/${total}`],
      element: cream([
        kickerText(s.kicker, PALETTE.terracotta),
        headline(s.headline, 76),
        text(AS_WRITTEN_LABEL, { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.label, color: PALETTE.secondary, letterSpacing: 1, marginTop: 26 }),
        text(`“${s.as_written}”`, {
          fontFamily: 'Inter', fontSize: 40, lineHeight: 1.28, color: s.as_written_struck === false ? PALETTE.ink : PALETTE.secondary,
          textDecoration: s.as_written_struck === false ? 'none' : 'line-through', marginTop: 6,
        }),
        // Critique round 1: our summary must not read as app text, so it is labelled and set lighter.
        box(
          { alignItems: 'flex-start', marginTop: 18, flexWrap: 'wrap' },
          text('In short:', { fontFamily: 'Inter', fontWeight: 600, fontSize: 44, lineHeight: 1.2, color: PALETTE.terracotta, marginRight: 12 }),
          text(s.rewrite, { fontFamily: 'Inter', fontWeight: 400, fontSize: 44, lineHeight: 1.2, color: PALETTE.ink, flexShrink: 1 }),
        ),
        // One card: the step's own title row stacked on its "RecipeFix changed this step" box.
        box(
          {
            flexDirection: 'column', marginTop: 26, width: shots[0].width, borderRadius: 24, overflow: 'hidden',
            borderWidth: 2, borderStyle: 'solid', borderColor: PALETTE.rule, boxShadow: '0 18px 40px rgba(39,34,30,0.16)',
          },
          // Title + the step's first two lines, fading out, then its changed-step note: the cut is shown, not hidden.
          box(
            { position: 'relative', width: shots[0].width, height: shots[0].height },
            { type: 'img', props: { src: shots[0].uri, style: { width: shots[0].width, height: shots[0].height } } } as SatoriElement,
            box({ position: 'absolute', left: 0, bottom: 0, width: shots[0].width, height: 70, backgroundImage: 'linear-gradient(to bottom, rgba(247,242,236,0), rgba(247,242,236,1))' }),
          ),
          ...shots.slice(1).map((sh) => ({ type: 'img', props: { src: sh.uri, style: { width: sh.width, height: sh.height } } }) as SatoriElement),
        ),
      ], footer(n, total, provenance)),
    };
  }

  if (s.role === 'method') {
    return {
      ground: PALETTE.cream,
      intended: [s.kicker.toUpperCase(), s.headline, AS_WRITTEN_LABEL, s.as_written_struck === false ? s.as_written : { text: s.as_written, min: STRUCK_MIN }, s.rewrite_label ?? 'The rewritten step', s.rewrite, s.why, provenance, `${n}/${total}`],
      element: cream([
        kickerText(s.kicker, PALETTE.terracotta),
        headline(s.headline),
        box(
          { flexDirection: 'column', marginTop: 52 },
          text(AS_WRITTEN_LABEL, { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.label, color: PALETTE.secondary, letterSpacing: 1 }),
          text(`“${s.as_written}”`, {
            fontFamily: 'Inter', fontSize: SIZES.struck, lineHeight: 1.3, color: s.as_written_struck === false ? PALETTE.ink : PALETTE.secondary,
            textDecoration: s.as_written_struck === false ? 'none' : 'line-through', marginTop: 8,
          }),
          text(s.rewrite_label ?? 'The rewritten step', { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.label, color: PALETTE.terracotta, letterSpacing: 1, marginTop: 40 }),
          box(
            { alignItems: 'flex-start', marginTop: 8 },
            box({ marginRight: 16, marginTop: 10 }, arrowRight(PALETTE.terracotta, 44)),
            text(s.rewrite, { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.body, lineHeight: 1.22, color: PALETTE.ink, flexShrink: 1 }),
          ),
          box(
            { marginTop: 44, borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: PALETTE.terracotta, paddingLeft: 26 },
            text(s.why, { fontFamily: 'Inter', fontSize: SIZES.why, lineHeight: 1.3, color: PALETTE.ink }),
          ),
        ),
      ], footer(n, total, provenance)),
    };
  }

  // proof
  const shot = shots[0]!;
  return {
    ground: PALETTE.cream,
    intended: [s.kicker.toUpperCase(), s.headline, ...s.recap, provenance, `${n}/${total}`],
    element: cream([
      kickerText(s.kicker, PALETTE.terracotta),
      headline(s.headline, 84),
      box(
        { flexDirection: 'column', marginTop: 26, width: shot.width, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderStyle: 'solid', borderColor: PALETTE.rule, boxShadow: '0 18px 40px rgba(39,34,30,0.16)' },
        ...shots.slice(0, shots.length > 2 ? 2 : 1).map((sh) => ({ type: 'img', props: { src: sh.uri, style: { width: sh.width, height: sh.height } } }) as SatoriElement),
      ),
      ...(shots.length > 1 ? [screen(shots[shots.length - 1]!, 16)] : []),
      // Round-1 critique: filled pills read as tappable buttons. A plain list with a rule reads as takeaways.
      box(
        { flexDirection: 'column', marginTop: 34, borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: PALETTE.terracotta, paddingLeft: 26 },
        ...s.recap.map((r, j) =>
          text(r, { fontFamily: 'Inter', fontWeight: 600, fontSize: SIZES.pill, lineHeight: 1.25, color: PALETTE.ink, marginTop: j === 0 ? 0 : 10 }),
        ),
      ),
    ], footer(n, total, provenance)),
  };
}

export async function renderCarousel(copy: CarouselCopy, assets: SlideAssets, provenance: string): Promise<RenderedSlide[]> {
  const out: RenderedSlide[] = [];
  for (let i = 0; i < copy.slides.length; i++) {
    const { element, intended, ground } = slideElement(copy, i, assets, provenance);
    const r = await renderElement(element, { aspectRatio: '4:5', size: { width: W, height: H } });
    out.push({ index: i + 1, role: copy.slides[i]!.role, png: r.png, safeBox: SAFE_BOX, intended, ground });
  }
  return out;
}
