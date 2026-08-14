/**
 * The hook stage, joined to the pipeline it was written for.
 *
 * `hooks.ts` in core describes itself as "the highest-leverage three seconds in
 * the product" and "the loop that compounds: everything else in Halyard makes
 * production faster, this makes the output better over time." It is a complete
 * system — a generator, a taxonomy, a scorer, a near-duplicate check, a
 * clickbait check, a stop-rate predictor — with three tables behind it.
 *
 * **`surfaceBestVariants` had no caller.** Generation recorded a hook *after*
 * the fact, by classifying whatever first line the copywriter happened to
 * write, and the half that chooses a better one never ran. The compounding loop
 * was recording its results and never acting on them.
 *
 * ## Why the operator picks
 *
 * Five variants are surfaced rather than one applied silently. The scoring is
 * real but thin — it leans on measured stop rates that do not exist yet — so
 * ranking is a suggestion and the choice is the operator's, which is the same
 * bargain the rest of the queue strikes.
 *
 * The top-ranked one is applied to the draft so an unattended run still
 * produces a complete post, and swapping is one click.
 */
import {
  generateHookVariants,
  surfaceBestVariants,
  verifyPayoff,
  type HookHistory,
  type HookType,
  type HookVariant,
  type LlmClient,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';

/** How far back a pattern stays on cooldown. */
const COOLDOWN_DAYS = 30;

/**
 * What this account has been doing lately, so the generator can avoid it.
 *
 * Recency matters more than volume here: an account that opened three posts in
 * a row with a contradiction reads as a formula, however well that type
 * performs on average.
 */
export async function loadHookHistory(
  ctx: HandlerContext,
  productId: string,
  platform: string,
): Promise<HookHistory> {
  const { rows: recent } = await ctx.pool.query<{ hook_type: string }>(
    `select hook_type from hooks
      where product_id = $1 and platform = $2
      order by created_at desc limit 5`,
    [productId, platform],
  );

  const { rows: cooled } = await ctx.pool.query<{ pattern_template: string }>(
    `select distinct pattern_template from hooks
      where product_id = $1 and created_at > now() - ($2 || ' days')::interval`,
    [productId, String(COOLDOWN_DAYS)],
  );

  /**
   * Measured stop rate by type and format, where it exists.
   *
   * Almost always empty today, because nothing has published. That is the
   * honest state and the scorer already handles it — it falls back to a prior
   * rather than inventing a number, and `prediction_basis` records which.
   */
  const { rows: performance } = await ctx.pool.query<{
    hook_type: string;
    format: string;
    stop_rate: string;
    samples: string;
  }>(
    `select h.hook_type, ci.format,
            avg(m.stop_rate) as stop_rate,
            count(*) as samples
       from hooks h
       join content_items ci on ci.product_id = h.product_id
       join post_metrics m on m.content_item_id = ci.id
      where h.product_id = $1 and m.stop_rate is not null
      group by 1, 2`,
    [productId],
  ).catch(() => ({ rows: [] }));

  return {
    recentTypes: recent.map((r) => r.hook_type as HookType),
    cooledPatterns: cooled.map((c) => c.pattern_template),
    performance: performance.map((p) => ({
      hookType: p.hook_type as HookType,
      format: p.format,
      stopRate: Number(p.stop_rate),
      samples: Number(p.samples),
    })),
  };
}

export interface HookStageResult {
  /** The variant applied to the draft, if any survived. */
  applied: HookVariant | null;
  surfaced: number;
  rejected: number;
}

/**
 * Generate, filter, store and apply.
 *
 * Failures here do not fail the draft. A post with the copywriter's own opening
 * line is a worse post, not a broken one, and losing a finished draft to a hook
 * service having a bad minute is the wrong trade.
 */
export async function runHookStage(
  ctx: HandlerContext,
  input: {
    contentItemId: string;
    productId: string;
    platform: string;
    category: string;
    format: string;
    body: string;
    brandNames?: string[];
  },
  llm: LlmClient,
): Promise<HookStageResult> {
  const isVideo = input.format === 'video';

  try {
    const history = await loadHookHistory(ctx, input.productId, input.platform);

    const variants = await generateHookVariants(
      {
        body: input.body,
        format: input.format,
        category: input.category,
        platform: input.platform,
        isVideo,
        avoidTypes: history.recentTypes.slice(0, 2),
        brandNames: input.brandNames,
      },
      llm,
    );

    const { surfaced, rejected } = surfaceBestVariants(variants, history, {
      // The draft's own opening line, so a hook that merely restates it is
      // caught as the near-duplicate it is.
      title: input.body.split(/\r?\n/)[0],
      brandNames: input.brandNames,
      isVideo,
      format: input.format,
    });

    /**
     * A hook that promises something the body does not deliver is clickbait,
     * and it trains an audience to distrust the account — the rule the module
     * states and had no way to enforce, because nothing called it.
     *
     * Checked only on the one about to be applied. Checking all five would cost
     * five model calls to reject four hooks nobody chose.
     */
    let applied: HookVariant | null = surfaced[0] ?? null;
    let payoffNote: string | null = null;
    if (applied) {
      const payoff = await verifyPayoff({ hook: applied.textHook, body: input.body }, llm);
      if (!payoff.delivered) {
        payoffNote = payoff.reason;
        // Demoted rather than deleted: the operator may disagree, and the
        // reason is recorded next to it.
        applied = surfaced[1] ?? null;
      }
    }

    for (const [index, variant] of surfaced.entries()) {
      await ctx.pool.query(
        `insert into hook_variants
           (content_item_id, hook_type, text_hook, spoken_hook, visual_direction,
            caption_hook, predicted_stop_rate, prediction_basis, selected, variant_label)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          input.contentItemId,
          variant.hookType,
          variant.textHook,
          variant.spokenHook ?? null,
          variant.visualDirection ?? null,
          variant.captionHook ?? null,
          variant.predictedStopRate ?? null,
          variant.predictionBasis ?? null,
          applied ? variant.textHook === applied.textHook : false,
          String.fromCharCode(65 + index),
        ],
      );
    }

    for (const rejection of rejected) {
      await ctx.pool.query(
        `insert into hook_variants
           (content_item_id, hook_type, text_hook, spoken_hook, visual_direction,
            caption_hook, selected, rejected_reason)
         values ($1,$2,$3,$4,$5,$6,false,$7)`,
        [
          input.contentItemId,
          rejection.variant.hookType,
          rejection.variant.textHook,
          rejection.variant.spokenHook ?? null,
          rejection.variant.visualDirection ?? null,
          rejection.variant.captionHook ?? null,
          rejection.reason,
        ],
      );
    }

    if (payoffNote) {
      ctx.log('top hook did not pay off; used the runner-up', {
        contentItemId: input.contentItemId,
        reason: payoffNote,
      });
    }

    return { applied, surfaced: surfaced.length, rejected: rejected.length };
  } catch (err) {
    // The draft survives. A worse opening line is not a failed post.
    ctx.log('hook stage failed; keeping the copywriter opening', {
      contentItemId: input.contentItemId,
      error: (err as Error).message.slice(0, 200),
    });
    return { applied: null, surfaced: 0, rejected: 0 };
  }
}

/**
 * Put the chosen hook at the top of the body.
 *
 * Replaces the copywriter's first line rather than prepending, so the post does
 * not open with two competing hooks — which is what prepending produces, every
 * time, and it reads as a mistake because it is one.
 */
export function applyHookToBody(body: string, hook: string): string {
  const lines = body.split('\n');
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty === -1) return hook;

  lines[firstNonEmpty] = hook;
  return lines.join('\n');
}
