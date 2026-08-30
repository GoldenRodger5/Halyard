/**
 * §302. More than one way for a quiz to look.
 *
 * §300 fixed how a question is *asked* — a year becomes multiple choice because
 * nobody produces "1728" from memory. It did not fix how a question is *drawn*,
 * and drawing it was worse than it looked: `QuizQuestion` has carried `options`
 * and `correctIndex` since §294, `planQuestion` returns `optionCount: 3`, and
 * the composition never rendered a single option. Every multiple-choice
 * question ever made was shown to the viewer as free-form. The parts were all
 * there and the last hop was missing — the same shape as the image client, the
 * typography path, and the captures.
 *
 * ## Why several templates and not one
 *
 * One template per question kind still produces an account where every video
 * looks alike, because a feed does not experience "this is a true/false and
 * that is a multiple choice" — it experiences *these all look the same*. An
 * account posting three times a week is asking a viewer to see the same
 * composition 150 times a year.
 *
 * So a template is chosen per piece, and the choice is deterministic and
 * explainable, exactly like `chooseLayout` (§293): **what can carry this
 * question** first, then **what has not been used lately**. Never random —
 * random reruns the same template twice in a row often enough to notice, and
 * cannot tell an operator why.
 *
 * ## What a template is allowed to change
 *
 * Composition, weight, rhythm, where the eye lands. It never changes the
 * palette or the faces: those come from the product (§296), and a template that
 * picked its own colours would make a recipe adapter and a film log look alike
 * — which is precisely the thing the whole brand pipeline exists to prevent.
 */
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BrandTokens } from '../brand.js';
import type { RenderTypography } from '../image/templates.js';
import { contrastRatio } from './captionStyle.js';

export const QUIZ_TEMPLATES = ['stack', 'rail', 'grid', 'spotlight', 'versus'] as const;
export type QuizTemplateId = (typeof QUIZ_TEMPLATES)[number];

/**
 * What a template can carry.
 *
 * Declared, not inferred. `versus` renders exactly two full-height panels and
 * would be nonsense with three options; `spotlight` draws no options at all and
 * is only honest for a question that has none. A template picked for a question
 * it cannot draw is how you get an answer that is not on screen.
 */
export interface QuizTemplateInfo {
  id: QuizTemplateId;
  label: string;
  /** Inclusive range of options it can draw. `[0,0]` means free-form only. */
  options: [number, number];
  /** One line an operator reads when choosing by hand. */
  intent: string;
}

export const QUIZ_TEMPLATE_INFO: Record<QuizTemplateId, QuizTemplateInfo> = {
  stack: {
    id: 'stack',
    label: 'Stacked bars',
    options: [2, 4],
    intent: 'Full-width bars down the middle. The most legible, and the safest.',
  },
  rail: {
    id: 'rail',
    label: 'Left rail',
    options: [2, 5],
    intent: 'Question held on the left, options stepping down the right. Reads fast on a phone.',
  },
  grid: {
    id: 'grid',
    label: 'Tiles',
    options: [3, 4],
    intent: 'Two-column tiles. Feels like a game show rather than a card.',
  },
  spotlight: {
    id: 'spotlight',
    label: 'Spotlight',
    options: [0, 0],
    intent: 'The question at full size and nothing else. For a question with no options.',
  },
  versus: {
    id: 'versus',
    label: 'Versus',
    options: [2, 2],
    intent: 'Two half-frame panels. Built for true or false.',
  },
};

/**
 * Choose a treatment for one question.
 *
 * Fit, then recency — `chooseLayout`'s order, for the same reason: a template
 * that cannot draw the question is not a stylistic preference to be weighed
 * against variety, it is wrong output. Among templates that *can* draw it, the
 * one used least recently wins, so a run of five questions cycles rather than
 * repeating.
 */
export function chooseQuizTemplate(input: {
  optionCount: number;
  isTrueFalse?: boolean;
  /** Templates already used in this piece or recent pieces, most recent first. */
  recent?: QuizTemplateId[];
}): { template: QuizTemplateId; reason: string } {
  const recent = input.recent ?? [];

  const fits = QUIZ_TEMPLATES.filter((id) => {
    const [min, max] = QUIZ_TEMPLATE_INFO[id].options;
    if (input.optionCount < min || input.optionCount > max) return false;
    /*
     * `versus` is reserved for true/false rather than offered for any pair.
     * Two options that are not True and False read as a multiple choice that
     * ran out of ideas, and the split-panel treatment makes that louder.
     */
    if (id === 'versus' && !input.isTrueFalse) return false;
    return true;
  });

  if (fits.length === 0) {
    /* The floor, and it can draw anything: the question, at size. */
    return {
      template: 'spotlight',
      reason: `No template draws ${input.optionCount} options, so the question is shown on its own.`,
    };
  }

  /*
   * Staleness first, then affinity. Staleness has to dominate or a purpose-
   * built treatment would win every time and variety would never happen — a
   * quiz of five true/false questions would run the same panel five times.
   * Affinity only breaks the tie among treatments that are equally unused,
   * which is exactly the first appearance of a kind: true/false gets `versus`
   * the first time and something else after.
   */
  const scored = fits
    .map((id) => {
      const at = recent.indexOf(id);
      return {
        id,
        staleness: at === -1 ? Number.POSITIVE_INFINITY : at,
        affinity: id === 'versus' && input.isTrueFalse ? 1 : 0,
      };
    })
    .sort((a, b) => b.staleness - a.staleness || b.affinity - a.affinity);

  const chosen = scored[0]!.id;
  const unused = scored[0]!.staleness === Number.POSITIVE_INFINITY;
  return {
    template: chosen,
    reason: unused
      ? `${QUIZ_TEMPLATE_INFO[chosen].label} suits ${input.optionCount} options and has not been used here.`
      : `${QUIZ_TEMPLATE_INFO[chosen].label} is the least recently used treatment that fits.`,
  };
}

const face = (t: RenderTypography | undefined, role: 'display' | 'body' | 'label') =>
  t ? { fontFamily: t[role].family, fontWeight: t[role].weight } : {};

/** The letter in front of an option. Recognisable, and how people answer aloud. */
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * §302. The two colours every treatment draws with, decided once.
 *
 * The first render of these templates came out invisible: they were written in
 * white, which is correct over a scrimmed photograph and unreadable on the
 * cream ground RecipeFix actually uses. Five templates each making that call
 * would be the same decision written five times, and it would be wrong in a
 * different one of them every time somebody added a sixth.
 *
 * It is also the whole product-agnostic claim in miniature. A dark-ground
 * product gets white type and a light-ground product gets ink **without either
 * being configured**, because the answer is measured from the brand rather than
 * chosen by a designer per product — the same `contrastRatio` the captions have
 * used since §211.
 */
export interface QuizPalette {
  /** Type colour. */
  fg: string;
  /**
   * The accent — the eyebrow, and the letter in front of each option.
   *
   * Not simply `brand.primary`. RecipeFix's rust over a warm brown photograph
   * measured about 3:1 against the scrim, and both places it is used are small
   * type, which is where a marginal ratio actually fails. Lifted toward white
   * until it clears 4.5:1, and left alone when it already does — so a brand
   * whose primary is already bright keeps its own colour.
   */
  accent: string;
  /** The fill behind an option that has not been chosen. */
  surface: string;
  /** Its edge. */
  border: string;
  /** How much a wrong option drops back once the answer is out. */
  dimmed: string;
  /** The brand colour, for rules and fills — never for small type on a photo. */
  rule: string;
  /**
   * §315. A plate for small type, or null on the brand ground.
   *
   * A measured mean cannot save a 30px label. The lower band of the bread
   * photograph measures 0.31 and the kicker happens to sit on the crust, which
   * is nearly white — so an accent computed from the average was legible
   * against a ground it was never actually on, and "AND THEN" disappeared.
   *
   * Small type over a photograph gets its own dark plate instead. It does not
   * depend on knowing what is behind it, which is the only property that
   * survives a photograph nobody has looked at — the same reason §294 put a
   * scrim over the whole frame rather than tinting per piece.
   */
  plate: string | null;
}

/** Step a hex colour toward another. Used only to rescue a failing accent. */
function mix(hex: string, toward: string, amount: number): string {
  const parse = (h: string) => {
    const v = h.replace('#', '');
    const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const [ar, ag, ab] = parse(hex);
  const [br, bg, bb] = parse(toward);
  const c = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `#${[c(ar!, br!), c(ag!, bg!), c(ab!, bb!)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Move a colour toward the type colour until it is legible on its ground.
 *
 * **Toward `fg`, not toward white.** The first version lifted toward white
 * unconditionally, which is right over a dark scrim and exactly backwards on a
 * light one: RecipeFix's rust on cream ended up near-white, so the eyebrow and
 * the rail's rule rendered invisible on the brand ground. It was written while
 * looking at a photograph and shipped without being looked at on the flat one.
 *
 * `fg` is already known legible against this ground — `quizPalette` measured it
 * — so it is the only safe direction, and on either kind of brand.
 *
 * Steps rather than solving, because the steps are what an operator can check:
 * the result is one of ten known colours and the reason is "it took four steps
 * to clear 4.5:1", not a number from a formula nobody can reproduce.
 */
function legibleAccent(colour: string, against: string, toward: string): string {
  for (let step = 0; step <= 10; step += 1) {
    const out = mix(colour, toward, step / 10);
    if (contrastRatio(out, against) >= 4.5) return out;
  }
  return toward;
}

export function quizPalette(brand: BrandTokens, overPhoto: boolean): QuizPalette {
  /*
   * Over a photograph the ground is the scrim, not the brand — and the scrim is
   * dark by construction (§301), so white always wins and measuring the brand
   * would answer the wrong question.
   */
  const fg = overPhoto
    ? '#FFFFFF'
    : contrastRatio(brand.ink, brand.background) >= contrastRatio('#FFFFFF', brand.background)
      ? brand.ink
      : '#FFFFFF';

  const light = fg === '#FFFFFF';
  return {
    fg,
    /*
     * The scrim's dark end is what an accent over a photograph is really read
     * against; on the brand ground it is the ground itself.
     */
    /*
     * §315. Over a photograph the accent is the *rule and the fills*, and small
     * type is white on a plate instead.
     *
     * There is no brand-coloured tint that is safe on an unknown photograph:
     * a 30px label sits wherever the layout puts it, which may be the one
     * highlight in the frame, and rust that measures 4.5:1 against the average
     * measures 1.8:1 against a sunlit crust. Attempting it produced a label
     * that was legible in the test and invisible on screen.
     *
     * White on a 78% plate is legible over *any* photograph, including a white
     * one, without knowing anything about it — and the brand still reads,
     * because the rule under the label and the fill on the right answer are
     * both `brand.primary` at full strength.
     */
    accent: overPhoto ? '#FFFFFF' : legibleAccent(brand.primary, brand.background, fg),
    /** The brand colour itself, for rules and fills that are not type. */
    rule: brand.primary,
    /*
     * Over a photograph the plate has to be a plate. A 11% white wash over a
     * busy image is not a container — the bars stopped reading as options and
     * the type sat directly on the food. A dark plate works over any
     * photograph, which is the whole point of not having looked at it.
     */
    surface: overPhoto ? 'rgba(0,0,0,0.46)' : light ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.055)',
    border: overPhoto ? 'rgba(255,255,255,0.34)' : light ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.14)',
    dimmed: light ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.45)',
    /*
     * 78%: over a white photograph this composites to about 0.2 luminance,
     * where white type clears 4.5:1. Chosen from the worst case rather than
     * from how it looks over one picture somebody happened to try.
     */
    plate: overPhoto ? 'rgba(0,0,0,0.78)' : null,
  };
}

export interface QuizTemplateProps {
  question: string;
  options: string[];
  /** Set once the answer is out. Before that no option is marked. */
  correctIndex?: number;
  revealed: boolean;
  brand: BrandTokens;
  type?: RenderTypography;
  /** 0..1, how far the entrance has run. */
  rise: number;
  /** 0..1, how far the reveal has run. Zero before the reveal. */
  reveal: number;
  index: number;
  total: number;
  /** §302. Type and surface colours, resolved once for the whole piece. */
  palette: QuizPalette;
}

/**
 * How an option looks once the answer is known.
 *
 * The right one is filled and the wrong ones drop back rather than vanishing —
 * a viewer who picked wrong needs to see *their* option still there to know
 * they were wrong, and an option that disappears leaves them unsure what
 * happened.
 */
function optionState(i: number, correctIndex: number | undefined, reveal: number) {
  if (reveal <= 0 || correctIndex === undefined) return { fill: 0, dim: 0 };
  return i === correctIndex ? { fill: reveal, dim: 0 } : { fill: 0, dim: reveal * 0.62 };
}

const Eyebrow: React.FC<{
  index: number;
  total: number;
  palette: QuizPalette;
  type?: RenderTypography;
}> = ({ index, total, palette, type }) => (
  <span
    style={{
      /*
       * §315. Its own plate over a photograph, nothing on the brand ground.
       * An accent computed from the frame's average was legible against a
       * ground this label was never actually on — it sits wherever the layout
       * puts it, which may be the one bright highlight in the picture.
       */
      alignSelf: 'flex-start',
      fontSize: 32,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: palette.accent,
      ...(palette.plate
        ? { backgroundColor: palette.plate, padding: '10px 16px', borderRadius: 8 }
        : {}),
      ...face(type, 'label'),
    }}
  >
    Question {index + 1} of {total}
  </span>
);

/** Stacked bars: the most legible treatment, and the one to fall back on. */
export const StackTemplate: React.FC<QuizTemplateProps> = (p) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%' }}>
    <Eyebrow index={p.index} total={p.total} palette={p.palette} type={p.type} />
    <span
      style={{
        fontSize: 94,
        lineHeight: 1.04,
        color: p.palette.fg,
        opacity: p.rise,
        transform: `translateY(${(1 - p.rise) * 22}px)`,
        ...face(p.type, 'display'),
      }}
    >
      {p.question}
    </span>
    {/*
      §302. The bars take the height the question does not. Rendering the
      top-aligned version left a dead band across the middle of the frame; a
      quiz in a feed is chunky and edge-to-edge, not a form on a page.
    */}
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        /*
         * Natural height. Stretching the bars gave 220px slabs with one line
         * floating in each; centring the list on its own split the frame into
         * three separate islands. The question and its options are one block,
         * and the shell centres that block as a unit above the timer.
         */
      }}
    >
      {p.options.map((option, i) => {
        const { fill, dim } = optionState(i, p.correctIndex, p.reveal);
        /* Each bar arrives a beat after the one above it. */
        const stagger = Math.max(0, Math.min(1, p.rise * 3 - i * 0.5));
        return (
          <div
            key={option}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 26,
              padding: '36px 34px',
              borderRadius: 20,
              border: `3px solid ${fill > 0.2 ? p.brand.primary : p.palette.border}`,
              backgroundColor: fill > 0.2 ? p.brand.primary : p.palette.surface,
              opacity: stagger * (1 - dim * 0.55),
              transform: `translateX(${(1 - stagger) * -28}px)`,
            }}
          >
            <span
              style={{
                fontSize: 40,
                width: 56,
                color: fill > 0.2 ? '#FFFFFF' : p.palette.accent,
                ...face(p.type, 'label'),
              }}
            >
              {LETTERS[i]}
            </span>
            <span style={{ fontSize: 50, lineHeight: 1.1, color: fill > 0.2 ? '#FFFFFF' : p.palette.fg, ...face(p.type, 'body') }}>
              {option}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/**
 * The left rail. The operator's idea, and the best of these on a phone.
 *
 * The question is held down the left at a fixed width so it never reflows as
 * options arrive, and the options step down the right. The eye goes left once
 * and then only travels down, which is the shortest path through a question a
 * viewer is giving three seconds to.
 */
export const RailTemplate: React.FC<QuizTemplateProps> = (p) => (
  <div style={{ display: 'flex', gap: 40, width: '100%', alignItems: 'flex-start' }}>
    <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Eyebrow index={p.index} total={p.total} palette={p.palette} type={p.type} />
      <span
        style={{
          fontSize: 62,
          lineHeight: 1.05,
          color: p.palette.fg,
          opacity: p.rise,
          transform: `translateY(${(1 - p.rise) * 20}px)`,
          ...face(p.type, 'display'),
        }}
      >
        {p.question}
      </span>
      {/*
        A rule under the question, drawn as it lands. Fixed length, not
        stretched: `flexGrow` ran it the whole height of the frame while the
        options sat in the middle, which made the rail look like a mistake
        rather than a device.
      */}
      <div
        style={{
          width: 6,
          height: 96,
          backgroundColor: p.palette.rule,
          transform: `scaleY(${p.rise})`,
          transformOrigin: 'top',
        }}
      />
    </div>

    {/* Options start level with the question, not centred against it. */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 54 }}>
      {p.options.map((option, i) => {
        const { fill, dim } = optionState(i, p.correctIndex, p.reveal);
        const stagger = Math.max(0, Math.min(1, p.rise * 3 - i * 0.4));
        return (
          <div
            key={option}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '26px 26px',
              borderRadius: 16,
              borderLeft: `8px solid ${fill > 0.2 ? p.brand.primary : p.palette.border}`,
              backgroundColor: fill > 0.2 ? p.brand.primary : p.palette.surface,
              opacity: stagger * (1 - dim * 0.55),
              transform: `translateX(${(1 - stagger) * 34}px)`,
            }}
          >
            <span style={{ fontSize: 34, color: fill > 0.2 ? '#FFFFFF' : p.palette.accent, ...face(p.type, 'label') }}>
              {LETTERS[i]}
            </span>
            <span style={{ fontSize: 38, lineHeight: 1.12, color: fill > 0.2 ? '#FFFFFF' : p.palette.fg, ...face(p.type, 'body') }}>
              {option}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/** Tiles. Reads as a game rather than a document — good for a light question. */
export const GridTemplate: React.FC<QuizTemplateProps> = (p) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 32, width: '100%' }}>
    <Eyebrow index={p.index} total={p.total} palette={p.palette} type={p.type} />
    <span
      style={{
        fontSize: 78,
        lineHeight: 1.05,
        color: p.palette.fg,
        opacity: p.rise,
        ...face(p.type, 'display'),
      }}
    >
      {p.question}
    </span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
      {p.options.map((option, i) => {
        const { fill, dim } = optionState(i, p.correctIndex, p.reveal);
        const stagger = Math.max(0, Math.min(1, p.rise * 3 - i * 0.35));
        /* An odd last tile spans the row rather than leaving a hole. */
        const odd = p.options.length % 2 === 1 && i === p.options.length - 1;
        return (
          <div
            key={option}
            style={{
              width: odd ? '100%' : 'calc(50% - 10px)',
              minHeight: 200,
              padding: 28,
              borderRadius: 24,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              backgroundColor: fill > 0.2 ? p.brand.primary : p.palette.surface,
              border: `3px solid ${fill > 0.2 ? p.brand.primary : p.palette.border}`,
              opacity: stagger * (1 - dim * 0.55),
              transform: `scale(${0.9 + stagger * 0.1})`,
            }}
          >
            <span style={{ fontSize: 34, color: fill > 0.2 ? '#FFFFFF' : p.palette.accent, ...face(p.type, 'label') }}>
              {LETTERS[i]}
            </span>
            <span style={{ fontSize: 42, lineHeight: 1.1, color: fill > 0.2 ? '#FFFFFF' : p.palette.fg, ...face(p.type, 'body') }}>
              {option}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/** Two panels. True on one side, false on the other, and the frame picks a side. */
export const VersusTemplate: React.FC<QuizTemplateProps> = (p) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 36, width: '100%' }}>
    <Eyebrow index={p.index} total={p.total} palette={p.palette} type={p.type} />
    <span
      style={{
        fontSize: 82,
        lineHeight: 1.05,
        color: p.palette.fg,
        opacity: p.rise,
        ...face(p.type, 'display'),
      }}
    >
      {p.question}
    </span>
    <div style={{ display: 'flex', gap: 22, minHeight: 320 }}>
      {p.options.map((option, i) => {
        const { fill, dim } = optionState(i, p.correctIndex, p.reveal);
        const stagger = Math.max(0, Math.min(1, p.rise * 3 - i * 0.3));
        return (
          <div
            key={option}
            style={{
              flex: 1,
              borderRadius: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: fill > 0.2 ? p.brand.primary : p.palette.surface,
              border: `4px solid ${fill > 0.2 ? p.brand.primary : p.palette.border}`,
              opacity: stagger * (1 - dim * 0.6),
              /* The chosen panel grows a little. A reveal should feel decided. */
              transform: `scale(${(0.92 + stagger * 0.08) * (1 + fill * 0.04)})`,
            }}
          >
            <span
              style={{
                fontSize: 78,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: fill > 0.2 ? '#FFFFFF' : p.palette.fg,
                ...face(p.type, 'display'),
              }}
            >
              {option}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/** No options. The question, at the size it deserves when it stands alone. */
export const SpotlightTemplate: React.FC<QuizTemplateProps> = (p) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 34, width: '100%' }}>
    <Eyebrow index={p.index} total={p.total} palette={p.palette} type={p.type} />
    <span
      style={{
        fontSize: 118,
        lineHeight: 0.98,
        letterSpacing: '-0.02em',
        color: p.palette.fg,
        opacity: p.rise,
        transform: `translateY(${(1 - p.rise) * 26}px)`,
        ...face(p.type, 'display'),
      }}
    >
      {p.question}
    </span>
  </div>
);

export const QUIZ_TEMPLATE_COMPONENTS: Record<QuizTemplateId, React.FC<QuizTemplateProps>> = {
  stack: StackTemplate,
  rail: RailTemplate,
  grid: GridTemplate,
  spotlight: SpotlightTemplate,
  versus: VersusTemplate,
};

/**
 * The entrance and reveal progress a template is drawn with.
 *
 * Kept here rather than in each template so five treatments cannot drift into
 * five slightly different senses of "arriving" — the thing that makes an
 * account feel assembled by one hand is that the *timing* is shared even when
 * the composition is not.
 */
export function useQuizProgress(revealStartSeconds: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;

  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.4) });
  const reveal =
    seconds < revealStartSeconds
      ? 0
      : interpolate(seconds - revealStartSeconds, [0, 0.45], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

  return { rise, reveal, revealed: seconds >= revealStartSeconds };
}
