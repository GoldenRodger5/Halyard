/**
 * The creative plan: how a story should be told, decided before anything renders.
 *
 * §160. Halyard could already choose *what* to make — an account's format from
 * `chooseFormat`, a composition from `chooseVideoComposition`. What it could not
 * do was decide *how the story should be shown*: which moment is the before,
 * which is the change, what deserves to be held on, and what is a boring wait
 * that an edit should cut.
 *
 * ## Where this sits
 *
 * Above `chooseVideoComposition`, not instead of it. Composition selection asks
 * "which template can carry this artifact"; this asks "what are the beats of the
 * story and how long is each one". The plan's beats become `Scene[]`, which is
 * the shape `layoutScenes` has always taken — so the plan drives the existing
 * timing engine rather than a second one.
 *
 * ## Why there is no agent here
 *
 * Every decision below is a fact about the artifact or arithmetic over it. A
 * `swap` highlight that carries both a `before` and an `after` **is** a
 * transformation; that is not a judgement call. Beat order, weights and
 * durations are structure. Nothing here needs a model, and a model that chose
 * its own emphasis and then rendered it would be grading its own work — which
 * is exactly what `review_media` exists to prevent by staying on a different
 * provider.
 *
 * ## Product-agnosticism
 *
 * This reads `Highlight`, which every product adapter produces, and nothing
 * else. There is no recipe vocabulary here and there must never be: a product
 * whose adapter emits swaps gets `before_after` for free, whatever the product
 * is. Anything that needs to know what a swap *means* belongs behind the
 * adapter, per §146.
 */
import type { Highlight, ProductArtifact } from '../connectors/types.js';
import type { ImageAttribution, ImageLicense, ImageProvenance } from '../imagery/types.js';

/**
 * The creative treatments Halyard can reason about.
 *
 * §203. This said "only `before_after` is implemented", and that was the whole
 * of the creative problem: nine types were named, one existed, and selection
 * was a fixed priority list — so every video was the same treatment chosen the
 * same way. Seven are implemented now, in `creative/treatments.ts`, each
 * refusing to plan when the artifact does not support it.
 *
 * The remaining three (`announcement`, `transformation`, `product_update`) are
 * still names. They stay in the union because it is the extension point, and
 * `selectCreativePlan` can only ever return a type a planner produced — an
 * unimplemented name cannot be selected by accident.
 */
export const CREATIVE_TYPES = [
  'before_after',
  'tutorial',
  'feature_demo',
  'comparison',
  'how_to',
  'listicle',
  'announcement',
  'transformation',
  'product_update',
  /* §203. Added with planners, not ahead of them. */
  'myth_fact',
  'process_montage',
] as const;

export type CreativeType = (typeof CREATIVE_TYPES)[number];

/**
 * What a beat is for, in the story rather than in the layout.
 *
 * The role is what a composition keys off, so a template can render a `before`
 * differently from a `proof` without knowing which creative type produced it.
 */
export type BeatRole =
  | 'hook'
  | 'demo'
  | 'before'
  | 'change'
  | 'after'
  | 'proof'
  | 'cta'
  /**
   * §203. Roles the new treatments need.
   *
   * Every one of these must have a component in the render's `TreatmentSet`.
   * `PlannedBeats` skips a beat whose role it cannot draw — the scene still
   * occupies its slice of the timeline, so an unmapped role is not a missing
   * beat, it is blank frames that still cost seconds. `treatmentSetFor` and its
   * test exist to make that impossible to reintroduce.
   */
  | 'step'
  | 'item'
  | 'myth'
  | 'fact'
  | 'result';

/**
 * How much room a beat gets, relative to its neighbours.
 *
 * `hold` is the moment the whole piece exists for; `quick` is something the
 * viewer needs to have seen but should not wait through. These map to weights,
 * which is what `layoutScenes` already understands.
 */
export type BeatEmphasis = 'quick' | 'normal' | 'hold';

const EMPHASIS_WEIGHT: Record<BeatEmphasis, number> = { quick: 1, normal: 2, hold: 3 };
const EMPHASIS_MIN_SECONDS: Record<BeatEmphasis, number> = { quick: 1.2, normal: 2.4, hold: 3.6 };

export interface CreativeBeat {
  id: string;
  role: BeatRole;
  emphasis: BeatEmphasis;
  /**
   * What this beat shows. Shape is deliberately loose; compositions read what
   * they need.
   *
   * §203 added `label` and `index` for the sequential treatments — a how-to
   * step carries the step's own title, and a countdown item carries its number.
   * Both are content rather than style: the number in "3 —" is which item this
   * is, and a composition that invented it from array position would be
   * numbering a list the planner had already ordered.
   */
  content: {
    before?: string;
    after?: string;
    reason?: string;
    text?: string;
    label?: string;
    index?: number;
    /**
     * A figure the artifact actually contains. §229.
     *
     * Read by the `numeral` opening, which is unavailable without one. Never
     * synthesised to unlock the layout — a number on a frame is a claim, and
     * inventing one to get a nicer composition is fabricating evidence for a
     * design reason, which is the worst kind.
     */
    numeral?: string;
  };
  /**
   * Where in the raw artifact this beat came from.
   *
   * Carried so a rendered frame can be traced to the evidence behind it, the
   * same way `claims[].source` is. A beat with no provenance is a beat nobody
   * can check.
   */
  sourcePath?: string;
  /**
   * Real captured footage this beat plays.
   *
   * §163. Present only when a capture actually recorded the product doing the
   * thing. There is no default and no placeholder: a beat with `media` and no
   * file renders nothing, because the alternative is a synthetic screenshot of
   * a product state that never existed.
   */
  media?: { file: string; label?: string };
  /**
   * A still drawn full-bleed behind this beat. §211, §213.
   *
   * Carries its provenance, because what a picture is allowed to *say* depends
   * entirely on where it came from — and a beat is where that question gets
   * answered.
   */
  image?: {
    url: string;
    alt: string;
    provenance: ImageProvenance;
    license: ImageLicense;
    attribution?: ImageAttribution;
  };
  /**
   * This beat renders a visible credit for its image. §216.
   *
   * Set by a composition that has somewhere to put one — a Pinterest tile, an
   * inset frame. A full-bleed beat cannot, which is why an
   * `attribution_required` picture is dropped from one and kept on the other.
   */
  attributed?: boolean;
  /**
   * How long this beat naturally runs, when it has a natural length.
   *
   * §163. Footage does. An emphasis says how *important* a beat is, and the
   * timing engine turns that into a share of the piece — which is right for a
   * card, whose length is a choice, and wrong for a video, whose length is a
   * fact. A held demo beat took 8.4s of a 27.9s piece with 3.8s of footage, and
   * Remotion froze the last frame for the difference.
   */
  holdSeconds?: number;
}

/**
 * Which caption treatment the beats call for.
 *
 * A decision, not a style: the render resolves it through `captionStyle` (§158)
 * with the product's own brand tokens. Two systems styling captions is how they
 * start disagreeing.
 */
export type CaptionBackdropKind = 'surface' | 'media';

export interface CreativePlan {
  creativeType: CreativeType;
  platform: string;
  format: string;
  targetSeconds: number;
  beats: CreativeBeat[];
  captionBackdrop: CaptionBackdropKind;
  /** Every artifact path this plan rests on, for provenance. */
  evidence: string[];
  /** Why this plan looks like this, in one line an operator can read. */
  rationale: string;
}

export interface PlanInput {
  platform: string;
  format: string;
  /** Usually the voiceover length, so the beats fill the piece exactly. */
  targetSeconds: number;
  /** Caps how many transformations are shown. Platform-dependent; see below. */
  maxChanges?: number;
  /**
   * Footage a capture actually produced, if any.
   *
   * §163. Supplied by the caller, which knows whether a recording exists;
   * absent means the plan has no footage to show and simply does not plan a
   * demo beat. The planner never goes looking for a file.
   */
  footage?: { file: string; label?: string; durationMs: number };
}

/**
 * How many changes are worth showing, by platform.
 *
 * Not a style preference: a 9:16 frame fits about three before/after pairs
 * before the bottom one lands under the platform's own UI, and a short-form
 * viewer will not sit through more. Platforms absent here take the default.
 */
const MAX_CHANGES_BY_PLATFORM: Record<string, number> = {
  tiktok: 3,
  instagram: 3,
  youtube: 4,
  pinterest: 2,
};

const DEFAULT_MAX_CHANGES = 3;

/**
 * The transformations in an artifact, strongest first.
 *
 * "Strongest" is deterministic: a change that explains itself is worth more
 * screen time than one that does not, and a longer explanation usually means a
 * more substantive change. No model is asked which swap is interesting.
 */
export function transformationsIn(artifact: ProductArtifact): Highlight[] {
  return (artifact.highlights ?? [])
    .filter((h) => h.type === 'swap' && h.before && h.after)
    .sort((a, b) => (b.reason?.length ?? 0) - (a.reason?.length ?? 0));
}

/**
 * A before/after plan, or `null` when the artifact has no transformation.
 *
 * Returning `null` is the honest outcome and the important one: an artifact
 * with nothing that changed cannot be told as a before/after, and the caller
 * falls back rather than being handed a plan that renders an empty stage. This
 * is the same refusal `chooseVideoComposition` makes when no template fits.
 */
export function planBeforeAfter(
  artifact: ProductArtifact,
  input: PlanInput,
): CreativePlan | null {
  const changes = transformationsIn(artifact);
  if (changes.length === 0) return null;

  const limit =
    input.maxChanges ?? MAX_CHANGES_BY_PLATFORM[input.platform] ?? DEFAULT_MAX_CHANGES;
  const shown = changes.slice(0, Math.max(1, limit));

  const beats: CreativeBeat[] = [
    {
      id: 'hook',
      role: 'hook',
      // Quick on purpose. The headline is orientation, not the story, and a
      // short-form viewer decides during it rather than after it.
      emphasis: 'quick',
      content: { text: artifact.headline },
    },
  ];

  /*
   * §163. The product doing the thing, before the cards that describe it.
   *
   * Placed second on purpose. The hook orients, and then the strongest evidence
   * available is the product itself — a card claiming a swap is an assertion,
   * footage of the swap happening is the thing itself. Held, because real
   * footage is what a viewer stops for.
   *
   * It exists only when `input.footage` does. There is no fallback: no capture
   * means no demo beat, not a drawn approximation of one.
   */
  if (input.footage) {
    beats.push({
      id: 'demo',
      role: 'demo',
      emphasis: 'hold',
      content: {},
      media: { file: input.footage.file, ...(input.footage.label ? { label: input.footage.label } : {}) },
      // The footage's own length, not a share of the piece.
      holdSeconds: input.footage.durationMs / 1000,
      // Provenance points at the recording, so a frame traces to the capture
      // that produced it the same way a card traces to an artifact path.
      sourcePath: `capture:${input.footage.file}`,
    });
  }

  shown.forEach((change, index) => {
    beats.push({
      id: `change-${index}`,
      role: 'change',
      /*
       * The first change is the one the piece exists for, so it is held. The
       * rest are corroboration and are paced normally — three equally weighted
       * changes read as a list, which is a different creative type.
       */
      emphasis: index === 0 ? 'hold' : 'normal',
      content: { before: change.before, after: change.after, reason: change.reason },
      sourcePath: change.sourcePath,
    });
  });

  // A reason on the leading change is evidence the viewer can check, so it
  // earns its own beat rather than being crowded into the transformation.
  const proof = shown[0]?.reason;
  if (proof) {
    beats.push({
      id: 'proof',
      role: 'proof',
      emphasis: 'normal',
      content: { text: proof },
      sourcePath: shown[0]!.sourcePath,
    });
  }

  return {
    creativeType: 'before_after',
    platform: input.platform,
    format: input.format,
    targetSeconds: input.targetSeconds,
    beats,
    /*
     * Footage decides the caption treatment. §158 measures contrast against a
     * known surface colour, which it cannot do over video — so a plan carrying
     * footage asks for the media plate, and captions stay legible over frames
     * nobody sampled in advance.
     *
     * Deliberately decided once for the whole plan rather than per beat. Only
     * one beat is footage, so a per-beat decision would switch caption styles
     * mid-piece; a viewer reads that as two different videos spliced together.
     * The plate over a flat surface is merely a stronger caption, and stronger
     * is the safe direction to be wrong in.
     */
    captionBackdrop: input.footage ? 'media' : 'surface',
    evidence: beats.map((b) => b.sourcePath).filter((p): p is string => Boolean(p)),
    rationale:
      `${shown.length} of ${changes.length} transformation${changes.length === 1 ? '' : 's'} shown, ` +
      `strongest first, held on the leading change` +
      (input.footage ? ', opening on captured product footage.' : '.'),
  };
}

/**
 * The plan as scenes, for `layoutScenes`.
 *
 * Deliberately the existing `Scene` shape — `{ id, weight, minSeconds }` — so
 * the plan feeds the timing engine the compositions already use. A second
 * timing system would be a second set of rounding bugs.
 */
export function beatsToScenes(
  plan: CreativePlan,
): Array<{ id: string; weight: number; minSeconds: number; maxSeconds?: number }> {
  return plan.beats.map((beat) => {
    /*
     * A beat with a natural length keeps it. Weight is derived from that length
     * on the same scale emphasis uses — `EMPHASIS_MIN_SECONDS.normal` seconds
     * per `EMPHASIS_WEIGHT.normal` — so one beat measured in seconds and the
     * rest measured in importance still divide the piece coherently.
     */
    if (beat.holdSeconds !== undefined) {
      const perWeight = EMPHASIS_MIN_SECONDS.normal / EMPHASIS_WEIGHT.normal;
      return {
        id: beat.id,
        weight: beat.holdSeconds / perWeight,
        minSeconds: beat.holdSeconds,
        // Both bounds, because this length is a fact: stretching it holds a
        // frozen frame and shrinking it cuts the recording short.
        maxSeconds: beat.holdSeconds,
      };
    }
    return {
      id: beat.id,
      weight: EMPHASIS_WEIGHT[beat.emphasis],
      minSeconds: EMPHASIS_MIN_SECONDS[beat.emphasis],
    };
  });
}

/**
 * Whether a captured step is worth showing, given the plan.
 *
 * §159's `elide` already measures a wait and cuts it with the real elapsed time
 * as a caption. What it could not do is know whether *this* transition is the
 * one the story is about. A plan that holds on the change says so here, and a
 * step covering that change survives even if it was slow.
 *
 * Nothing is fabricated either way: an elided step is still reported with its
 * measured duration, and a kept step is still the real footage.
 */
export function stepDeservesEmphasis(
  plan: CreativePlan,
  step: { name: string; elide?: boolean },
): boolean {
  const held = plan.beats.some((b) => b.emphasis === 'hold');
  if (!held) return false;
  // A step the flow itself marked as a wait is never emphasis, however
  // important the surrounding story is. Holding on a spinner is still a spinner.
  if (step.elide) return false;
  return /swap|change|result|after|transform/i.test(step.name);
}

/**
 * A span of captured footage worth showing.
 *
 * §163. A recording spans the whole browser session — in the first live capture
 * that was 50 seconds, of which about ten were the product doing anything and
 * forty were a *different*, drifted flow waiting on a selector that no longer
 * exists. Playing the file is not an option; the beat needs spans.
 */
export interface FootageSpan {
  startMs: number;
  endMs: number;
  /** The steps this span covers, so the cut can be explained. */
  steps: string[];
}

/** A captured step, as `runFlow` reports it. */
export interface CapturedStep {
  step: string;
  action?: string;
  ok: boolean;
  startMs?: number;
  endMs?: number;
  elide?: boolean;
  /** The flow ran this to produce the artifact, and it is not part of the story. §166. */
  setup?: boolean;
  /**
   * §303/§324. The element that was tapped, as fractions of the viewport.
   *
   * The whole box, so a ring can be the size of what was pressed rather than a
   * constant that is wrong for everything: a diet chip and a full-width submit
   * button need very different rings, and neither is 132 pixels.
   */
  at?: { x: number; y: number; width: number; height: number };
  /** A line worth saying about this step, from the flow definition. */
  narration?: string;
}

/**
 * Actions that occupy no screen time worth keeping.
 *
 * Filtered by **action**, not by step name: a name is prose an author chose and
 * `let the result settle` reads nothing like `wait`, while its action is
 * exactly that. Names drift; the action vocabulary is the flow contract.
 */
const SILENT_ACTIONS = new Set(['wait', 'still']);

/**
 * The parts of a recording that show the product doing something.
 *
 * Returns **spans**, plural, and that is the whole point. In the real capture
 * the adaptation wait sits in the middle: the result card appears *during* it.
 * One span either includes three seconds of a spinner or cuts away before the
 * result exists. Two spans joined — setup, then result — is what an editor
 * would do, and it is what `elide` has meant since §159.
 *
 * Deterministic and product-agnostic. Nothing is fabricated: every boundary is
 * a measured offset from the real recording, so the footage inside a span is
 * exactly what happened.
 */
export function footageSpansFor(
  steps: CapturedStep[],
  options: { minSpanMs?: number; padMs?: number } = {},
): FootageSpan[] {
  const padMs = options.padMs ?? 200;
  const minSpanMs = options.minSpanMs ?? 400;

  const ordered = [...steps].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

  /**
   * A settle straight after an elided step is the payoff, not dead air.
   *
   * §163. The first cut of real footage dropped every `wait`, and the result
   * card was never on screen: it appears *during* the adaptation wait, which is
   * elided, and stays up through the settle that follows. Cutting both showed
   * the viewer the setup and then a 400ms flash of an ingredient expanding —
   * the product's actual output, missing.
   *
   * So a wait is held when the step before it was cut. That is the moment the
   * elision exists to reach.
   */
  const isPayoff = (index: number): boolean => {
    const previous = ordered[index - 1];
    return Boolean(previous?.elide) && (ordered[index]?.action ?? '') === 'wait';
  };

  const shows = (s: CapturedStep, index: number): boolean =>
    s.ok &&
    s.startMs !== undefined &&
    s.endMs !== undefined &&
    !s.elide &&
    /*
     * §166. Setup is excluded here and nowhere else. It ran, it is recorded in
     * the step results with its measured offsets, and the artifact depends on
     * it — this withholds screen time and nothing else. Note it is checked
     * *before* `isPayoff`, so a setup step can never be promoted back in by
     * happening to follow an elision.
     */
    !s.setup &&
    (isPayoff(index) || !SILENT_ACTIONS.has(s.action ?? '')) &&
    s.endMs - s.startMs >= 30;

  const spans: FootageSpan[] = [];
  let current: CapturedStep[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const startMs = Math.max(0, current[0]!.startMs! - padMs);
    const endMs = current[current.length - 1]!.endMs! + padMs;
    if (endMs - startMs >= minSpanMs) {
      spans.push({ startMs, endMs, steps: current.map((s) => s.step) });
    }
    current = [];
  };

  ordered.forEach((step, index) => {
    if (shows(step, index)) current.push(step);
    else flush();
  });
  flush();

  /*
   * Padding can push neighbouring spans into each other, and two overlapping
   * cuts would replay the same frames. Merged so the timeline only moves
   * forward.
   */
  return spans.reduce<FootageSpan[]>((merged, span) => {
    const last = merged[merged.length - 1];
    if (last && span.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs);
      last.steps = [...last.steps, ...span.steps];
      return merged;
    }
    merged.push({ ...span });
    return merged;
  }, []);
}

/** Total footage kept, in milliseconds. */
export function footageDurationMs(spans: FootageSpan[]): number {
  return spans.reduce((total, s) => total + (s.endMs - s.startMs), 0);
}


/**
 * §303. Turn a capture into things a walkthrough can point at.
 *
 * `WalkthroughCallout` has carried an `at` since §298 and every callout ever
 * built passed `at: null`, which pins the text beside the device instead of on
 * the control — the ring, the whole reason the field exists, never drew. The
 * runner now records where each tap landed (§303), and this is the other half:
 * the mapping from a capture into the walkthrough's own terms.
 *
 * ## Cut time, not recording time
 *
 * The part that is easy to get wrong and impossible to notice. The recording
 * spans the whole session and `cutFootage` removes the elided stretches, so a
 * step that began at 34s in the raw file may begin at 11s in the footage a
 * viewer sees. A callout placed at the raw offset points at the right *place*
 * at the wrong *moment* — which looks like a rendering glitch rather than a bug
 * and would survive every gate here.
 *
 * So each step's start is mapped through the spans that were actually kept. A
 * step in no kept span produces no callout at all: it is not on screen, and a
 * callout about something the viewer cannot see is the fabrication §296 forbids
 * in its visual form.
 */
export function calloutSourceFromCapture(
  steps: CapturedStep[],
  spans: FootageSpan[],
): Array<{
  label: string;
  atSeconds: number;
  at: { x: number; y: number; width: number; height: number } | null;
}> {
  const out: Array<{
    label: string;
    atSeconds: number;
    at: { x: number; y: number; width: number; height: number } | null;
  }> = [];

  for (const step of steps) {
    if (!step.ok || step.startMs === undefined) continue;
    /* Setup ran, and §166 is explicit that it gets no screen time. */
    if (step.setup) continue;

    /* Where this step's start falls in the cut, or nowhere. */
    let elapsed = 0;
    let cutMs: number | null = null;
    for (const span of spans) {
      if (step.startMs >= span.startMs && step.startMs <= span.endMs) {
        cutMs = elapsed + (step.startMs - span.startMs);
        break;
      }
      elapsed += span.endMs - span.startMs;
    }
    if (cutMs === null) continue;

    /*
     * The flow's own narration when it wrote one, and the step name otherwise.
     * The name is a label an author chose for a log line, so it is the fallback
     * rather than the source — but it is honest, because it describes the thing
     * that actually happened.
     */
    const label = (step.narration ?? step.step).trim();
    if (label.length === 0) continue;

    out.push({
      label,
      atSeconds: Number((cutMs / 1000).toFixed(2)),
      at: step.at ?? null,
    });
  }

  return out;
}


/**
 * §316. The cut a *walkthrough* needs, which is not the cut a beat needs.
 *
 * `footageSpansFor` keeps the stretches where something happens and drops
 * everything else, which is right for a demo beat: a two-second clip of the
 * result appearing is exactly what that beat wants. Run against the real
 * adapt-and-reveal capture it kept **3.2 seconds of 98**, because a click takes
 * about a hundred milliseconds and the cut is a sum of step durations.
 *
 * A walkthrough is a different claim. Its subject is *using the product*, so
 * the time between the actions is the content — the pause where a person reads
 * the screen, the moment the diet chips appear. Cut to the actions alone it
 * becomes a flicker of unrelated frames, which shows nothing and looks broken.
 *
 * So this keeps one continuous run from the first visible step to the last, and
 * removes only the waits long enough to be dead air. Same recording, same
 * honesty about what was on screen — a different question asked of it.
 *
 * §166 still holds: setup steps get no screen time. What changes is that the
 * *gaps* between shown steps are kept rather than discarded.
 */
export function walkthroughSpans(
  steps: CapturedStep[],
  options: { deadAirMs?: number } = {},
): FootageSpan[] {
  /*
   * Two seconds. Below that a pause reads as someone thinking, which is what
   * using software looks like; above it, nothing is happening and the viewer
   * knows it.
   */
  const deadAirMs = options.deadAirMs ?? 2000;

  const ordered = [...steps]
    .filter((s) => s.ok && s.startMs !== undefined && s.endMs !== undefined)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

  const shown = ordered.filter((s) => !s.setup);
  if (shown.length === 0) return [];

  const spans: FootageSpan[] = [];
  let from = shown[0]!.startMs!;
  let covered: string[] = [];

  for (const step of shown) {
    /*
     * A long wait ends the current span and starts the next one after it. The
     * wait itself is dropped: it is the adaptation running, which is real work
     * and not something anybody watches.
     */
    const duration = step.endMs! - step.startMs!;
    if (step.elide && duration >= deadAirMs) {
      if (step.startMs! > from) {
        spans.push({ startMs: from, endMs: step.startMs!, steps: covered });
      }
      from = step.endMs!;
      covered = [];
      continue;
    }
    covered.push(step.step);
  }

  const last = shown[shown.length - 1]!;
  if (last.endMs! > from) spans.push({ startMs: from, endMs: last.endMs!, steps: covered });

  return spans;
}
