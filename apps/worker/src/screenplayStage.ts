/**
 * §372. Staging the piece during generation, not in a script.
 *
 * `writeScreenplay` has existed since §335 and runs from
 * `scripts/write-screenplay.ts`, which means every screenplay this system has
 * produced was written by hand, for a preview, and thrown away. Nothing in the
 * pipeline stages a piece. So the screenplay describes a video that was never
 * made, and §371's mechanism for the directors to honour it has nothing to
 * honour.
 *
 * This is the missing hop. It is the same assembly the script does — the
 * product's facts from the Brain, its motif pack, the channel's own length
 * budget, and the slots the format writer actually filled — moved to where a
 * production can call it.
 *
 * ## Why a module rather than more of `generate.ts`
 *
 * `generate.ts` is 3,135 lines and the standing risk list says every fix adds
 * to it. A stage that assembles six inputs, calls a model, repairs the
 * arithmetic and checks the result is exactly the kind of thing that should be
 * callable and testable on its own — and this way the file grows by a call
 * rather than by ninety lines.
 *
 * ## Failing is not fatal
 *
 * A screenplay is a *plan* for a piece whose content already exists and is
 * already verified. If the screenwriter is unavailable, the piece is made the
 * way it was made before this existed, and the run says so. Refusing to produce
 * a video because its stage directions could not be written would trade a good
 * outcome for a perfect one.
 */
import {
  CHANNEL_CATALOG,
  checkScreenplay,
  fitScreenplay,
  writeScreenplay,
  type ChannelId,
  type LlmClient,
  type PostFormat,
  type Screenplay,
  bandFor,
  PLATFORM_STRATEGIES,
} from '@halyard/core';
import { motifFor } from '@halyard/render/video';
import { resolveBrand } from '@halyard/render';
import type { HandlerContext } from './poller.js';

export interface StageRequest {
  productId: string;
  format: PostFormat;
  channel: ChannelId;
  subject: string;
  brandTokens: Record<string, unknown> | null;
  /** The written content, which the screenplay stages rather than reinvents. */
  slots: Array<{ key: string; index: number; text: string }>;
  /** Regions the frame can locate. Empty means the piece has no gestures. */
  locatable?: readonly string[];
  /** Whether real captured footage exists to use as a ground. */
  hasFootage?: boolean;
  /**
   * §451. Where this is going, which decides both how long it runs and what
   * composing it *well* means.
   *
   * The screenwriter has only ever been told its `channel` — a `short_video`,
   * generically, 15 to 45 seconds. So it staged for an average of TikTok,
   * Reels and Shorts and could not know that one of them ranks on finishing and
   * another on what happens afterwards. Two of the three most consequential
   * facts about a piece were being withheld from the one agent whose whole job
   * is holding the piece in mind at once.
   */
  platform?: string;
}

export interface StageResult {
  screenplay: Screenplay;
  costUsd: number;
  /** Problems the checker found that did not stop it being usable. */
  warnings: string[];
}

export async function stagePiece(
  ctx: HandlerContext,
  request: StageRequest,
  llm: LlmClient,
): Promise<StageResult | null> {
  /*
   * §340. Without slots the screenwriter invents content — three quiz questions
   * with no answers and no citations, bypassing `planQuestion`,
   * `checkQuestion` and the citation gate in one move. A screenplay stages what
   * was written; it is not a second draft of it.
   */
  if (request.slots.length === 0) {
    ctx.log('not staged', {
      format: request.format.id,
      because:
        'There is no written content to stage. A screenplay written without it invents its own, which bypasses every gate the writing went through.',
    });
    return null;
  }

  const channel = CHANNEL_CATALOG[request.channel];
  /**
   * §451. The platform's band, not the channel's generic range.
   *
   * `channel.targetSeconds` is 15 to 45 for every short video everywhere, and
   * §439 replaced exactly that kind of number with one derived from what a
   * platform rewards. The screenplay's `seconds` are the piece's runtime, so
   * staging to the generic range while the writer wrote to a 40-second budget
   * put the two halves of one piece on different clocks.
   *
   * Falls back to the channel where no band is known — Pinterest and Bluesky
   * carry no video, and a piece there is honestly outside this model.
   */
  const band = request.platform
    ? bandFor(request.platform, request.channel, request.format.pace)
    : null;
  const seconds = band
    ? { min: Math.round(band.floorSeconds), max: Math.round(band.ceilingSeconds) }
    : (channel.targetSeconds ?? { min: 15, max: 45 });
  const strategy = request.platform
    ? (PLATFORM_STRATEGIES[request.platform as keyof typeof PLATFORM_STRATEGIES] ?? null)
    : null;

  const { rows: facts } = await ctx.pool.query<{
    category: string;
    key: string;
    value: string;
  }>(
    `select category, key, value from product_facts
      where product_id = $1 and superseded_by is null
      order by confidence desc limit 40`,
    [request.productId],
  );

  const motif = motifFor(resolveBrand(request.brandTokens));

  let staged: Screenplay;
  let costUsd: number;
  try {
    const written = await writeScreenplay(
      {
        subject: request.subject,
        slots: request.slots,
        format: request.format.id,
        channel: request.channel,
        seconds,
        productFacts: facts,
        marks: motif.marks,
        locatable: request.locatable ?? [],
        hasFootage: request.hasFootage ?? false,
        /* §451. What this platform counts, so the composition can serve it. */
        ...(band ? { targetSeconds: band.targetSeconds } : {}),
        ...(strategy
          ? { primarySignal: strategy.primarySignal, signalBrief: strategy.signalBrief }
          : {}),
      },
      llm,
    );
    staged = written.screenplay;
    costUsd = written.costUsd;
  } catch (err) {
    /*
     * The content exists and is verified. A piece without stage directions is
     * the piece this system made before §372, which is worse and is not
     * broken.
     */
    ctx.log('not staged', {
      format: request.format.id,
      because: `The screenwriter failed — ${(err as Error).message}. The piece is made without stage directions, as it was before screenplays existed.`,
    });
    return null;
  }

  /*
   * §338. The arithmetic is repaired before the writing is judged. A screenplay
   * whose scenes add up to fifty seconds in a thirty-second channel is not a
   * bad screenplay; it is a good one that has to be cut, and cutting it is
   * deterministic.
   */
  const fitted = fitScreenplay(staged, seconds.max);
  for (const adjustment of fitted.adjustments) {
    ctx.log('screenplay fitted', {
      scene: adjustment.scene,
      from: adjustment.from,
      to: adjustment.to,
      because: adjustment.because,
    });
  }

  const check = checkScreenplay(fitted.screenplay, {
    marks: motif.marks,
    locatable: request.locatable ?? [],
    hasFootage: request.hasFootage ?? false,
    seconds,
    /*
     * The slots go to the checker too, so a screenplay that drops a written
     * line or invents one is caught. That is the §340 failure — a screenwriter
     * writing its own quiz questions — checked rather than trusted.
     */
    slots: request.slots,
  });

  const warnings = check.problems.map((p) => `${p.scene}: ${p.rule} — ${p.detail}`);

  ctx.log('piece staged', {
    format: request.format.id,
    scenes: fitted.screenplay.scenes.length,
    seconds: fitted.screenplay.scenes.reduce((total, scene) => total + scene.seconds, 0),
    bedMood: fitted.screenplay.bedMood,
    adjustments: fitted.adjustments.length,
    problems: warnings.length,
    because:
      `${fitted.screenplay.scenes.length} scenes staged from ${request.slots.length} written slots, ` +
      `for a ${channel.name.toLowerCase()} between ${seconds.min} and ${seconds.max} seconds. ` +
      (warnings.length > 0
        ? `${warnings.length} direction${warnings.length === 1 ? '' : 's'} the machinery cannot execute, which the directors fall back on.`
        : 'Every direction is one the machinery can execute.'),
  });

  return { screenplay: fitted.screenplay, costUsd, warnings };
}
