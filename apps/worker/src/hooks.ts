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
  runAllGates,
  generateHookVariants,
  splitSentences,
  surfaceBestVariants,
  verifyPayoff,
  type HookHistory,
  type HookType,
  type HookVariant,
  type LlmClient,
  type Claim,
  type QCResults,
  type SlopPlatform,
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
   * What was actually measured, per hook type, format and platform.
   *
   * ## What was wrong with the version this replaces
   *
   * It selected `m.stop_rate` and joined `post_metrics` on `m.content_item_id`.
   * **Neither column exists** — `post_metrics` is keyed by `publication_id`, and
   * no stop-rate column has ever been in the schema. The query could not plan,
   * let alone run, and a `.catch(() => ({ rows: [] }))` turned the failure into
   * an empty array. The comment above it then explained the emptiness as
   * "almost always empty today, because nothing has published", which is what a
   * working query would also have produced.
   *
   * So the one place an observed outcome fed back into a future generation
   * decision had never worked, and could not be told apart from the honest cold
   * start it was supposed to degrade into.
   *
   * ## What it measures now
   *
   * `video_views / impressions`, which is a **view-through rate** — not a
   * three-second retention. Halyard collects no retention figure because no
   * platform reports one to it, and naming a proxy after the thing it resembles
   * is the kind of claim this codebase spends most of its comments avoiding.
   *
   * Grouped by platform as well as format, because platforms do not agree on
   * what a view is: Instagram counts at roughly three seconds, TikTok at almost
   * none, YouTube at thirty. One average across them is a number that is true
   * nowhere.
   *
   * Only the latest metric row per publication is used, so a publication polled
   * five times on the decay schedule contributes one sample rather than five.
   */
  let performance: Array<{
    hook_type: string;
    format: string;
    platform: string;
    view_through: string;
    samples: string;
  }> = [];
  try {
    const result = await ctx.pool.query<(typeof performance)[number]>(
      `select hv.hook_type, ci.format, ci.platform,
              avg(m.video_views::numeric / m.impressions) as view_through,
              count(*) as samples
         from hook_variants hv
         join content_items ci on ci.id = hv.content_item_id
         join publications p on p.content_item_id = ci.id
         join lateral (
           select pm.impressions, pm.video_views
             from post_metrics pm
            where pm.publication_id = p.id
            order by pm.collected_at desc
            limit 1
         ) m on true
        where ci.product_id = $1
          and hv.selected = true
          and m.impressions is not null and m.impressions > 0
          and m.video_views is not null
        group by 1, 2, 3`,
      [productId],
    );
    performance = result.rows;
  } catch (err) {
    /**
     * Logged, not swallowed. A query that cannot run and an account with no
     * history produce the same empty array, and the previous silent catch is
     * the entire reason this was broken for as long as it was.
     */
    ctx.log('hook performance history unavailable', {
      productId,
      error: (err as Error).message,
      effect: 'hook scoring falls back to the neutral prior for every type',
    });
  }

  return {
    recentTypes: recent.map((r) => r.hook_type as HookType),
    cooledPatterns: cooled.map((c) => c.pattern_template),
    performance: performance.map((p) => ({
      hookType: p.hook_type as HookType,
      format: p.format,
      platform: p.platform,
      viewThroughRate: Number(p.view_through),
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
      /**
       * Without this the scorer has no way to tell which platform a
       * measurement came from, and refuses to use any of them. It was already
       * being passed to the generator two calls up; omitting it here left every
       * hook on the neutral prior even once real data existed.
       */
      platform: input.platform,
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
 * Apply the hook only if the post it produces still passes the gates.
 *
 * §143. The hook stage rewrites the body *after* `writeDraft` gated it, and
 * generation used to write the new text over the old one while leaving
 * `qc_results` untouched — so the approval screen showed a green QC computed
 * on copy that no longer existed. Gotcha 6 in a different hat: the gates ran,
 * but not on the thing a human was about to approve.
 *
 * Returns `null` when the hooked post fails, and the caller keeps the
 * copywriter's opening. A better opening that cannot be published is not
 * better — and the copywriter's version is the one that has been through the
 * gates.
 */
export function regateHookedBody(input: {
  body: string;
  hook: string;
  platform: string;
  hashtags: string[];
  bannedPhrases?: string[];
  forbiddenClaims?: string[];
  claims?: Claim[];
  artifact?: unknown;
}): { body: string; qc: QCResults } | null {
  const body = applyHookToBody(input.body, input.hook);
  const qc = runAllGates({
    copy: {
      body,
      platform: input.platform as SlopPlatform,
      hashtags: input.hashtags,
      extraBannedPhrases: input.bannedPhrases,
      forbiddenClaims: input.forbiddenClaims,
      longForm: input.platform === 'youtube',
    },
    ...(input.artifact ? { claims: { claims: input.claims ?? [], artifact: input.artifact } } : {}),
  });

  return qc.passed ? { body, qc } : null;
}

/**
 * Put the chosen hook at the top of the body.
 *
 * Replaces the copywriter's opening rather than prepending, so the post does
 * not open with two competing hooks — which is what prepending produces, every
 * time, and it reads as a mistake because it is one.
 *
 * ## Why "opening" is not always "the first line"
 *
 * §143. The first live generation caught this. X copy is written as one
 * paragraph, so a 267-character post is a single line — and replacing "the
 * first line" replaced the entire post with its 35-character hook. The payoff,
 * which is the part that was gated, was deleted on the way to the queue.
 *
 * On a multi-line post the first line *is* the opening. On a single-paragraph
 * post the opening is the first sentence, and everything after it must survive.
 * If the post is one sentence there is nothing to keep either way, so the hook
 * is refused: swapping the only sentence is a rewrite, not a hook, and it would
 * throw away copy that passed QC in favour of a line that has not.
 */
export function applyHookToBody(body: string, hook: string): string {
  const lines = body.split('\n');
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty === -1) return hook;

  const populated = lines.filter((l) => l.trim().length > 0);
  if (populated.length === 1) {
    const sentences = splitSentences(lines[firstNonEmpty]!);
    // One sentence: no payoff to preserve, so keep what the gates approved.
    if (sentences.length < 2) return body;

    const rest = lines[firstNonEmpty]!.trimStart().slice(sentences[0]!.length).trimStart();
    lines[firstNonEmpty] = `${hook} ${rest}`;
    return lines.join('\n');
  }

  lines[firstNonEmpty] = hook;
  return lines.join('\n');
}
