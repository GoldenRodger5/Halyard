/**
 * More than one way to tell the story. §203.
 *
 * `plan.ts` shipped with nine creative types declared and one implemented, and
 * composition selection was a fixed priority list that returned the first
 * template whose props could be built. Both halves pointed the same way: every
 * video was a before/after, rendered by `TransformationDiff`, opening on a
 * card. That is the "static recipe text with minor movement" complaint, and it
 * was never a rendering problem — it was the absence of a second planner.
 *
 * ## What makes two treatments materially different
 *
 * Not the words on the cards. Three things:
 *
 *   · **Structure** — which beats exist and in what order. A how-to is a
 *     sequence; a comparison is a fork; a myth/fact is a reversal.
 *   · **Pacing** — where the emphasis sits. A montage is all `quick` with one
 *     `hold` at the end; a myth/fact holds twice and does nothing else.
 *   · **Evidence** — which highlights are drawn on. A comparison needs a swap
 *     that carries an `alternative`; a how-to needs `technique` steps.
 *
 * A planner that cannot find its evidence returns `null`. That refusal is the
 * feature: it is what stops the selector from dressing a transformation up as a
 * countdown, and it is the same discipline `planBeforeAfter` already had.
 *
 * ## No model
 *
 * Every decision here is arithmetic over the artifact — how many swaps carry a
 * reason, whether a swap has an alternative, how many steps have notes. A model
 * that chose its own treatment and then rendered it would be grading its own
 * work, which is what `review_media` exists to prevent. §160 made this argument
 * for beats; it holds identically for the treatment above them.
 */
import type { Highlight, ProductArtifact } from '../connectors/types.js';
import { actionableInsights, type Insight } from '../learning/insights.js';
import {
  planBeforeAfter,
  transformationsIn,
  type CreativeBeat,
  type CreativePlan,
  type CreativeType,
  type PlanInput,
} from './plan.js';

/** Highlights of one kind, in artifact order. */
function highlightsOf(artifact: ProductArtifact, type: Highlight['type']): Highlight[] {
  return (artifact.highlights ?? []).filter((h) => h.type === type);
}

/** The hook beat every treatment opens on. Quick: it orients, it is not the story. */
function hookBeat(text: string): CreativeBeat {
  return { id: 'hook', role: 'hook', emphasis: 'quick', content: { text } };
}

/**
 * The footage beat, when a capture exists.
 *
 * Identical in every treatment on purpose: real product footage is the same
 * evidence whatever story surrounds it, and its length is a fact rather than a
 * share of the piece (§163).
 */
function footageBeat(input: PlanInput): CreativeBeat | null {
  if (!input.footage) return null;
  return {
    id: 'demo',
    role: 'demo',
    emphasis: 'hold',
    content: {},
    media: {
      file: input.footage.file,
      ...(input.footage.label ? { label: input.footage.label } : {}),
    },
    holdSeconds: input.footage.durationMs / 1000,
    sourcePath: `capture:${input.footage.file}`,
  };
}

function finish(
  creativeType: CreativeType,
  beats: CreativeBeat[],
  input: PlanInput,
  rationale: string,
): CreativePlan {
  return {
    creativeType,
    platform: input.platform,
    format: input.format,
    targetSeconds: input.targetSeconds,
    beats,
    // §158. Footage means captions need their own plate; a flat surface does not.
    captionBackdrop: input.footage ? 'media' : 'surface',
    evidence: beats.map((b) => b.sourcePath).filter((p): p is string => Boolean(p)),
    rationale,
  };
}

// ── how_to ─────────────────────────────────────────────────────────────────

/**
 * A sequence, not a transformation.
 *
 * Built from `technique` highlights, which are the step notes a product adapter
 * emits — real instructions attached to real steps. Needs at least two, because
 * one step is not a method, and caps at four because a short-form viewer will
 * not hold five in their head.
 *
 * Structurally this is the opposite of before/after: no beat is contrasted with
 * another, every beat carries equal weight, and the payoff is the last step
 * rather than the first change.
 */
export function planHowTo(artifact: ProductArtifact, input: PlanInput): CreativePlan | null {
  const steps = highlightsOf(artifact, 'technique').filter((h) => h.note);
  if (steps.length < 2) return null;

  const shown = steps.slice(0, 4);
  const beats: CreativeBeat[] = [hookBeat(artifact.headline)];

  const demo = footageBeat(input);
  if (demo) beats.push(demo);

  shown.forEach((step, i) => {
    beats.push({
      id: `step-${i}`,
      role: 'step',
      // The last step is the result, so it is what the piece lands on.
      emphasis: i === shown.length - 1 ? 'hold' : 'normal',
      content: { text: step.note!, ...(step.title ? { label: step.title } : {}) },
      sourcePath: step.sourcePath,
    });
  });

  return finish(
    'how_to',
    beats,
    input,
    `${shown.length} step${shown.length === 1 ? '' : 's'} in order, landing on the last` +
      (demo ? ', over captured product footage.' : '.'),
  );
}

// ── process_montage ────────────────────────────────────────────────────────

/**
 * The same steps, told fast.
 *
 * Every beat `quick` except the result. Where `how_to` teaches, this one is
 * rhythm — the appeal is watching a thing come together, not following it.
 * Needs at least three steps, because two quick beats is not a montage.
 *
 * Deliberately shares evidence with `how_to`. Two treatments can draw on the
 * same highlights and still be different videos; that is the point of separating
 * structure from source.
 */
export function planProcessMontage(
  artifact: ProductArtifact,
  input: PlanInput,
): CreativePlan | null {
  const steps = highlightsOf(artifact, 'technique').filter((h) => h.note);
  if (steps.length < 3) return null;

  const shown = steps.slice(0, 6);
  const beats: CreativeBeat[] = [hookBeat(artifact.headline)];

  const demo = footageBeat(input);
  if (demo) beats.push(demo);

  shown.forEach((step, i) => {
    beats.push({
      id: `item-${i}`,
      role: 'item',
      emphasis: 'quick',
      content: { text: step.title ?? step.note!, index: i + 1 },
      sourcePath: step.sourcePath,
    });
  });

  /* The montage exists for this frame. Everything before it is momentum. */
  beats.push({
    id: 'result',
    role: 'result',
    emphasis: 'hold',
    content: { text: artifact.headline },
  });

  return finish(
    'process_montage',
    beats,
    input,
    `${shown.length} steps at pace, holding only on the result.`,
  );
}

// ── listicle ───────────────────────────────────────────────────────────────

/**
 * A countdown.
 *
 * Drawn from swaps first, because a swap is a concrete change a viewer can
 * evaluate, and from chef notes when there are not enough. Needs three items —
 * two is a comparison and one is a claim.
 */
export function planListicle(artifact: ProductArtifact, input: PlanInput): CreativePlan | null {
  const swaps = transformationsIn(artifact);
  const notes = highlightsOf(artifact, 'chef_note').filter((h) => h.text);

  const items: Array<{ text: string; sourcePath: string }> = [
    ...swaps.map((s) => ({ text: s.after ? `${s.after}` : (s.reason ?? ''), sourcePath: s.sourcePath })),
    ...notes.map((n) => ({ text: n.text!, sourcePath: n.sourcePath })),
  ].filter((i) => i.text);

  if (items.length < 3) return null;

  const shown = items.slice(0, 5);
  const beats: CreativeBeat[] = [
    hookBeat(`${shown.length} things — ${artifact.headline}`),
  ];

  const demo = footageBeat(input);
  if (demo) beats.push(demo);

  /* Counted down, so the strongest lands last and the viewer waits for it. */
  shown.forEach((item, i) => {
    beats.push({
      id: `item-${i}`,
      role: 'item',
      emphasis: i === shown.length - 1 ? 'hold' : 'normal',
      content: { text: item.text, index: shown.length - i },
      sourcePath: item.sourcePath,
    });
  });

  return finish(
    'listicle',
    beats,
    input,
    `${shown.length} items counted down, strongest last.`,
  );
}

// ── comparison ─────────────────────────────────────────────────────────────

/**
 * Two viable options, and a verdict.
 *
 * Needs a swap carrying an `alternative` — a second adaptation the product
 * itself offered. That is the only honest source for this treatment: comparing
 * the adapted result against something invented would be fabricating product
 * behaviour, which §2.4 of the specification and gotcha 9 both forbid.
 */
export function planComparison(artifact: ProductArtifact, input: PlanInput): CreativePlan | null {
  const forked = transformationsIn(artifact).find((h) => h.alternative);
  if (!forked) return null;

  const beats: CreativeBeat[] = [
    hookBeat(artifact.headline),
    {
      id: 'option-a',
      role: 'before',
      emphasis: 'normal',
      content: { before: forked.before, after: forked.after },
      sourcePath: forked.sourcePath,
    },
    {
      id: 'option-b',
      role: 'after',
      emphasis: 'normal',
      content: { before: forked.before, after: forked.alternative! },
      sourcePath: forked.sourcePath,
    },
  ];

  const demo = footageBeat(input);
  if (demo) beats.splice(1, 0, demo);

  if (forked.reason) {
    /* The verdict is held: it is the only beat that resolves the fork. */
    beats.push({
      id: 'verdict',
      role: 'proof',
      emphasis: 'hold',
      content: { text: forked.reason },
      sourcePath: forked.sourcePath,
    });
  }

  return finish(
    'comparison',
    beats,
    input,
    'Two adaptations the product offered, held on the reason one wins.',
  );
}

// ── myth_fact ──────────────────────────────────────────────────────────────

/** Chef notes that read as a correction rather than a remark. */
const CORRECTIVE = /\b(actually|myth|common|mistake|instead|contrary|not\s+(?:true|necessary)|people think|often assumed|despite)\b/i;

/**
 * A reversal.
 *
 * Two held beats and nothing else: the belief, then what is actually true. The
 * shape only works when the note genuinely corrects something, so the
 * `CORRECTIVE` test is a gate rather than a ranking — a note that merely
 * explains has no myth in it, and staging one would be inventing the tension.
 */
export function planMythFact(artifact: ProductArtifact, input: PlanInput): CreativePlan | null {
  const note = highlightsOf(artifact, 'chef_note').find(
    (h) => h.text && CORRECTIVE.test(h.text),
  );
  if (!note) return null;

  const beats: CreativeBeat[] = [
    hookBeat(artifact.headline),
    { id: 'myth', role: 'myth', emphasis: 'hold', content: { text: note.text! }, sourcePath: note.sourcePath },
  ];

  const demo = footageBeat(input);
  if (demo) beats.push(demo);

  /* The strongest swap is what makes the correction concrete. */
  const evidence = transformationsIn(artifact)[0];
  if (evidence) {
    beats.push({
      id: 'fact',
      role: 'fact',
      emphasis: 'hold',
      content: { before: evidence.before, after: evidence.after, reason: evidence.reason },
      sourcePath: evidence.sourcePath,
    });
  }

  return finish(
    'myth_fact',
    beats,
    input,
    'A belief, then what the adaptation actually did.',
  );
}

// ── feature_demo ───────────────────────────────────────────────────────────

/**
 * The product, doing the thing.
 *
 * Footage-led: the capture is the spine and the cards are captions on it,
 * rather than the reverse. Requires footage — with no recording there is no
 * demo, and substituting a drawn approximation is precisely the fabrication
 * §2.4 rules out.
 */
export function planFeatureDemo(artifact: ProductArtifact, input: PlanInput): CreativePlan | null {
  const demo = footageBeat(input);
  if (!demo) return null;

  const beats: CreativeBeat[] = [hookBeat(artifact.headline), demo];

  const outcome = transformationsIn(artifact)[0];
  if (outcome) {
    beats.push({
      id: 'result',
      role: 'result',
      emphasis: 'hold',
      content: { text: outcome.after ?? artifact.headline },
      sourcePath: outcome.sourcePath,
    });
  }

  return finish(
    'feature_demo',
    beats,
    input,
    `${(demo.holdSeconds ?? 0).toFixed(1)}s of real product footage, framed by the outcome.`,
  );
}

// ── selection ──────────────────────────────────────────────────────────────

export interface TreatmentCandidate {
  plan: CreativePlan;
  /** How well the artifact supports this telling, before diversity. */
  support: number;
  /** What recent use costs it. */
  penalty: number;
  /**
   * What the account's own measured results add or subtract. §204.
   *
   * Zero when nothing has been learned about this treatment, which is the
   * state every account starts in and stays in until enough posts have been
   * measured. A learned belief is a thumb on the scale, never an override:
   * evidence support still dominates, so learning cannot select a treatment
   * the artifact does not carry.
   */
  learned: number;
  /** Which beliefs moved it, for the record. */
  learnedFrom: string[];
  score: number;
}

export interface SelectionInput extends PlanInput {
  /**
   * Creative types recently used on this account, most recent first.
   *
   * Read from `generation_meta.creative.type`, which generation has recorded
   * since §160 — so diversity needed no new column, only a reader.
   */
  recentTypes?: CreativeType[];
  /** How far back recency counts. Beyond this a type is free again. */
  recencyWindow?: number;
  /**
   * What this account's measured performance has taught us. §204.
   *
   * This is the consumption half of the learning loop, and it is the half that
   * is usually missing: a table of insights nobody reads is not learning. Only
   * beliefs about `creative_type` apply here, and only those `actionableInsights`
   * admits — `observed` notes and stale beliefs are filtered out before they
   * can move anything.
   */
  insights?: Insight[];
  /** For freshness filtering. Defaults to now. */
  now?: Date;
}

/**
 * How strongly the artifact supports each telling, independent of history.
 *
 * Support is evidence depth, not preference: a plan resting on four real steps
 * is better supported than one resting on two, and footage outranks cards
 * because it is the product rather than a description of it. Ties are broken by
 * the diversity penalty, which is where variety comes from.
 */
function supportFor(plan: CreativePlan): number {
  const hasFootage = plan.beats.some((b) => b.media);
  const evidenceBeats = plan.beats.filter((b) => b.sourcePath).length;
  return evidenceBeats + (hasFootage ? 3 : 0);
}

const DEFAULT_RECENCY_WINDOW = 6;

/**
 * Choose a treatment, and say why.
 *
 * Every planner runs. Those that refuse are not candidates — that is the
 * evidence gate. Among the rest, support decides, and recent use is subtracted
 * so a strong treatment does not become the only treatment.
 *
 * The penalty decays with distance: the most recent post costs the most, and a
 * type that has fallen out of the window costs nothing. This is what stops the
 * account converging on one template, which §6 of the specification names as a
 * failure mode and which the old fixed priority list guaranteed.
 */
export function selectCreativePlan(
  artifact: ProductArtifact,
  input: SelectionInput,
): { chosen: CreativePlan; considered: TreatmentCandidate[] } | null {
  const planners: Array<(a: ProductArtifact, i: PlanInput) => CreativePlan | null> = [
    planFeatureDemo,
    planBeforeAfter,
    planHowTo,
    planComparison,
    planMythFact,
    planListicle,
    planProcessMontage,
  ];

  const window = input.recencyWindow ?? DEFAULT_RECENCY_WINDOW;
  const recent = (input.recentTypes ?? []).slice(0, window);

  /*
   * §204. Only beliefs about which treatment to use, and only ones that have
   * earned the right to be acted on. `actionableInsights` drops `observed`
   * notes and anything past its review date, so a stale pattern cannot keep
   * steering choices after the behaviour behind it has changed.
   */
  const usable = actionableInsights(input.insights ?? [], input.now ?? new Date()).filter(
    (i) => i.feature === 'creative_type',
  );

  const considered: TreatmentCandidate[] = [];
  for (const planner of planners) {
    const plan = planner(artifact, input);
    if (!plan) continue;

    const support = supportFor(plan);
    /*
     * Distance-weighted. Position 0 is the last thing published and costs a
     * full point; the oldest inside the window costs a fraction of one. Summed,
     * so a type used three times running is penalised three times.
     */
    const penalty = recent.reduce(
      (sum, type, index) => (type === plan.creativeType ? sum + (window - index) / window : sum),
      0,
    );

    /*
     * Learning enters here, scaled by confidence and capped.
     *
     * `lift` is a relative difference, so a treatment that beat the baseline by
     * a quarter with full confidence moves the score by about one point — the
     * weight of a single piece of evidence, deliberately. Enough to break a tie
     * or overcome one recent use; never enough to beat a treatment the artifact
     * supports and this one does not. An unmeasured account learns nothing and
     * this term is zero, which is the honest starting state.
     */
    const applicable = usable.filter((i) => i.featureValue === plan.creativeType);
    const learned = applicable.reduce(
      (sum, i) => sum + Math.max(-1.5, Math.min(1.5, i.lift * i.confidence * 4)),
      0,
    );

    considered.push({
      plan,
      support,
      penalty,
      learned: Math.round(learned * 100) / 100,
      learnedFrom: applicable.map((i) => i.observation),
      score: support - penalty * 2 + learned,
    });
  }

  if (considered.length === 0) return null;

  considered.sort((a, b) => b.score - a.score || b.support - a.support);
  const winner = considered[0]!;

  const alternatives = considered.length - 1;
  const chosen: CreativePlan = {
    ...winner.plan,
    rationale:
      `${winner.plan.rationale} Chosen over ${alternatives} other ` +
      `treatment${alternatives === 1 ? '' : 's'} the artifact supported` +
      (winner.penalty > 0
        ? `, despite recent use`
        : recent.includes(winner.plan.creativeType)
          ? ''
          : `, and not used in the last ${recent.length}`) +
      /* Naming the belief is the point: a decision nobody can trace to its
       * evidence is indistinguishable from a decision nobody made. */
      (winner.learnedFrom.length > 0
        ? `. Measured performance argued for it: ${winner.learnedFrom.join(' ')}`
        : '.'),
  };

  return { chosen, considered };
}
