/**
 * Performing a correction, and reporting exactly what it touched.
 *
 * §165. Each applier does one bounded thing and returns the components it
 * *actually wrote* — not the ones it was permitted to. The controller checks
 * that return against `ACTION_SCOPE` before accepting the iteration, so the
 * scope rule is enforced on behaviour rather than trusted to intent.
 *
 * Two of these reuse the retry loop that already exists inside `writeDraft` and
 * `writeVoScript`: those functions generate, run the deterministic gates over
 * the result, feed `buildFeedback` back to the model and try again. That is
 * self-correction at *copy time*, and it has been there all along. What §165
 * adds is the loop that cannot live there — audio, visual, retention and
 * coherence are measured after synthesis and rendering, in different jobs, so
 * nothing inside a single generation call can see them.
 */
import type { Component, CorrectionAction, Defect } from '@halyard/core';
import { resolveDestination } from '@halyard/core';
import type { HandlerContext } from '../poller.js';

export { requeueFinalRenders };

export interface CorrectionInput {
  contentItemId: string;
  action: CorrectionAction;
  defects: Defect[];
  /** Rules fixed by an earlier iteration, which this correction must not undo. */
  doNotRegress: Defect[];
}

export interface CorrectionOutcome {
  /** Components actually written. Empty means the correction changed nothing. */
  changed: Component[];
  /** One line for the iteration history. */
  note: string;
  /** Set when the applier concluded the defect is not correctable after all. */
  escalate?: string;
}

/**
 * The instruction given to a model-backed applier.
 *
 * Assembled deterministically from the defects, so the model is told what the
 * gates found rather than asked to form its own opinion about the artifact. The
 * `doNotRegress` half is §6: without it, iteration 2 is free to reintroduce the
 * defect iteration 1 removed, and the loop becomes a set of independent
 * attempts rather than a constrained optimisation.
 */
export function correctionNote(input: Pick<CorrectionInput, 'defects' | 'doNotRegress'>): string {
  const lines = ['A previous version of this failed automated checks. Fix exactly these problems:'];
  for (const defect of input.defects) {
    lines.push(`- [${defect.rule}] ${defect.observation} — ${defect.rootCause}`);
  }
  if (input.doNotRegress.length > 0) {
    lines.push('', 'Earlier versions failed these checks and they are now fixed. Do not reintroduce them:');
    for (const defect of input.doNotRegress) {
      lines.push(`- [${defect.rule}] ${defect.observation}`);
    }
  }
  lines.push('', 'Change only what is required to fix the problems listed. Leave everything else exactly as it is.');
  return lines.join('\n');
}

/** Terms the audio gate named as the likely mispronunciations. */
export function lexiconTermsFrom(defects: Defect[]): string[] {
  const terms = new Set<string>();
  for (const defect of defects) {
    const evidence = defect.evidence as { suggestedLexiconTerms?: unknown } | undefined;
    if (Array.isArray(evidence?.suggestedLexiconTerms)) {
      for (const term of evidence.suggestedLexiconTerms) {
        if (typeof term === 'string' && term.trim()) terms.add(term.trim());
      }
    }
  }
  return [...terms];
}

/**
 * The word ceiling that would bring narration inside the pacing window.
 *
 * Derived from the measurement rather than guessed: the gate reports words per
 * minute and the mix reports its duration, so the number of words that fits is
 * arithmetic. Targeting the middle of the window rather than its edge, because
 * a script written to the exact limit fails again on any variation in delivery.
 */
export function wordCeilingFor(durationSeconds: number, targetWpm = 158): number {
  return Math.max(12, Math.floor((durationSeconds / 60) * targetWpm));
}

/**
 * Rebalance beats so no single one holds the frame past the retention ceiling.
 *
 * Deterministic, and deliberately narrow: it redistributes weight, and it does
 * not add beats, remove beats, reorder them or change what any of them says.
 * Inventing a new beat to break up a static stretch would be inventing content
 * to satisfy a metric, which is the failure mode `retention` exists to detect
 * rather than to cause.
 *
 * Returns null when there is nothing it can safely do — a two-beat plan cannot
 * be rebalanced into a pattern interrupt, and pretending otherwise would burn
 * an iteration.
 */
export function rebalanceBeats(
  beats: Array<{ id: string; weight: number; minSeconds: number; maxSeconds?: number }>,
): Array<{ id: string; weight: number; minSeconds: number; maxSeconds?: number }> | null {
  if (beats.length < 3) return null;

  const flexible = beats.filter((b) => b.maxSeconds === undefined);
  if (flexible.length < 2) return null;

  const heaviest = flexible.reduce((a, b) => (b.weight > a.weight ? b : a));
  // Nothing dominates, so nothing to break up.
  if (heaviest.weight <= 2) return null;

  const donated = heaviest.weight / 3;
  const receivers = flexible.filter((b) => b.id !== heaviest.id);

  return beats.map((beat) => {
    if (beat.id === heaviest.id) {
      return { ...beat, weight: Number((beat.weight - donated).toFixed(4)) };
    }
    if (receivers.some((r) => r.id === beat.id)) {
      return { ...beat, weight: Number((beat.weight + donated / receivers.length).toFixed(4)) };
    }
    return beat;
  });
}

/**
 * Flip the caption treatment to the stronger of the two §158 supports.
 *
 * A contrast failure over a flat surface is corrected by asking for the media
 * plate, which §158 guarantees to AA against whatever is behind it. There is no
 * third option and no free parameter, which is why this is deterministic rather
 * than a model choosing a colour.
 *
 * Returns null when the plate is already in use — that is the strongest
 * treatment available, so a contrast failure under it is not a treatment
 * problem and the controller should stop rather than churn.
 */
export function strongerBackdrop(current: unknown): 'media' | null {
  return current === 'media' ? null : 'media';
}


/**
 * Put the final renders back in the queue so a rebuild actually happens.
 *
 * §165, found by running this for real. `tts` releases renders whose status is
 * `queued` — that is the contract generation set up, where the render row is
 * created but deliberately not enqueued until the audio exists. After a
 * *successful* render those rows read `done`, so a correction that cleared the
 * voiceover produced new audio, released nothing, and left the old video in
 * place with the media gates never re-running.
 *
 * The symptom was `rendersReleased: 0` in a log line that otherwise looked like
 * a clean success, which is exactly the class of failure this codebase keeps
 * finding in itself: the green result that did nothing.
 */
async function requeueFinalRenders(ctx: HandlerContext, contentItemId: string): Promise<number> {
  const { rowCount } = await ctx.pool.query(
    `update renders set status = 'queued', output_asset_id = null
      where content_item_id = $1 and quality = 'final' and status <> 'queued'`,
    [contentItemId],
  );
  return rowCount ?? 0;
}

/** The renders whose input props a visual correction must rewrite. */
async function finalRenders(
  ctx: HandlerContext,
  contentItemId: string,
): Promise<Array<{ id: string; input_props: Record<string, unknown> }>> {
  const { rows } = await ctx.pool.query<{ id: string; input_props: Record<string, unknown> }>(
    `select id, input_props from renders
      where content_item_id = $1 and quality = 'final'
      order by created_at`,
    [contentItemId],
  );
  return rows;
}

/**
 * Apply one correction.
 *
 * Every branch either changes something and says what, or refuses and says why.
 * There is deliberately no fall-through that regenerates the item wholesale:
 * an action with no applier escalates, because a correction nobody wrote is not
 * the same as permission to rewrite everything.
 */
export async function applyCorrection(
  ctx: HandlerContext,
  input: CorrectionInput,
): Promise<CorrectionOutcome> {
  switch (input.action) {
    case 'remeasure':
      // Nothing about the artifact changes. The measurement is what is redone.
      return { changed: ['measurement'], note: 'Re-running the measurement that did not complete.' };

    case 'fix_destination':
      return fixDestination(ctx, input);

    case 'adjust_caption_treatment':
      return adjustCaptionTreatment(ctx, input);

    case 'adjust_scene_timing':
    case 'resequence_scenes':
      return adjustPlan(ctx, input);

    case 'resynthesise_voiceover':
      return resynthesise(ctx, input);

    case 'revise_copy':
    case 'reground_claims':
    case 'rewrite_vo_script':
      /*
       * The model-backed appliers are wired in `correct.ts`, which already
       * holds the product, voice and artifact context they need and which is
       * where every other model call in this pipeline is made from. Splitting
       * them out would mean rebuilding that context here.
       */
      return { changed: [], note: 'delegated', escalate: undefined };

    case 'escalate':
      return { changed: [], note: 'No correction is applicable.', escalate: 'Action is escalate.' };
  }
}

async function fixDestination(
  ctx: HandlerContext,
  input: CorrectionInput,
): Promise<CorrectionOutcome> {
  const { rows } = await ctx.pool.query<{
    product_id: string;
    category: string;
    link_url: string | null;
    product_artifact: unknown;
  }>(
    `select product_id, category, link_url, product_artifact from content_items where id = $1`,
    [input.contentItemId],
  );
  const item = rows[0];
  if (!item) return { changed: [], note: 'item vanished', escalate: 'The item no longer exists.' };

  const { rows: destinations } = await ctx.pool.query<{ destinations: unknown }>(
    `select destinations from products where id = $1`,
    [item.product_id],
  );

  const configured = destinations[0]?.destinations as Record<string, unknown> | null;
  if (!configured || Object.keys(configured).length === 0) {
    /*
     * Nothing to correct *to*. Choosing where a post sends people is a product
     * decision, and inventing a URL is the link equivalent of fabricating
     * evidence — it would pass the gate and send real people somewhere nobody
     * chose.
     */
    return {
      changed: [],
      note: 'no configured destination',
      escalate: 'The product has no configured destination, and a URL cannot be invented.',
    };
  }

  const decision = resolveDestination({
    category: item.category,
    destinations: configured as never,
    artifact: (item.product_artifact as { raw?: unknown } | null) ?? null,
  });

  if (!decision.url) {
    /*
     * The router said why it could not build one — a missing share token, most
     * often. Carried through verbatim rather than restated, because the reason
     * is the actionable half for whoever picks this up.
     */
    return {
      changed: [],
      note: 'no destination resolves',
      escalate: `No destination could be built: ${decision.blockedBy ?? decision.reason}`,
    };
  }

  if (decision.url === item.link_url) {
    return {
      changed: [],
      note: 'destination unchanged',
      escalate: `The destination gate rejected ${item.link_url ?? 'a missing link'}, and the router resolves to the same URL, so this cannot be corrected automatically.`,
    };
  }

  await ctx.pool.query(
    `update content_items set link_url = $2, destination_type = $3 where id = $1`,
    [input.contentItemId, decision.url, decision.type],
  );
  return { changed: ['link'], note: `Destination re-resolved to ${decision.type}: ${decision.reason}` };
}

async function adjustCaptionTreatment(
  ctx: HandlerContext,
  input: CorrectionInput,
): Promise<CorrectionOutcome> {
  const renders = await finalRenders(ctx, input.contentItemId);
  if (renders.length === 0) {
    return { changed: [], note: 'no render', escalate: 'There is no render to adjust.' };
  }

  let changed = 0;
  for (const render of renders) {
    const next = strongerBackdrop(render.input_props?.captionBackdrop);
    if (!next) continue;
    await ctx.pool.query(
      `update renders
          set input_props = input_props::jsonb || $2::jsonb, status = 'queued', output_asset_id = null
        where id = $1`,
      [render.id, JSON.stringify({ captionBackdrop: next })],
    );
    changed += 1;
  }

  if (changed === 0) {
    return {
      changed: [],
      note: 'already at the strongest caption treatment',
      escalate:
        'Captions already use the media plate, which is the strongest treatment §158 provides, so this is not a treatment problem.',
    };
  }
  return { changed: ['caption_style'], note: `Caption backdrop raised to the media plate on ${changed} render(s).` };
}

async function adjustPlan(
  ctx: HandlerContext,
  input: CorrectionInput,
): Promise<CorrectionOutcome> {
  const renders = await finalRenders(ctx, input.contentItemId);
  let changed = 0;

  for (const render of renders) {
    const beats = render.input_props?.beats;
    if (!Array.isArray(beats)) continue;

    const rebalanced = rebalanceBeats(beats as never);
    if (!rebalanced) continue;

    await ctx.pool.query(
      `update renders
          set input_props = input_props::jsonb || $2::jsonb, status = 'queued', output_asset_id = null
        where id = $1`,
      [render.id, JSON.stringify({ beats: rebalanced })],
    );
    changed += 1;
  }

  if (changed === 0) {
    return {
      changed: [],
      note: 'plan cannot be rebalanced',
      escalate:
        'No render carries a creative plan that can be rebalanced without inventing beats, and inventing a beat to satisfy a retention metric would be fabricating content.',
    };
  }
  return { changed: ['creative_plan'], note: `Beat weights rebalanced on ${changed} render(s).` };
}

async function resynthesise(
  ctx: HandlerContext,
  input: CorrectionInput,
): Promise<CorrectionOutcome> {
  /*
   * Clearing the asset is what makes `tts` do the work again — the handler
   * returns early when a voiceover is already attached. The row is kept: the
   * asset is real, it was really produced, and deleting it would remove the
   * evidence of what the previous iteration actually sounded like.
   */
  const { rowCount } = await ctx.pool.query(
    `update content_items set vo_asset_id = null where id = $1 and vo_asset_id is not null`,
    [input.contentItemId],
  );
  if (!rowCount) {
    return { changed: [], note: 'no voiceover', escalate: 'There is no voiceover to re-produce.' };
  }
  const released = await requeueFinalRenders(ctx, input.contentItemId);
  return {
    changed: ['voiceover'],
    note: `Voiceover cleared for re-synthesis from the same script; ${released} render(s) requeued.`,
  };
}
