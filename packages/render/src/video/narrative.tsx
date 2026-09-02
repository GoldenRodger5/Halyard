/**
 * §308. The composition every other short-video format runs through.
 *
 * `quiz` got a composition in §289 and the other four `short_video` formats —
 * `history`, `tips`, `myth_fact`, `origin` — had none, so they rendered as
 * cards and looked like slideshows. Writing a bespoke composition for each is
 * the obvious answer and the wrong one: four compositions is four places for
 * the same timing bug, and it does nothing for the fifth format somebody adds.
 *
 * A narrative format is a **sequence of beats**, and the formats differ in what
 * their beats *mean* rather than in how a beat is drawn. A history is
 * hook → setup → turn → why; an origin is hook → before → change → now. Both
 * are "say a thing, hold it, say the next thing", and the turn is the one that
 * has to land hardest in each. So the composition takes beats with roles, and
 * the format decides which slot becomes which role.
 *
 * ## Variety is structural, not decorative
 *
 * Each beat picks a treatment the way §302 picks a quiz template: what fits,
 * then what has not been used. A five-beat piece therefore cycles through five
 * different compositions rather than showing the same card five times with
 * different words in it — which is exactly what "it looks like a slideshow"
 * means and why every format before this did.
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BrandTokens } from '../brand.js';
import type { RenderTypography } from '../image/templates.js';
import { quizPalette, type QuizPalette } from './quizTemplates.js';

/** What a beat is doing, which is what decides how hard it lands. */
export const BEAT_ROLES = ['hook', 'setup', 'turn', 'detail', 'payoff', 'close'] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

export interface NarrativeBeat {
  role: BeatRole;
  text: string;
  /**
   * A short label above the line — "Myth", "1728", "Tip 3".
   *
   * Optional, and it changes the whole reading of a beat: "Myth / Oats contain
   * gluten" is a different sentence from "Oats contain gluten" and the label is
   * doing the work.
   */
  kicker?: string | null;
  /** A citation, small, under the line. Only where the format is `sourced`. */
  source?: string | null;
  /** Seconds this beat holds. Derived by the caller from the read. */
  seconds: number;
  /**
   * How much weight this beat carries. §416.
   *
   * `hold` is the beat the piece exists for; `quick` is a hook that must not
   * linger. Read by `creative.no_payoff`, which is an error and failed every
   * format video because nothing here ever set it.
   */
  emphasis?: 'quick' | 'normal' | 'hold';
  /**
   * Which spoken line this beat is a part of. §417.
   *
   * A long line arrives in two visual moments over one continuous piece of
   * audio, and both show the same photograph — the picture holds while the
   * sentence completes, which is what makes the second part read as the thought
   * continuing rather than a new one starting. The worker photographs one image
   * per group rather than one per beat.
   */
  photographGroup?: number;
  /**
   * §407. This beat's own photograph.
   *
   * A single image held for the whole video is the thing short-form punishes
   * hardest: every platform's guidance is a visual reset every 1.5-4 seconds,
   * and "dead time — any moment where nothing new appears on screen" is the
   * fastest way to lose a feed viewer. Nineteen seconds on one still is four
   * text changes over one unchanging picture.
   *
   * Optional: absent, the beat falls back to the piece-level background, which
   * is what every render did before this and is still right for a composition
   * given only one image.
   */
  backgroundDataUri?: string;
  /**
   * §478. A clip under this beat instead of a picture.
   *
   * A filename in the bundle's public directory, served with `staticFile` —
   * the same way the walkthrough carries a capture. Not a data URI: a
   * six-second clip is megabytes, and Remotion decodes a video file far more
   * cheaply than it decodes a base64 string the size of one.
   *
   * When both are set the clip wins, because the still was a fallback that
   * the worker computed before it knew whether footage would land.
   */
  backgroundVideoFile?: string;
  /** Measured brightness where the type sits on *this* beat's picture, 0..1. */
  backgroundLuminance?: number;
  /**
   * A drawn mark on one phrase of this line. §415.
   *
   * Decided by the worker, which knows the product's motif pack, and drawn
   * here — the arrangement §394 settled: a component runs in a browser bundle
   * and cannot read a brand, so it is handed the decision rather than making
   * one.
   *
   * Absent means no mark, which is a real answer: a line whose emphasis word is
   * a stopword, or a piece whose brand has no pen, gets clean type.
   */
  mark?: BeatMark;
  /**
   * §441. What the frame does across this beat, from the screenplay.
   *
   * The Ground moved one way on every beat of every piece ever rendered: a
   * 1.00 to 1.06 push, forever, because nothing told it otherwise. The
   * screenwriter has been writing `move` since §335 — `hold` on a moment that
   * needs reading, `push_in` on a reveal, `cut` when the subject changes — and
   * the field never left the database.
   *
   * Absent means the previous behaviour exactly, which is right for a piece
   * with no screenplay and for the Remotion studio, where there is none.
   */
  move?: SceneMove;
  /**
   * §441. The screenplay asked for a flat ground on this beat.
   *
   * Read by the *worker*, which decides which beats get a photograph, not by
   * this component — by the time props are built the decision has been made.
   * It travels on the beat because that is where the direction landed and
   * because a field carried nowhere is a direction that cannot be honoured.
   *
   * A screenplay that calls for `colour` is usually calling for a breath: a
   * flat card between two photographed beats is a pattern interrupt that costs
   * nothing, and a piece that is photographs end to end has no punctuation.
   */
  wantsFlatGround?: boolean;
  /**
   * §478. The screenplay asked this beat for real motion, and of what. The
   * worker resolves it to `footageAssetId`; the render handler stages that
   * into `backgroundVideoFile`. Three fields because three different processes
   * own the three steps, and each can be read back to see where it stopped.
   */
  wantsFootage?: boolean;
  footageSubject?: string;
  footageAssetId?: string;
  /** The clip's length, so a beat longer than it loops rather than freezing. */
  backgroundVideoSeconds?: number;
  /**
   * §446. What the screenplay asked to be marked on this beat.
   *
   * Read by the *worker*, which resolves a target phrase to a `mark` using the
   * product's motif pack. Empty means the screenplay looked at this beat and
   * decided it earns nothing.
   */
  markTargets?: string[];
  /**
   * Whether a screenplay staged this beat at all.
   *
   * The distinction `markTargets: []` cannot carry on its own: "no marks here"
   * and "nobody decided" produce the same empty array and must produce
   * different renders — the first is a clean line, the second is the
   * mechanical mark that every beat used to get.
   */
  markDirected?: boolean;
}

/**
 * §441. What the frame does across a scene. Mirrors `Move` in `@halyard/core`.
 *
 * Restated rather than imported: gotcha 10, this bundle is webpacked for the
 * browser and the core barrel pulls `node:crypto`. `screenplayMove.test.ts`
 * holds the two lists to each other.
 */
export const SCENE_MOVES = ['hold', 'push_in', 'drift', 'cut', 'settle'] as const;
export type SceneMove = (typeof SCENE_MOVES)[number];

/**
 * How each direction reads as camera movement.
 *
 * `from`/`to` are scale; `drift` also pans, because a drift that only scales is
 * a slow push by another name. `hold` is genuinely still — the point of asking
 * for it is that a viewer reading a long line should not be moving.
 */
export const MOVE_GRAMMAR: Record<SceneMove, { from: number; to: number; panX: number }> = {
  /* Still. A reader needs a stationary frame. */
  hold: { from: 1.02, to: 1.02, panX: 0 },
  /* The reveal. Harder than the old default, because it now means something. */
  push_in: { from: 1, to: 1.09, panX: 0 },
  /* Lateral, barely scaling. Reads as time passing rather than as emphasis. */
  drift: { from: 1.05, to: 1.05, panX: 2.2 },
  /* A new subject. Starts wide and settles fast, so the cut lands. */
  cut: { from: 1.08, to: 1.03, panX: 0 },
  /* Coming to rest. The close. */
  settle: { from: 1.04, to: 1, panX: 0 },
};

/** A mark on a phrase of a line: what to draw, where, and in whose hand. */
export interface BeatMark {
  /** The exact phrase from the line to mark. Matched literally. */
  phrase: string;
  kind: 'underline' | 'circle';
  /** How much the hand shakes, 0..1, from the product's motif pack. */
  wobble: number;
  /** Stroke weight in pixels at 1080 wide. */
  stroke: number;
}

export interface NarrativeProps {
  brand: BrandTokens;
  typography?: RenderTypography;
  beats: NarrativeBeat[];
  /**
   * §394. What recent pieces drew, most recent first.
   *
   * Supplied by the worker from `renders.treatment`. Absent, the beats are
   * chosen against an empty history, which is right in the Remotion studio —
   * there is none there to have.
   */
  before?: NarrativeTreatment[];
  backgroundDataUri?: string;
  /** §301. Measured brightness of the ground where type sits, 0..1. */
  backgroundLuminance?: number;
  audioSrc?: string | null;
  wordmark?: string;
}

export const NARRATIVE_TREATMENTS = ['statement', 'anchored', 'split_rule', 'label_lead', 'quiet'] as const;
export type NarrativeTreatment = (typeof NARRATIVE_TREATMENTS)[number];

/**
 * Which treatments suit which roles.
 *
 * A hook has to be the loudest thing in the piece and a close has to be the
 * quietest — a close set at hook weight reads as the piece starting again. So
 * this is a fit rule, not a preference: variety picks *within* it.
 */
const FITS: Record<BeatRole, NarrativeTreatment[]> = {
  hook: ['statement', 'label_lead'],
  setup: ['anchored', 'split_rule', 'label_lead'],
  turn: ['statement', 'split_rule'],
  detail: ['anchored', 'label_lead', 'split_rule'],
  payoff: ['statement', 'split_rule'],
  close: ['quiet', 'anchored'],
};

/**
 * A treatment per beat, chosen once for the piece.
 *
 * Fit, then recency — §302 and §293's order, and for the same reason. Exported
 * so a test can assert the run varies rather than trusting that it does.
 *
 * ## §394. The history has to come from outside
 *
 * This started its recency list empty on every call, so it varied *within* a
 * piece and repeated *across* pieces: two histories briefed the same way opened
 * on the same treatment, every time. Nine of eleven formats render through this
 * composition, so that was most of the account looking alike.
 *
 * `before` is what recent pieces drew, most recent first. The worker reads it
 * from `renders.treatment` and passes it in; a component cannot, because it
 * runs in a browser bundle with no database (§-gotcha-10).
 */
export function treatmentsForBeats(
  roles: BeatRole[],
  before: NarrativeTreatment[] = [],
): NarrativeTreatment[] {
  const recent: NarrativeTreatment[] = [...before];
  return roles.map((role) => {
    const fits = FITS[role];
    const chosen =
      fits
        .map((t) => ({ t, staleness: recent.indexOf(t) === -1 ? Infinity : recent.indexOf(t) }))
        .sort((a, b) => b.staleness - a.staleness)[0]!.t;
    recent.unshift(chosen);
    return chosen;
  });
}

const face = (t: RenderTypography | undefined, role: 'display' | 'body' | 'label') =>
  t ? { fontFamily: t[role].family, fontWeight: t[role].weight } : {};

/**
 * How big a line is set, from how long it is.
 *
 * A fixed size makes a four-word hook look timid and a twenty-word setup
 * overflow the frame. Stepped rather than continuous, so two beats of similar
 * length are set identically and the piece looks typeset rather than fitted.
 */
function sizeFor(text: string, role: BeatRole): number {
  const words = text.trim().split(/\s+/).length;
  const base = role === 'hook' || role === 'turn' || role === 'payoff' ? 1 : 0.82;
  const step = words <= 6 ? 128 : words <= 12 ? 96 : words <= 20 ? 74 : 58;
  return Math.round(step * base);
}

const Kicker: React.FC<{ text: string; palette: QuizPalette; type?: RenderTypography }> = ({
  text,
  palette,
  type,
}) => (
  <span
    style={{
      /*
       * §315. A plate over a photograph. "AND THEN" sat on the bright crust of
       * a loaf and vanished, while measuring as legible against the frame's
       * average — an average cannot save 30px of type sitting on the one
       * highlight it happens to cross.
       */
      alignSelf: 'flex-start',
      fontSize: 32,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: palette.accent,
      marginBottom: 22,
      ...(palette.plate
        ? { backgroundColor: palette.plate, padding: '10px 16px', borderRadius: 8 }
        : {}),
      ...face(type, 'label'),
    }}
  >
    {text}
  </span>
);

const Source: React.FC<{ text: string; palette: QuizPalette; type?: RenderTypography }> = ({
  text,
  palette,
  type,
}) => (
  <span
    style={{
      alignSelf: 'flex-start',
      fontSize: 24,
      marginTop: 26,
      color: palette.dimmed,
      /* §315. Same reason as the kicker: a citation is the smallest type here. */
      ...(palette.plate
        ? { backgroundColor: palette.plate, padding: '8px 14px', borderRadius: 6 }
        : {}),
      ...face(type, 'body'),
    }}
  >
    {text}
  </span>
);

/**
 * §415. A drawn mark on the word that lands.
 *
 * The motif pack — two registers, four mark kinds, a stroke weight and a wobble
 * §330 calls "the single strongest signal of register" — has existed since §284
 * and **has never appeared in a rendered frame**. `<Annotations>` is rendered
 * nowhere and `annotationForPhrase` has no callers; the annotation director runs
 * for walkthroughs and only its yes/no survives, the kind and stroke discarded.
 *
 * ## Why the mark lives with the type rather than at a computed box
 *
 * `annotationForPhrase` resolves a phrase to a box in the frame, which is right
 * for pointing at a *captured region* — an external thing the composition did
 * not lay out. For type the composition **is** the layout, and a box computed
 * against a flex column is a guess that puts a wobbling line through the middle
 * of a sentence the moment the text wraps differently. Wrapping the phrase in
 * its own inline box and drawing under that is exact by construction, at any
 * measure and any wrap.
 *
 * ## Drawn on, not faded in
 *
 * A stroke that appears at full length is a graphic; one that travels is a
 * person with a pen, which is the whole reason the pack carries a wobble at
 * all. It travels by clip rather than by dash offset — see the `clipPath`.
 *
 * ## The wobble is seeded, not random
 *
 * `Math.random()` in a Remotion component gives a different line on every frame,
 * which reads as static rather than as a hand. Seeded from the phrase, the mark
 * is identical on every frame of the beat and identical on a re-render.
 */
const Marked: React.FC<{
  children: React.ReactNode;
  mark: BeatMark;
  colour: string;
  /** 0..1, how much of the stroke is drawn. */
  drawn: number;
}> = ({ children, mark, colour, drawn }) => {
  /* Deterministic jitter in [-1, 1] from the phrase and an offset. */
  const jitter = (n: number) => {
    let h = 2166136261;
    for (let i = 0; i < mark.phrase.length; i += 1) h = Math.imul(h ^ mark.phrase.charCodeAt(i), 16777619);
    h = Math.imul(h ^ n, 16777619);
    return (((h >>> 0) % 2000) / 1000 - 1) * mark.wobble;
  };

  const path =
    mark.kind === 'circle'
      ? /* An open ring, drawn slightly wide of the word so it does not clip it. */
        `M 2,${50 + jitter(1) * 8} C 2,${14 + jitter(2) * 10} 26,4 50,4 ` +
        `C ${76 + jitter(3) * 4},4 98,${16 + jitter(4) * 8} 98,50 ` +
        `C 98,${84 + jitter(5) * 8} ${74 + jitter(6) * 4},96 50,96 ` +
        `C 24,96 2,${82 + jitter(7) * 8} 2,50`
      : /*
         * One pass under the word, sagging the way a hand sags.
         *
         * A single quadratic, deliberately. The first version chained `Q` into
         * `T`, whose control point is a reflection — with `preserveAspectRatio
         * ="none"` squashing the box to a third of the word's height, the
         * reflected curve left the painted area and the underline rendered as
         * two strokes with a hole under the middle of the word.
         *
         * The sag is small on purpose. A hand drawing under a word does not
         * draw a bowl; the wobble that reads as a person is a few units of
         * drift, and more than that reads as a mistake.
         */
        `M 3,${58 + jitter(1) * 6} Q 50,${74 + jitter(2) * 8} 97,${62 + jitter(3) * 6}`;

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: mark.kind === 'circle' ? '-6%' : 0,
          top: mark.kind === 'circle' ? '-14%' : '76%',
          width: mark.kind === 'circle' ? '112%' : '100%',
          height: mark.kind === 'circle' ? '128%' : '34%',
          overflow: 'visible',
          pointerEvents: 'none',
          /*
           * §415. Revealed by a clip, not by a dash offset.
           *
           * `pathLength={1}` with `strokeDasharray={1}` is the usual way to
           * draw a stroke on, and it is unreliable here: `preserveAspectRatio
           * ="none"` scales x and y differently, and the path length the
           * browser computes under that transform does not match the one the
           * dash pattern is normalised against. The stroke rendered in
           * fragments — a line under "mist", a hole, a line under "ke".
           *
           * An inset clip is exact under any transform, and says what it means:
           * show the left `drawn` fraction of the mark.
           */
          clipPath: `inset(-40% ${((1 - drawn) * 100).toFixed(2)}% -40% -10%)`,
        }}
      >
        <path
          d={path}
          fill="none"
          stroke={colour}
          /*
           * Scaled to the type it sits under. `non-scaling-stroke` makes the
           * width a count of screen pixels, so the pack's 3 is hairline against
           * a 90px headline and heavy against a caption. Four times the pack's
           * weight is what reads as drawn at display sizes without becoming a
           * highlighter.
           */
          strokeWidth={mark.stroke * 4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
};

/**
 * The line, split around the marked phrase.
 *
 * Literal match, and no match means no mark. Nothing here searches for
 * something close enough — a mark under the wrong words is worse than none,
 * and the worker picked the phrase from this exact text.
 */
function splitAround(text: string, phrase: string): [string, string, string] | null {
  const at = text.indexOf(phrase);
  if (at === -1) return null;
  return [text.slice(0, at), phrase, text.slice(at + phrase.length)];
}

/** One beat, drawn by its treatment. */
const Beat: React.FC<{
  beat: NarrativeBeat;
  treatment: NarrativeTreatment;
  palette: QuizPalette;
  brand: BrandTokens;
  type?: RenderTypography;
}> = ({ beat, treatment, palette, brand, type }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /*
   * §294's rule: the first frame is composed and legible before anything
   * animates. So the entrance moves the line a little and never fades it in
   * from nothing — a beat that starts invisible has spent the half second that
   * decides whether anyone watches.
   */
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.35) });
  const drift = interpolate(frame, [0, fps * 6], [0, -14], { extrapolateRight: 'clamp' });
  const size = sizeFor(beat.text, beat.role);

  /*
   * §415. The mark is drawn after the line has settled.
   *
   * A stroke that arrives with the words competes with them; one that lands a
   * beat later reads as somebody deciding that word mattered. Held until the
   * entrance spring is done, then travelling over a third of a second.
   */
  const drawn = interpolate(frame, [fps * 0.45, fps * 0.8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const parts = beat.mark ? splitAround(beat.text, beat.mark.phrase) : null;

  const line = (
    <span
      style={{
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: '-0.015em',
        color: palette.fg,
        transform: `translateY(${(1 - rise) * 16 + drift}px)`,
        ...face(type, 'display'),
      }}
    >
      {parts && beat.mark ? (
        <>
          {parts[0]}
          <Marked mark={beat.mark} colour={palette.accent} drawn={drawn}>
            {parts[1]}
          </Marked>
          {parts[2]}
        </>
      ) : (
        beat.text
      )}
    </span>
  );

  const common: React.CSSProperties = {
    padding: '150px 68px',
    flexDirection: 'column',
    backgroundColor: 'transparent',
  };

  if (treatment === 'statement') {
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'center' }}>
        {beat.kicker ? <Kicker text={beat.kicker} palette={palette} type={type} /> : null}
        {line}
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  if (treatment === 'anchored') {
    /* Type held at the top, so a photograph below it is the subject. */
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'flex-start' }}>
        {beat.kicker ? <Kicker text={beat.kicker} palette={palette} type={type} /> : null}
        {line}
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  if (treatment === 'split_rule') {
    /* A rule that draws itself as the line lands. Reads as a turn. */
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'center' }}>
        {beat.kicker ? <Kicker text={beat.kicker} palette={palette} type={type} /> : null}
        <div
          style={{
            height: 6,
            width: `${Math.round(rise * 46)}%`,
            backgroundColor: palette.accent,
            marginBottom: 34,
          }}
        />
        {line}
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  if (treatment === 'label_lead') {
    /*
     * The kicker at display size and the line beneath it. For a beat whose
     * label is the point — "1728", "Myth", "Tip 3" — where setting the label
     * small throws away the thing a viewer actually remembers.
     */
    return (
      <AbsoluteFill style={{ ...common, justifyContent: 'center' }}>
        {beat.kicker ? (
          <span
            style={{
              fontSize: 156,
              lineHeight: 0.94,
              letterSpacing: '-0.03em',
              color: palette.plate ? '#FFFFFF' : palette.rule,
              marginBottom: 26,
              transform: `translateY(${(1 - rise) * 20}px)`,
              ...face(type, 'display'),
            }}
          >
            {beat.kicker}
          </span>
        ) : null}
        <span
          style={{
            fontSize: Math.round(size * 0.72),
            lineHeight: 1.16,
            color: palette.fg,
            ...face(type, 'body'),
          }}
        >
          {beat.text}
        </span>
        {beat.source ? <Source text={beat.source} palette={palette} type={type} /> : null}
      </AbsoluteFill>
    );
  }

  /* `quiet` — the close. Small, low, and deliberately not a headline. */
  return (
    <AbsoluteFill style={{ ...common, justifyContent: 'flex-end' }}>
      <div
        style={{
          height: 4,
          width: `${Math.round(rise * 28)}%`,
          backgroundColor: brand.primary,
          marginBottom: 26,
        }}
      />
      <span
        style={{
          fontSize: 54,
          lineHeight: 1.16,
          color: palette.fg,
          transform: `translateY(${(1 - rise) * 12}px)`,
          ...face(type, 'body'),
        }}
      >
        {beat.text}
      </span>
    </AbsoluteFill>
  );
};

/**
 * §407. One beat's photograph, pushed slowly for the length of the beat.
 *
 * Two things move here and both are deliberate. The **picture changes between
 * beats**, which is the visual reset every short-form platform's guidance asks
 * for and which a single held still cannot give. And it **drifts within the
 * beat**, so a long beat is never a frozen frame — the slow scale is the
 * difference between a photograph and a slide.
 *
 * The scrim is computed per picture rather than once for the video, because the
 * whole point of §402 is that consecutive photographs are lit differently: a
 * hard-sun macro and a soft-window wide need different amounts of help before
 * type is legible on them.
 */
/**
 * Where a treatment puts its type, so the scrim can be dense in the same place.
 *
 * §407. The scrim was a fixed bottom-heavy gradient inherited from the quiz,
 * where the type is always low. `anchored` holds its type at the *top* and
 * `statement` centres it, so two of five treatments put white words exactly
 * where the picture was left brightest — and a bright photograph under
 * top-anchored type is unreadable however good the photograph is.
 */
const TYPE_ANCHOR: Record<NarrativeTreatment, 'top' | 'center' | 'bottom'> = {
  statement: 'center',
  anchored: 'top',
  split_rule: 'center',
  label_lead: 'center',
  quiet: 'bottom',
};

/** The scrim, as stops, dense where the type sits and light everywhere else. */
export function scrimStops(
  anchor: 'top' | 'center' | 'bottom',
  luminance: number,
): Array<[number, number]> {
  /*
   * How much help white type needs is a property of the picture. A dark
   * photograph already provides the contrast and a heavy scrim only destroys
   * it — the previous floor of 0.6 put a 60% black wash over an underexposed
   * crumb shot and turned a good photograph into a grey rectangle.
   */
  const peak = Math.min(0.82, Math.max(0.28, 0.2 + luminance * 0.75));
  /* A little weight at the foot on every picture: the wordmark lives there. */
  const foot = Math.min(peak, 0.34);
  if (anchor === 'top') {
    return [[0, peak], [38, peak * 0.4], [72, peak * 0.16], [100, foot]];
  }
  if (anchor === 'center') {
    return [[0, peak * 0.42], [30, peak * 0.86], [70, peak * 0.86], [100, foot]];
  }
  return [[0, peak * 0.18], [45, peak * 0.5], [100, peak]];
}

const Ground: React.FC<{
  src: string;
  /** §478. A clip, served from the bundle's public dir. Wins over `src`. */
  videoFile?: string;
  videoSeconds?: number;
  luminance?: number;
  durationInFrames: number;
  anchor: 'top' | 'center' | 'bottom';
  /** §441. What the screenplay asked this beat's frame to do. */
  move?: SceneMove;
}> = ({ src, videoFile, videoSeconds, luminance, durationInFrames, anchor, move }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  /*
   * §441. The screenplay's `move`, or the push every beat used to get.
   *
   * `push_in` is deliberately the *old* default made slightly stronger rather
   * than kept identical: when every beat pushed, the push carried no meaning
   * and had to be gentle enough not to tire. Now that it marks a reveal, it can
   * be a reveal.
   */
  const grammar = MOVE_GRAMMAR[move ?? 'push_in'];
  const span: [number, number] = [0, Math.max(1, durationInFrames)];
  const scale = interpolate(frame, span, [grammar.from, grammar.to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panX = interpolate(frame, span, [-grammar.panX, grammar.panX], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const stops = scrimStops(anchor, luminance ?? 0.5)
    .map(([at, alpha]) => `rgba(0,0,0,${alpha.toFixed(3)}) ${at}%`)
    .join(', ');
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {videoFile ? (
        /*
         * §478. Real motion. The camera grammar still applies on top of it —
         * a `push_in` on footage that is itself moving reads as intent, and a
         * `hold` lets the clip do the moving — so the same transform wraps
         * both. Muted: the bed and the voice own the audio, and a clip's own
         * sound under a narrator is the clearest tell of a stitched video.
         */
        <Loop
          /*
           * A beat longer than its clip would freeze on the last frame. Looping
           * is the lesser tell, and the worker ranks clips long enough not to
           * need it. Unknown length: loop the beat itself, which is a no-op.
           */
          durationInFrames={Math.max(1, Math.round((videoSeconds ?? durationInFrames / fps) * fps))}
          layout="none"
        >
          <OffthreadVideo
            src={staticFile(videoFile)}
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale}) translateX(${panX.toFixed(3)}%)`,
              transformOrigin: 'center center',
            }}
          />
        </Loop>
      ) : (
        <img
          src={src}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translateX(${panX.toFixed(3)}%)`,
            transformOrigin: 'center center',
          }}
        />
      )}
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(to bottom, ${stops})` }} />
    </AbsoluteFill>
  );
};

export const Narrative: React.FC<NarrativeProps> = ({
  brand,
  typography,
  beats,
  before,
  backgroundDataUri,
  backgroundLuminance,
  audioSrc,
  wordmark,
}) => {
  const { fps } = useVideoConfig();
  /*
   * §407. Two palettes, chosen per beat by what is behind *that* beat.
   *
   * `quizPalette(brand, overPhoto)` returns white type over a photograph and
   * the brand's ink over a flat card, because over a picture the ground is the
   * scrim rather than the brand. Computed once for the whole video, it read the
   * piece-level background — which per-beat pictures leave undefined — and set
   * dark ink over four photographs. Every word went nearly invisible, and it
   * looked exactly like a contrast bug in the scrim rather than what it was.
   */
  const overPhoto = React.useMemo(() => quizPalette(brand, true), [brand]);
  const overCard = React.useMemo(() => quizPalette(brand, false), [brand]);
  const treatments = React.useMemo(
    () => treatmentsForBeats(beats.map((b) => b.role), before ?? []),
    [beats, before],
  );

  let from = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}


      {beats.map((beat, i) => {
        const durationInFrames = Math.max(1, Math.round(beat.seconds * fps));
        const sequence = (
          <Sequence key={`${beat.role}-${i}`} from={from} durationInFrames={durationInFrames}>
            {/*
              §407. This beat's picture, or the piece's if it has none of its
              own. Inside the sequence, so it changes when the beat changes.
            */}
            {beat.backgroundVideoFile || (beat.backgroundDataUri ?? backgroundDataUri) ? (
              <Ground
                src={(beat.backgroundDataUri ?? backgroundDataUri) ?? ''}
                {...(beat.backgroundVideoFile ? { videoFile: beat.backgroundVideoFile } : {})}
                {...(beat.backgroundVideoSeconds ? { videoSeconds: beat.backgroundVideoSeconds } : {})}
                luminance={beat.backgroundLuminance ?? backgroundLuminance}
                durationInFrames={durationInFrames}
                anchor={TYPE_ANCHOR[treatments[i]!]}
                {...(beat.move ? { move: beat.move } : {})}
              />
            ) : null}
            <Beat
              beat={beat}
              treatment={treatments[i]!}
              palette={
                beat.backgroundVideoFile || (beat.backgroundDataUri ?? backgroundDataUri)
                  ? overPhoto
                  : overCard
              }
              brand={brand}
              type={typography}
            />
          </Sequence>
        );
        from += durationInFrames;
        return sequence;
      })}

      {wordmark ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 56, pointerEvents: 'none' }}>
          <span
            style={{
              fontSize: 26,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              /*
               * The wordmark sits over whatever the last beat drew, and every
               * beat in a photographed piece has a picture. The photo palette
               * is the safe one: white dimmed reads on a scrim and on a card,
               * where brand ink on a dark photograph does not.
               */
              color: (beats.some((b) => b.backgroundDataUri) || backgroundDataUri
                ? overPhoto
                : overCard).dimmed,
            }}
          >
            {wordmark}
          </span>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** Total runtime, so the composition can describe its own length. */
export function narrativeDurationSeconds(beats: Array<{ seconds: number }>): number {
  return beats.reduce((total, b) => total + b.seconds, 0);
}
