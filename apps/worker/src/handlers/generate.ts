/**
 * The daily generation job. v1 §4.2 and §4.3, v2 Part G.
 *
 *   signals → ideas (scored, mix-debt driven) → per-platform drafts → renders
 *
 * Two rules the loop must not lose:
 *   · Content is built from a real artifact. If the connector is unreachable,
 *     generation for that product pauses rather than inventing (build pack §3).
 *   · One model call per platform. Never one call producing every platform.
 *   · Nothing that fails a QC gate reaches the queue.
 *
 * Until the first-run wizard is complete, this job refuses to run and says so,
 * rather than producing generic content silently (build pack §2).
 */
import {
  createLlmClient,
  proposeIdeas,
  ConnectorUnavailableError,
  DraftRejectedError,
  createConnector,
  effectiveProductCeiling,
  PRODUCT_CONTENT_CEILING,
  resolveDestination,
  routerUrlFor,
  publishableBaseUrl,
  selectIdeas,
  writeDraft,
  type IdeaCandidate,
  type LlmClient,
  type ProductArtifact,
  type ProductDestinations,
  classifyHookType,
  extractHookPattern,
  type SlopPlatform,
  photographicSubject,
  canStart,
  getAdapter,
  planProduction,
  postTypesForPlatform,
  requiresCitation,
  resolvePostType,
  supportFromConstraints,
  type PostTypeId,
  type Stage,
} from '@halyard/core';
import {
  carouselProps,
  chooseLayout,
  slidesForFormat,
  transformationDiffProps,
  type CarouselLayout,
  type SlideRole,
} from '@halyard/render';
import {
  NoUsableFormatError,
  beatsToScenes,
  type CreativePlan,
  chooseFormat,
  needsVideo,
  budgetFor,
  motionForPlan,
  isRefusal,
  decideStrategy,
  DEFAULT_LANGUAGE,
  EDITORIAL,
  PUNCH,
  chooseOpening,
  creativeTypeForShape,
  longFormBeats,
  LONG_FORM_MAX_SECONDS,
  LONG_FORM_MIN_SECONDS,
  planLongForm,
  fitWords,
  directVoice,
  planVariants,
  directCreative,
  type VisualLanguage,
  LANGUAGE_FOR_TREATMENT,
  OpenAiImageClient,
  selectFormat,
  renderTypography,
  selectTypography,
  aspectForRender,
  thumbnailFontSize,
  thumbnailTextFrom,
  defaultSubtypeFor,
  findFormatSpec,
  presentationFor,
  rankSignals,
  selectCreativePlan,
  type CreativeType,
  writeVoScript,
} from '@halyard/core';
import { chooseVideoComposition } from '@halyard/render/video-props';
import { VIDEO_FORMATS, videoForFormat } from '@halyard/render/video';
import { regateHookedBody, runHookStage } from '../hooks.js';

/**
 * Target length for a voiceover script, in seconds.
 *
 * Short-form retention falls off a cliff past about thirty seconds for
 * explainer content, and the compositions are built around 16-32s. The script
 * is written to this and the video is then cut to the *measured* audio, so a
 * read that runs long produces a longer video rather than a truncated one.
 */
const VO_TARGET_SECONDS = 22;
import { PermanentJobFailure } from '../poller.js';
import type { Job, HandlerContext } from '../poller.js';
import { generateHeroImage } from '../heroImage.js';
import { pickProductShot } from '../productShot.js';
import { FormatRejectedError, recentFormats, writeToFormat } from '../formatWriter.js';
import { captureFootage } from '../capture/footage.js';
import { routeToBoard } from './boards.js';
import { notify } from './publish.js';
import { fillCampaignSlot } from './campaignSlot.js';
import { recordingClient } from '../agentRuns.js';


/**
 * The plan's beats, as the render row stores them.
 *
 * Extracted so the boundary is testable. It was an object literal inside this
 * handler, and it silently dropped `sourcePath` — the planner had set it on
 * every artifact-derived beat since §160, the plan-level test asserted it, and
 * nothing checked that it survived into the thing that actually ships. §169.
 */
/**
 * Trim every text field on a beat to what the register can show. §237.
 *
 * Applied per field rather than to the beat as a whole: a transformation card
 * carries `before`, `after` and `reason` and each is set at a different size,
 * so a single budget across all three would starve the one that matters.
 */
function fitBeatContent(
  content: CreativePlan['beats'][number]['content'] | undefined,
  register: 'editorial' | 'punch',
): CreativePlan['beats'][number]['content'] | undefined {
  if (!content) return content;
  const spec = register === 'punch' ? PUNCH : EDITORIAL;
  const out: Record<string, unknown> = { ...content };
  for (const key of ['text', 'reason', 'before', 'after', 'label'] as const) {
    const value = content[key] as unknown;

    if (typeof value === 'string') {
      if (value.trim()) out[key] = fitWords(value, spec);
      continue;
    }

    /*
     * §252. A field that is not a string never reaches the renderer.
     *
     * A production render died on `Minified React error #31` — an object with
     * keys `{adapted, stepNote, tradeoff, replaceTerm}` passed as a React
     * child. The connector had returned a structured swap where the planner
     * expected a line of text, and every layer between simply carried it: the
     * plan typed it as `string | undefined` and nothing checked at runtime,
     * so the first thing to object was React, in a minified stack, three
     * retries deep.
     *
     * The best available string is used where there is one; otherwise the
     * field is dropped, because a beat missing its `after` renders as a
     * partial card and a beat carrying an object renders as nothing at all.
     */
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const salvaged = ['text', 'adapted', 'value', 'label', 'name']
        .map((k) => record[k])
        .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (salvaged) out[key] = fitWords(salvaged, spec);
      else delete out[key];
      continue;
    }

    /* A null field means the same as an absent one, and carrying it is noise
       in the stored props. A number is legitimate (`index`); nothing else is. */
    if (value === undefined) continue;
    if (typeof value !== 'number') delete out[key];
  }
  return out as CreativePlan['beats'][number]['content'];
}

export function beatsForRender(
  plan: CreativePlan,
  register: 'editorial' | 'punch' = 'punch',
  /**
   * The language the Creative Director chose. §228.
   *
   * Absent falls back to the treatment's default, which is what every render
   * before the director used — so an old plan replays identically.
   */
  language?: VisualLanguage,
  /**
   * The opening layout, for the hook beat only. §229.
   *
   * Passed rather than derived here because the choice depends on what the
   * *account* recently opened with, which this function has no access to and
   * should not acquire — it is a pure mapping from a plan to render props.
   */
  opening?: { composition: string; holdWords?: number },
): Array<Record<string, unknown>> {
  /**
   * §220. The motion grammar, resolved once for the whole plan.
   *
   * Per-plan rather than per-beat because a transition belongs to a *pair* of
   * beats and the last beat must not transition out of anything. Resolved here,
   * in the worker, so the renderer draws a decision rather than making one —
   * the same arrangement the timing engine already has with weights.
   */
  const motions = motionForPlan(
    plan.creativeType,
    plan.beats.map((b) => ({
      role: b.role,
      emphasis: b.emphasis,
      hasMedia: Boolean(b.media || b.image),
      text: Object.values(b.content ?? {})
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .trim(),
      wordCount: Object.values(b.content ?? {})
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    })),
    register,
    language,
  );

  return beatsToScenes(plan).map((scene, i) => {
    const beat = plan.beats[i]!;
    return {
      ...scene,
      role: beat.role,
      // §162. Emphasis reaches the render so the treatment can scale it.
      // Carried, not recomputed: duration and size must come from one value or
      // they drift apart.
      emphasis: beat.emphasis,
      /*
       * §237. Trimmed to what the register can actually show.
       *
       * `fitWords` existed since §211 with no caller, and the cost was visible
       * on the first real production frame: a step beat carrying 25 words,
       * rendered at punch scale, overflowing its band and clipping mid-word.
       * The cap is the register's own `maxWordsPerBeat`, and the cut lands on
       * a sentence boundary rather than on the word limit.
       */
      content: fitBeatContent(beat.content, register),
      motion: motions[i],
      // §169. Provenance, so a stored render is traceable to its evidence.
      ...(beat.sourcePath ? { sourcePath: beat.sourcePath } : {}),
      // §163. Only a beat the planner gave footage carries it.
      ...(beat.media ? { media: beat.media } : {}),
      ...(beat.image ? { image: { url: beat.image.url, alt: beat.image.alt } } : {}),
      /*
       * §229. Only the hook carries an opening: it is the layout of the first
       * frame, and applying it to a later beat would make a mid-piece card
       * pretend to be an opening.
       */
      ...(beat.role === 'hook' && opening
        ? {
            opening: opening.composition,
            ...(opening.holdWords ? { opening_hold_words: opening.holdWords } : {}),
          }
        : {}),
    };
  });
}

/**
 * §258. Disown a half-built row instead of leaving it approvable.
 *
 * `content_items` is inserted as soon as the copy is written; the voiceover,
 * the render and the beats all land on it afterwards. So an abort anywhere in
 * that tail leaves a row that looks finished — status `pending_approval`,
 * `ai_components` of `{copy}`, no audio, no render — a video with no video,
 * sitting in the approval queue where an operator sees a piece rather than a
 * failure.
 *
 * The rejected-voiceover path is the live case: the gate correctly refuses the
 * script, the `continue` skips the render, and the log line read "nothing
 * queued", which stopped being true the moment the insert moved ahead of the
 * gates. Gotcha 6, one table over — a skipped step is not a passed step.
 *
 * Marked `failed` with the reason rather than deleted: why a piece did not get
 * made is the part worth keeping.
 *
 * Conditional on `pending_approval` so it can only ever disown a row this run
 * left half-built. A piece an operator has already approved, or one a later
 * stage already failed for its own reason, is not overwritten.
 */
export async function disownPartialContentItem(
  pool: HandlerContext['pool'],
  itemId: string | null,
  why: string,
): Promise<void> {
  if (!itemId) return;
  await pool.query(
    `update content_items
        set status = 'failed',
            generation_meta = coalesce(generation_meta, '{}'::jsonb) || $2::jsonb
      where id = $1 and status = 'pending_approval'`,
    [itemId, JSON.stringify({ failed_because: why })],
  );
  /**
   * The render rows go with it, or they wait forever.
   *
   * `generate` inserts the Remotion render row but deliberately does not
   * enqueue it — `tts` releases it once the audio exists, because rendering
   * first would produce a silent video of the wrong duration. The `tts`
   * enqueue is the *last* statement in the video block, so anything that
   * throws between the two leaves a render sitting in `queued` with no job
   * that will ever claim it and no error to explain it. Three of those were
   * live, the oldest eleven hours old.
   *
   * Failed rather than released: releasing would render a video for a piece
   * whose script was rejected, which is the silent-video case the contract
   * exists to prevent.
   */
  await pool.query(
    `update renders
        set status = 'failed',
            error = $2
      where content_item_id = $1 and status = 'queued'`,
    [itemId, `Abandoned with the item that owned it: ${why}`],
  );
}

/**
 * §268. What the photograph should be of, in the product's own words.
 *
 * Reads the artifact's headline and nothing else, so this stays true for any
 * product attached to Halyard: whatever the connector says the piece is about
 * is what gets photographed. Returns null when there is no usable subject
 * rather than inventing one — a generic stock-looking prompt is worse than no
 * picture, because it is the thing that reads as generated.
 */
export function subjectForImage(
  artifact: { headline?: string | null } | null,
  fallbackTitle: string | null,
): string | null {
  const raw = (artifact?.headline ?? fallbackTitle ?? '').trim();
  if (raw.length < 8) return null;
  /* Strip a trailing full stop so the prompt reads as a noun phrase. */
  return raw.replace(/[.!?]+$/, '');
}

/**
 * §313. What a piece is *about*, from what it actually says.
 *
 * The hero photograph was generated from the artifact's headline before the
 * format had written a word, so a quiz about the history of gluten was
 * illustrated with whatever recipe was adapted that morning. A picture that has
 * nothing to do with the video is worse than no picture: it reads as stock, and
 * stock is the thing that makes an account look automated.
 *
 * The opening slot is the subject. Every format in the catalogue puts its
 * subject there — a quiz's `title`, a history's `hook`, a myth's `myth` — and
 * it is a line written *for this piece*, which is exactly what a picture of it
 * should be generated from.
 *
 * Returns null when there is nothing usable, so the caller falls back to the
 * artifact rather than generating a picture of an empty string.
 */
export function subjectFromFormat(
  slots: Array<{ key: string; index: number; text: string }>,
): string | null {
  const opening = ['title', 'hook', 'myth', 'question'];
  for (const key of opening) {
    const slot = slots.find((s) => s.key === key && s.index === 0);
    const text = slot?.text?.trim().replace(/[.!?]+$/, '');
    /* Long enough to describe something; a three-word slot is not a subject. */
    if (text && text.length >= 12) return text;
  }
  return null;
}

export async function generateHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');

  /**
   * Built on first use rather than at the top.
   *
   * Constructing it eagerly meant a run the guards below were about to refuse
   * still died on a missing API key, and it died *before* logging the reason it
   * was going to be refused — so the operator saw a credential error for a job
   * that was never going to generate anything anyway.
   */
  let cached: LlmClient | null = (job.payload.llm as LlmClient | undefined) ?? null;
  /**
   * Wrapped so every agent that runs inside this job is recorded.
   *
   * One wrapper covers the copywriter, the VO scriptwriter, the hook generator
   * and the payoff verifier, because they all reach the model through this
   * client. Instrumenting the seam rather than the four call sites means a
   * fifth agent added here is recorded without anyone remembering to.
   */
  const llmFor = (): LlmClient =>
    (cached ??= recordingClient(ctx.pool, createLlmClient(), {
      trigger: 'job',
      triggerRef: job.id,
    }));

  // A campaign slot has already been told what it is for, so it takes a
  // different path: no idea selection, no mix arithmetic, just the words.
  if (job.payload.contentItemId) {
    await fillCampaignSlot(job, ctx, llmFor());
    return;
  }

  /**
   * The calibration batch is what *makes* calibration possible.
   *
   * Milestone 51 found this deadlocked: `startCalibrationBatch` enqueues a
   * generate job with `calibration: true`, and the guard below refused it
   * because `step_calibration_done` was false — which is exactly what the batch
   * exists to make true. The job was consumed and silently did nothing, so the
   * onboarding wizard simply never produced its twenty drafts.
   *
   * A calibration run still needs a voice and a brief to write from. It just
   * does not need calibration to have already happened.
   */
  const calibration = job.payload.calibration === true;

  // ── Cold-start guard (build pack §2) ─────────────────────────────────────
  const onboarding = await ctx.pool.query<{
    step_ingest_done: boolean;
    step_voice_done: boolean;
    step_calibration_done: boolean;
    step_templates_done: boolean;
  }>('select * from onboarding_state where product_id = $1', [productId]);

  const state = onboarding.rows[0];
  const incomplete = !state
    ? ['ingest', 'voice', ...(calibration ? [] : ['calibration']), 'templates']
    : [
        !state.step_ingest_done && 'ingest',
        !state.step_voice_done && 'voice',
        !calibration && !state.step_calibration_done && 'calibration',
        !state.step_templates_done && 'templates',
      ].filter(Boolean);

  if (incomplete.length > 0) {
    ctx.log('generation blocked: first-run wizard incomplete', { productId, incomplete });
    await notify(
      ctx,
      'connector_down',
      'info',
      'Daily generation did not run',
      `The first-run wizard is not finished: ${incomplete.join(', ')} still outstanding. ` +
        'Halyard will not produce content until the voice is calibrated.',
    );
    return;
  }

  const settings = await ctx.pool.query<{ generation_enabled: boolean }>(
    'select generation_enabled from settings where id = true',
  );
  if (!settings.rows[0]?.generation_enabled) {
    ctx.log('generation disabled in settings', { productId });
    return;
  }

  if (calibration) ctx.log('calibration batch', { productId, limit: job.payload.limit });

  // ── Product context ──────────────────────────────────────────────────────
  const productRows = await ctx.pool.query<{
    id: string;
    name: string;
    brief_summary: string | null;
    brief_markdown: string | null;
    content_rules: {
      forbidden_claims?: string[];
      banned_phrases?: string[];
      /**
       * Rules the operator accepted from a rejection cluster. Written by
       * `acceptCluster`, and until now read by nothing at all — accepting a
       * pattern moved a row's status and changed no output. They are guidance
       * in prose, not substrings, so they join the copywriter's DO NOT list
       * rather than the slop filter's ban lists.
       */
      operator_rules?: string[];
    };
    connector_type: 'mcp' | 'rest' | 'none';
    connector_config: Record<string, unknown>;
    destinations: ProductDestinations;
  }>('select * from products where id = $1', [productId]);

  const product = productRows.rows[0];
  if (!product) throw new Error(`product ${productId} not found`);

  const proposed = await ctx.pool.query<{
    id: string;
    title: string;
    angle: string;
    category: IdeaCandidate['category'];
    embedding: number[] | null;
  }>(
    `select id, title, angle, category, embedding from ideas
      where product_id = $1 and status = 'proposed'
        and (snoozed_until is null or snoozed_until < now())
        and (expires_at is null or expires_at > now())`,
    [productId],
  );

  /**
   * Nothing proposed — so propose some, rather than returning.
   *
   * `ideas` is the entry point of this whole pipeline and its **only writer in
   * the repository was `supabase/seed-demo.sql`**. So this branch was taken on
   * every scheduled run: log "no proposed ideas to draft", return, and nothing
   * was ever generated. Meanwhile `signals` — written by `collect_watch_terms`
   * when a question recurs — was read by nothing at all. Two adjacent breaks
   * that made observation and generation unable to meet.
   *
   * The proposer runs here, at the moment the shortage is discovered, because
   * that needs no new job kind and therefore no migration. It proposes only;
   * `scoreIdeas` and `selectIdeas` still decide, and every QC gate still runs.
   */
  if (proposed.rows.length === 0) {
    const filled = await proposeFromSignals(ctx, product, llmFor());
    if (filled === 0) {
      ctx.log('no proposed ideas to draft, and none could be proposed', { productId });
      return;
    }

    const refreshed = await ctx.pool.query<{
      id: string;
      title: string;
      angle: string;
      category: IdeaCandidate['category'];
      embedding: number[] | null;
    }>(
      `select id, title, angle, category, embedding from ideas
        where product_id = $1 and status = 'proposed'
          and (snoozed_until is null or snoozed_until < now())
          and (expires_at is null or expires_at > now())`,
      [productId],
    );
    proposed.rows = refreshed.rows;
    if (proposed.rows.length === 0) return;
  }

  // ── Mix state, straight from the database functions ──────────────────────
  const mixActual = await ctx.pool.query<{ category: string; published: number; share: string }>(
    'select * from content_mix_actual($1, $2, 21)',
    [productId, 'brand'],
  );
  const productShare = await ctx.pool.query<{ product_content_share: string }>(
    'select product_content_share($1, $2, 14)',
    [productId, 'brand'],
  );
  const voice = await ctx.pool.query<{
    display_name: string;
    description: string;
    do_rules: string[];
    dont_rules: string[];
    examples: Array<{ platform?: string; text: string; why_good?: string }>;
    anti_examples: Array<{ text: string; why_bad?: string }>;
    mix_targets: Record<string, number>;
  }>(`select * from brand_voices where product_id = $1 and persona = 'brand'`, [productId]);

  const voiceRow = voice.rows[0];
  if (!voiceRow) throw new Error(`no brand voice configured for ${productId}`);

  const templates = await ctx.pool.query<{ id: string; format: string }>(
    'select id, format from templates where (product_id = $1 or product_id is null) and enabled',
    [productId],
  );
  const enabledTemplates = templates.rows.map((t) => t.id);

  const recentEmbeddings = (
    await ctx.pool.query<{ embedding: number[] | null }>(
      `select embedding from ideas
        where product_id = $1 and status = 'used' and created_at > now() - interval '60 days'`,
      [productId],
    )
  ).rows
    .map((r) => r.embedding)
    .filter((e): e is number[] => Array.isArray(e));

  // The campaign whose window contains right now, if there is one. `ends_at`
  // does the reverting, so nothing has to be turned off by hand.
  const runningCampaign = await ctx.pool.query<{
    id: string;
    product_mix_ceiling: string;
    starts_at: string;
    ends_at: string;
    status: string;
  }>(
    `select id, product_mix_ceiling, starts_at, ends_at, status
       from campaigns
      where product_id = $1 and status in ('staged', 'running')
        and now() between starts_at and ends_at
      order by starts_at desc limit 1`,
    [productId],
  );

  const campaignRow = runningCampaign.rows[0];
  const mixOverride = effectiveProductCeiling({
    baseCeiling: PRODUCT_CONTENT_CEILING,
    campaign: campaignRow
      ? {
          productMixCeiling: Number(campaignRow.product_mix_ceiling),
          startsAt: new Date(campaignRow.starts_at),
          endsAt: new Date(campaignRow.ends_at),
          status: campaignRow.status,
        }
      : null,
  });

  /**
   * What each category has actually converted at, so scoring can learn.
   *
   * `IdeaCandidate.historicalConversion` has existed since the scorer was
   * written and **nothing has ever supplied it**, so every idea scored on the
   * `?? 0.5` neutral. That is the right answer today — `performance_scores` is
   * empty because nothing has published — and it would have stayed 0.5 forever
   * afterwards, which is the difference between a cold start and a loop that
   * never closes.
   *
   * Wiring it now costs nothing and changes nothing: with no rows the map is
   * empty, the candidates carry `undefined`, and the neutral still applies. The
   * moment a publication is scored, the edge is already connected.
   *
   * Averaged per category rather than per idea because that is the grain the
   * scorer asks for — "mean conversion of similar past content" — and a single
   * post's score is noise at the volumes this operates at.
   */
  const conversionByCategory = await ctx.pool.query<{ category: string; mean: string }>(
    `select ci.category, avg(ps.conversion_score) as mean
       from performance_scores ps
       join content_items ci on ci.id = ps.content_item_id
      where ci.product_id = $1 and ps.conversion_score is not null
      group by ci.category`,
    [productId],
  );
  const historical = new Map(
    conversionByCategory.rows.map((r) => [r.category, Number(r.mean)]),
  );

  const { selected, rejected } = selectIdeas(
    proposed.rows.map((row) => ({
      id: row.id,
      title: row.title,
      angle: row.angle,
      category: row.category,
      availableTemplates: enabledTemplates,
      embedding: row.embedding ?? undefined,
      // Undefined, not 0, when a category has never been measured. The scorer's
      // own `?? 0.5` is the honest neutral; a zero would be a measured failure.
      historicalConversion: historical.get(row.category),
    })),
    {
      targets: voiceRow.mix_targets as Record<IdeaCandidate['category'], number>,
      actual: Object.fromEntries(
        mixActual.rows.map((r) => [r.category, Number(r.share)]),
      ) as Record<IdeaCandidate['category'], number>,
      productShare14d: Number(productShare.rows[0]?.product_content_share ?? 0),
      postsPerCategory: Object.fromEntries(
        mixActual.rows.map((r) => [r.category, Number(r.published)]),
      ) as Record<IdeaCandidate['category'], number>,
    },
    {
      recentEmbeddings,
      limit: Number(job.payload.limit ?? 3),
      // Milestone 44: a running campaign lifts the product ceiling for its
      // window and lets it revert on its own.
      productCeiling: mixOverride.ceiling,
      /*
       * §260. A calibration batch is drafts for review, not posts. The mix
       * ceiling governs publishing, and at cold start it rejects every product
       * idea — the first one projects to 50% against a 15% cap — so the batch
       * that exists to start the account cannot contain the product.
       */
      calibration,
    },
  );

  if (mixOverride.active) {
    ctx.log('campaign mix override in force', {
      productId,
      ceiling: mixOverride.ceiling,
      reason: mixOverride.reason,
    });
  }

  for (const idea of rejected) {
    ctx.log('idea not selected', { id: idea.id, reason: idea.blockedReason });
  }
  if (selected.length === 0) {
    /**
     * §360. A run that makes nothing has to say why.
     *
     * This was a bare `return`. The generation that followed the first real
     * quiz test ran for 111 seconds, reported `done`, produced no piece, and
     * wrote one event — because the idea pool was empty (the concept job had
     * died on an exhausted API key) so there were no rejections to log either,
     * and the only branch that spoke was the one that had nothing to say.
     *
     * The two cases read identically from outside and are completely different
     * problems: nothing was proposed, versus everything proposed was refused.
     * Naming which is the difference between "top up the key" and "the mix
     * ceiling is wrong".
     */
    ctx.log(
      proposed.rows.length === 0 ? 'nothing to make: no ideas proposed' : 'nothing to make: every idea was refused',
      {
        productId,
        proposed: proposed.rows.length,
        rejected: rejected.length,
        because:
          proposed.rows.length === 0
            ? 'The idea pool is empty. Concepts are generated by the `generate_concepts` job — check whether it is failing.'
            : 'Every proposed idea was blocked, and each reason is in the events above this one.',
      },
    );
    return;
  }

  // ── Accounts to draft for ────────────────────────────────────────────────
  const accounts = await ctx.pool.query<{
    id: string;
    platform: SlopPlatform;
    persona: 'brand' | 'founder';
    supported_formats: string[];
  }>(
    /*
     * §288. `onlyPlatform` narrows the run to one account.
     *
     * The Make page asks for one piece on one platform, and without this it
     * would draft for every connected account — five pieces from a button that
     * says "make it", four of them unasked for. Absent means every account,
     * which is what the scheduler wants.
     */
    `select id, platform, persona, supported_formats from social_accounts
      where product_id = $1 and capability_state in ('live','draft_only')
        and ($2::text is null or platform = $2)`,
    [productId, (job.payload.onlyPlatform as string | undefined) ?? null],
  );

  if (accounts.rows.length === 0) {
    ctx.log('no connected accounts, nothing to draft', {
      productId,
      /* Named, because "nothing to draft" reads very differently when a
         platform filter is what emptied the list. */
      onlyPlatform: (job.payload.onlyPlatform as string | undefined) ?? null,
    });
    return;
  }

  const connector = createConnector(product);

  /**

   * §268. The image client, built once for the run.

   *

   * Null when no key is configured, which is a supported state: the piece is

   * built without a photograph rather than failing. Illustration is an

   * upgrade, never a dependency.

   */

  const imageClient = process.env.OPENAI_API_KEY

    ? new OpenAiImageClient({ apiKey: process.env.OPENAI_API_KEY })

    : null;


  for (const idea of selected) {
    /**
     * Claim the idea *before* spending anything on it.
     *
     * `generateSample` is one real RecipeFix credit and 26 seconds. This used
     * to mark the idea `selected` twenty lines further down, after the
     * adaptation had already been paid for — so a generate job that died
     * anywhere between the two left the idea `proposed`, and
     * `JOB_POLICY.generate` allows a second attempt which re-selected it and
     * bought the same adaptation again. §78 named this exposure; the ordering
     * is what made it reachable.
     *
     * Conditional on the current status and atomic, so two workers cannot both
     * claim it. A row count of zero means someone else has it.
     */
    const claim = await ctx.pool.query(
      `update ideas set status = 'selected' where id = $1 and status = 'proposed' returning id`,
      [idea.id],
    );
    if (claim.rowCount === 0) {
      ctx.log('idea already claimed, not drafting twice', { ideaId: idea.id });
      continue;
    }

    /**
     * §218. Ask for creative directions before writing one.
     *
     * Enqueued rather than awaited: a concept batch is a strategy-grade model
     * call, and blocking the draft on it would make one slow provider stall the
     * whole run. The batch lands for the operator to choose from, and the next
     * `generate` for this idea takes the highest-scoring buildable concept when
     * nobody has. Deduped per idea so a retry does not buy a second batch.
     */
    await ctx.enqueue(
      'generate_concepts',
      { productId, ideaId: idea.id },
      { dedupeKey: `concepts:${idea.id}`, priority: 40 },
    );

    let artifact: ProductArtifact | null = null;

    if (connector) {
      try {
        artifact = await connector.generateSample({
          intent: `${idea.title}. ${idea.angle}`,
          params: (job.payload.sampleParams as Record<string, unknown>) ?? {},
        });
      } catch (err) {
        if (err instanceof ConnectorUnavailableError) {
          /*
           * The claim is deliberately **not** released here.
           *
           * This error is raised after the adapt call has been attempted and
           * timed out, and a timeout does not prove nothing was spent — the
           * request may have reached RecipeFix and consumed a credit while the
           * response never came back. Releasing would let the retry buy it
           * again, which is the exact failure this ordering exists to prevent.
           *
           * One idea is consumed per outage, and the handler returns rather
           * than continuing, so the loss is one idea and not the batch. Ideas
           * are regenerated daily; credits are the operator's money.
           */
          // Generation pauses. The existing queue is unaffected.
          await notify(
            ctx,
            'connector_down',
            'critical',
            `${product.name} connector unreachable`,
            `${err.message} Generation is paused for this product; the queue is unaffected.`,
          );
          return;
        }
        throw err;
      }
    }

    for (const account of accounts.rows) {
      if (account.persona !== 'brand') continue; // founder posts are composed, not generated

      /**
       * §258. The row exists long before the piece does.
       *
       * `content_items` is inserted as soon as the copy is written, and the
       * voiceover, the render and the beats all land on it afterwards. So an
       * abort anywhere in that tail leaves a row that looks finished: status
       * `pending_approval`, `ai_components` of `{copy}`, no audio, no render —
       * a video with no video, sitting in the approval queue.
       *
       * Hoisted out of the `try` so the handler below can reach it. Null means
       * nothing was inserted for this account yet and there is nothing to
       * disown.
       */
      let insertedItemId: string | null = null;

      const disownPartialItem = (why: string) => disownPartialContentItem(ctx.pool, insertedItemId, why);


      try {
        /**
         * The format the account can actually take, rather than a guess.
         *
         * This was `platform === 'pinterest' ? 'pin' : 'image'`, and TikTok and
         * YouTube both declare `supportedFormats: ['video']` — so every draft
         * for either was an image neither could publish. Invisible so far only
         * because nothing has published.
         */
        const format = chooseFormat(account.platform, account.supported_formats ?? []);

        // One call per platform. Never one call producing all platforms.
        /**
         * §291. The shape is decided **before** the copy is written.
         *
         * It used to be chosen 230 lines later, after the draft — so every
         * caption was written and gated as a product demonstration whatever the
         * piece turned out to be. A quiz about the history of gluten had its
         * claims verified against a *recipe artifact*, failed 4 of 5, and was
         * abandoned three times running. The artifact was never going to
         * contain those claims; the check was a category error.
         *
         * The format is what the piece *is*, so nothing that depends on that
         * can be decided before it.
         */
        const chosenFormat = selectFormat({
          platform: account.platform,
          hasArtifact: Boolean(artifact),
          recentFormats: (await recentFormats(ctx, account.id)) as never,
          requested: (job.payload.postFormat as string | undefined) ?? null,
          canCite: true,
        });
        /**
         * §350. What kind of thing is being made, resolved once.
         *
         * Nothing asked this before. Media was decided by scattered conditions
         * — a carousel when the platform is Instagram *and* `carousel_6` is
         * enabled, a landscape render when the subtype says long-form — each a
         * local answer to a question nobody asked globally.
         *
         * So no stage could know what was being made. The voiceover stage could
         * not skip itself for a text post, because nothing told it there was no
         * video; it ran whenever its own conditions happened to pass. That is
         * how a voiceover came to be written from a caption.
         *
         * Resolved here, before anything is written, so every stage after this
         * can ask instead of infer.
         */
        const platformSupport = supportFromConstraints(
          account.platform,
          getAdapter(account.platform as never).constraints,
        );
        const resolvedType = resolvePostType({
          format: chosenFormat.format,
          platform: account.platform,
          available: postTypesForPlatform(platformSupport),
          requested: (job.payload.postType as PostTypeId | undefined) ?? null,
        });

        if (!resolvedType) {
          /*
           * The format's own channel cannot be carried on this platform.
           * Refused *before the row is written*: a piece that cannot be
           * published is not a failed piece, it is a piece that should never
           * have been started, and a `failed` row for it would read as
           * something that broke.
           *
           * Substituting a different kind of piece is the alternative and is
           * worse — a quiz quietly becoming a transformation post is the
           * failure §304 exists to prevent.
           */
          ctx.log('no post type this platform can carry', {
            platform: account.platform,
            format: chosenFormat.format.id,
            channel: chosenFormat.format.channels[0],
          });
          continue;
        }

        /**
         * §345. The stages this production runs, and the ones it does not.
         *
         * Declared rather than implied, so an operator reading the log sees
         * what was skipped **and why** — "it did not happen" and "it was not
         * needed" look identical otherwise.
         */
        const production = planProduction({
          channel: resolvedType.postType.channel,
          media: resolvedType.postType.media,
          sourced: requiresCitation(chosenFormat.format),
          needsCapture: chosenFormat.format.needsCapture === true,
        });

        ctx.log('production planned', {
          postType: resolvedType.postType.id,
          because: resolvedType.because,
          alternatives: resolvedType.alternatives,
          runs: production.stages.map((s) => s.stage),
          skips: production.skipped.map((s) => `${s.stage} — ${s.because}`),
        });

        /* What has actually completed, for `canStart` to gate against. */
        const completed: Stage[] = ['brief'];

        ctx.log('post format chosen', {
          platform: account.platform,
          format: chosenFormat.format.id,
          because: chosenFormat.reason,
          alternatives: chosenFormat.alternatives,
        });

        const draft = await writeDraft(
          {
            platform: account.platform,
            format,
            category: idea.category,
            persona: account.persona,
            idea: { title: idea.title, angle: idea.angle },
            artifact,
            /*
             * §291. Only a product-grounded format makes claims about the
             * artifact. A quiz or a history is grounded in its own sources,
             * which §282 fetches and verifies separately.
             */
            verifyClaimsAgainstArtifact: chosenFormat.format.factuality === 'product',
            voice: {
              displayName: voiceRow.display_name,
              description: voiceRow.description,
              doRules: voiceRow.do_rules,
              dontRules: copywriterDontRules(voiceRow.dont_rules, product.content_rules),
              examples: voiceRow.examples ?? [],
              antiExamples: voiceRow.anti_examples ?? [],
            },
            productBrief: product.brief_summary ?? product.brief_markdown ?? product.name,
            contentRules: {
              forbiddenClaims: product.content_rules?.forbidden_claims,
              bannedPhrases: product.content_rules?.banned_phrases,
            },
          },
          llmFor(),
        );

        // Milestone 42 — where this post should send people, decided from the
        // artifact rather than defaulting to the homepage.
        const destination = resolveDestination({
          category: idea.category,
          destinations: product.destinations ?? {},
          artifact: artifact ? { raw: artifact.raw } : null,
        });

        /**
         * Which board this pin lands on, decided now rather than at publish.
         *
         * `board_id` is required by every API that publishes a pin. Leaving it
         * to publish time means an approved post failing at its slot, which is
         * the worst moment to discover that nobody has created a board.
         */
        const board =
          account.platform === 'pinterest'
            ? await routeToBoard(ctx, account.id, {
                hashtags: draft.hashtags,
                body: draft.body,
                title: draft.title ?? undefined,
                artifact: artifact?.raw,
              })
            : null;

        if (board && !board.boardId) {
          // Refused rather than queued: this post cannot publish, and a queue
          // full of items that cannot publish is worse than an empty one.
          ctx.log('pin has nowhere to go', { platform: account.platform, reason: board.reason });
          await notify(
            ctx,
            'connector_down',
            'warning',
            'A pin could not be filed',
            `${board.reason} No Pinterest drafts will be queued until this is fixed.`,
          );
          continue;
        }

        /*
         * §250. The subtype can be *asked for*, not only defaulted.
         *
         * `defaultSubtypeFor('youtube', ...)` returns `short`, which is the
         * right default and meant long-form was unreachable: no caller could
         * express "make this a long-form video", so §249's architecture sat
         * behind a condition that never fired. The Studio sets this when an
         * operator picks YouTube long-form.
         */
        const requestedSubtype = (job.payload.formatSubtype as string | undefined)?.trim();
        /*
         * A requested subtype only applies where the platform has it.
         *
         * The first production run asked for `long_form` and every account in
         * the run recorded it — including X, where "long form" is not a thing
         * that exists. The render was right (the aspect resolver already
         * refuses long-form off YouTube) and the stored subtype was a lie,
         * which is the kind that survives into a report.
         */
        const subtype =
          requestedSubtype && findFormatSpec(account.platform, requestedSubtype)
            ? requestedSubtype
            : defaultSubtypeFor(account.platform, format);
        if (requestedSubtype && requestedSubtype !== subtype) {
          ctx.log('requested subtype does not exist on this platform', {
            platform: account.platform,
            requested: requestedSubtype,
            using: subtype,
          });
        }

        /**
         * §250. How long this piece runs, decided once.
         *
         * The render's length follows the voiceover, and the voiceover was
         * always written to `VO_TARGET_SECONDS` — 22 seconds. So the first
         * long-form run planned a seven-minute structure and rendered a
         * 28-second video: the stretched-Short failure in reverse, and just as
         * wrong.
         *
         * A long-form target is a real number a person asked for; a
         * short-form one is the house length.
         */
        const runtimeSeconds =
          aspectForRender(account.platform, subtype) === '16:9'
            ? Math.max(
                LONG_FORM_MIN_SECONDS,
                Math.min(LONG_FORM_MAX_SECONDS, Number(job.payload.targetSeconds ?? 420)),
              )
            : VO_TARGET_SECONDS;

        const inserted = await ctx.pool.query<{ id: string }>(
          `insert into content_items
             (product_id, idea_id, account_id, platform, persona, format, category,
              body, title, alt_text, hashtags, product_artifact, claims, qc_results,
              ai_components, status, generation_meta,
              destination_type, destination_url, destination_reason,
              board_id, board_reason,
              /* §215. The writing that did not fit the caption budget, and
                 where it belongs. Never discarded. */
              overflow_body, overflow_home,
              /* §250. Which variant of the format this is. The YouTube adapter
                 reads it to decide Short vs long-form, and without it a
                 long-form piece publishes as a Short. */
              format_subtype)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_approval',$16,
                   $17,$18,$19,$20,$21,$22,$23,$24)
           returning id`,
          [
            productId,
            idea.id,
            account.id,
            account.platform,
            account.persona,
            format,
            idea.category,
            draft.body,
            draft.title ?? null,
            draft.altText ?? null,
            draft.hashtags,
            artifact?.raw ?? null,
            JSON.stringify(draft.claims),
            JSON.stringify(draft.qc),
            ['copy'],
            draft.generationMeta,
            destination.type,
            destination.url,
            destination.blockedBy
              ? `${destination.reason} ${destination.blockedBy}`
              : destination.reason,
            board?.boardId ?? null,
            board?.reason ?? null,
            draft.overflow ?? null,
            draft.overflow ? budgetFor(account.platform).overflowHome : null,
            subtype,
],
        );

        const contentItemId = inserted.rows[0]!.id;
        insertedItemId = contentItemId;

        // The published link points at Halyard's router, not at the destination,
        // so the device decision happens at click time and the click is counted.
        await ctx.pool.query('update content_items set link_url = $2 where id = $1', [
          contentItemId,
          routerUrlFor(publicBaseUrl(), contentItemId),
        ]);

        /**
         * §265. The type these cards are set in.
         *
         * The full Creative Director runs later and only inside the video
         * branch, so an image-only account — Instagram, whose carousel is the
         * most-rendered template in the system — never reached a direction at
         * all. Its cards were drawn in the brand fonts every time.
         *
         * Typography is chosen here from the same recency window the director
         * uses, so a feed rotates through systems instead of repeating one.
         * When a video *also* runs on this item the director's own choice is
         * authoritative for the video; the still card is a companion asset and
         * agreeing with it exactly matters less than not being identical to
         * yesterday's.
         */
        const recentType = await ctx.pool.query<{ typography: string }>(
          `select b.visual_direction ->> 'typography' as typography
             from creative_briefs b
            where b.account_id = $1
            order by b.created_at desc
            limit 6`,
          [account.id],
        );
        const cardType = renderTypography(
          selectTypography({
            /*
             * No language is decided yet on this path — the treatment is chosen
             * after the copy. Passing a language nothing declares makes
             * `selectTypography` consider every system rather than inventing a
             * default, which is exactly the behaviour wanted here.
             */
            visualLanguage: 'unset',
            recentSystemIds: recentType.rows.map((r) => r.typography).filter(Boolean),
          }).system,
        );

        /**
         * §268. A photograph of what is being talked about.
         *
         * Generated once per piece and shared by every card, so a six-slide
         * carousel costs one image rather than six. Illustration only — it
         * never appears in an evidential role, which is what
         * `EVIDENTIAL_ROLES` exists to police.
         *
         * The subject comes from the artifact's own headline, so a different
         * product attached to Halyard describes different things and gets
         * pictures of those. Nothing here knows what a recipe is.
         */
        /*
         * §281/§291. The shape is decided before the draft (see above) and
         * recorded here, once the row exists. Recency the selector cannot read
         * is recency it cannot honour.
         */
        await ctx.pool.query('update content_items set post_format = $2 where id = $1', [
          contentItemId,
          chosenFormat.format.id,
        ]);

        /**
         * §313. The format is written once, here, before anything uses it.
         *
         * It was written inside the carousel branch (§281) and again inside the
         * video branch (§304) — two model calls producing two different sets of
         * copy for one piece, and on an Instagram account both branches can
         * run. One piece, one draft.
         *
         * Hoisting it also fixes the picture. `subjectForImage` took the
         * *artifact's* headline, and the hero was generated before the format
         * had written anything — so a quiz about the history of gluten got a
         * photograph of whatever recipe happened to be adapted that morning.
         * The operator's words: the background "should always be something to
         * do with the content of the video". It could not be, because the
         * content did not exist yet.
         */
        /* §345. `write` is the stage the screenplay, assets and voice depend on. */
        const written =
          chosenFormat.format.id !== 'transformation'
            ? await writeToFormat(
                ctx,
                chosenFormat.format,
                {
                  subject:
                    (job.payload.subject as string | undefined)?.trim() ||
                    subjectForImage(artifact, idea.title) ||
                    idea.title,
                  audience: product.brief_summary ?? 'the people this product is for',
                  platform: account.platform,
                },
                llmFor(),
              )
            : null;

        /**
         * §313. What the picture is *of*, from what the piece actually says.
         *
         * A format's own opening line describes its subject far better than the
         * artifact headline does — "Bread was an accident" gets bread, where
         * the artifact headline would have got a gluten-free brownie. Falls
         * back to the artifact for `transformation`, which genuinely is about
         * the adapted recipe.
         */
        /**
         * §314. What to photograph, not what the piece says.
         *
         * `heroPrompt` writes `A photograph of ${subject}`, so a subject that
         * is a sentence produces "A photograph of Bread was an accident of wild
         * yeast" — which is not English and asks a generator to photograph a
         * proposition. The line is the right *source* and the wrong *shape*.
         *
         * Naming the physical thing a line is about is perception ("How well do
         * you know gluten?" is about bread and dough, not about knowledge), so
         * a model does it and `checkSubject` decides whether the answer can be
         * photographed at all. A refusal falls back to the artifact, which is
         * worse but is at least a noun.
         */
        if (written) completed.push('write');

        /**
         * §345. Assets may not start before the content exists.
         *
         * Not defensive tidiness. Until §313 the hero was generated from an
         * unrelated artifact headline *because nothing required the content to
         * exist first* — a quiz about the history of gluten illustrated with
         * whatever recipe was adapted that morning. The gate is the rule that
         * made that impossible rather than merely fixed.
         */
        const assetsGate = canStart('assets', completed);
        if (production.stages.some((stage) => stage.stage === 'assets') && !assetsGate.ok) {
          ctx.log('assets stage refused', { contentItemId, because: assetsGate.because });
        }

        const formatLine = written ? subjectFromFormat(written.draft.slots) : null;
        let heroSubject = subjectForImage(artifact, idea.title);
        if (formatLine) {
          const verdict = await photographicSubject(
            { line: formatLine, productContext: product.brief_summary ?? undefined },
            llmFor(),
          ).catch(() => ({ subject: null, reason: 'the subject agent failed' }));
          ctx.log('photographic subject', {
            contentItemId,
            from: formatLine,
            subject: verdict.subject,
            because: verdict.reason,
          });
          if (verdict.subject) heroSubject = verdict.subject;
        }
        const hero =
          heroSubject && imageClient
            ? await generateHeroImage(ctx, imageClient, {
                subject: heroSubject,
                visualLanguage: undefined,
                /*
                 * §351. From the post type's own canvas rather than from the
                 * platform. A carousel is 4:5 wherever it is posted, and a
                 * short video is 9:16 — including on Instagram, where the old
                 * platform test gave a Reel a carousel's aspect ratio.
                 */
                aspectRatio: resolvedType.postType.media === 'carousel' ? '4:5' : '9:16',
                contentItemId,
              })
            : null;
        if (hero) {
          await ctx.pool.query(
            `update content_items
                set attached_asset_ids = array_append(attached_asset_ids, $2),
                    ai_components = array_append(ai_components, 'image')
              where id = $1`,
            [contentItemId, hero.assetId],
          );
        }

        // Enqueue renders from the artifact, if it supports the template.
        if (artifact) {
          const props = transformationDiffProps(artifact);
          if (props && enabledTemplates.includes('transformation_diff_4x5')) {
            const render = await ctx.pool.query<{ id: string }>(
              `insert into renders (content_item_id, template_id, renderer, input_props, quality)
               values ($1, 'transformation_diff_4x5', 'satori', $2, 'final') returning id`,
              [contentItemId, { ...props, alt_text: draft.altText, typography: cardType }],
            );
            await ctx.enqueue('render', { renderId: render.rows[0]!.id }, { priority: 50 });
          }

          /*
           * §351. Whether this piece *is* a carousel, not whether the platform
           * happens to be Instagram.
           *
           * The old condition was a platform test standing in for a media
           * question, so Threads and TikTok — both of which carry carousels —
           * could never receive one, and an Instagram Reel took the carousel
           * branch whenever the template was enabled. §349 made the question
           * answerable; this is where it gets asked.
           */
          if (
            resolvedType.postType.media === 'carousel' &&
            enabledTemplates.includes('carousel_6')
          ) {
            /**
             * §281. The deck comes from the format when the format has one.
             *
             * `transformation` keeps the artifact-driven path: it *is* the
             * product demonstration, `carouselProps` already builds it from the
             * artifact's own swaps and notes, and that path is proven. Every
             * other format is a structure the artifact cannot fill on its own,
             * so it is written to its slots and rendered from them.
             *
             * A format that cannot be filled refuses the whole piece rather
             * than falling back to the artifact deck. A quiz that quietly
             * becomes a transformation post is a worse outcome than no post: it
             * is the format system appearing to work while doing nothing.
             */
            let slides = carouselProps(artifact);
            if (written) {
              /* §313. The draft written once above, not a second call. */
              const built = slidesForFormat(
                chosenFormat.format.id,
                written.draft.slots.map((slot) => ({
                  key: slot.key,
                  index: slot.index,
                  text: slot.text,
                  citation: slot.citation ?? null,
                })),
              );
              if (built.length === 0) {
                /*
                 * A catalogue entry with no renderer. Refused loudly rather
                 * than silently substituted, because a plausible default is
                 * how the gap would stay hidden.
                 */
                throw new Error(
                  `${chosenFormat.format.id} filled its slots and has no slide builder.`,
                );
              }
              slides = built as never;
              ctx.log('deck built from format', {
                contentItemId,
                format: chosenFormat.format.id,
                slides: built.length,
                attempts: written.attempts,
              });
            }
            /*
             * §267. A composition per slide, not one for the deck.
             *
             * `usedLayouts` accumulates as the deck is built, so the recency
             * rule runs *within* the carousel as well as across the account:
             * six consecutive slides in one shape is the thing a viewer
             * actually notices, and it is what the first production carousel
             * did.
             */
            /**
             * §273. A real screenshot of the product, on the slide that
             * explains how it works.
             *
             * Captured, not generated — which is the whole point. A screenshot
             * is the only image in the deck that may evidence a claim about the
             * software, because `captured` is in `EVIDENTIAL_PROVENANCE` and
             * `generated` is not. The hero photograph sets the scene; this
             * shows the thing actually happening.
             *
             * Placed on the mechanism slide (`Why`) rather than the opener: the
             * first slide has to stop a scroll and a UI screenshot does not,
             * but by slide three or four a reader has asked "how" and a picture
             * of the answer is worth more than another sentence.
             */
            const shot = await pickProductShot(ctx, {
              productId,
              preferFlow: 'adapt_and_reveal',
            });
            const shotSlideIndex = slides.findIndex((s) => s.kicker === 'Why');

            const usedLayouts: CarouselLayout[] = [];
            for (const slide of slides) {
              const role: SlideRole =
                slide.index === 1
                  ? 'hook'
                  : slide.index === slides.length
                    ? 'close'
                    : slide.index === 2
                      ? 'problem'
                      : 'detail';
              /*
               * Only the opening slide gets the photograph. A carousel where
               * every card is the same picture is worse than one with a strong
               * opener and typographic support behind it.
               */
              const slideHasImage = Boolean(hero) && slide.index === 1;
              /*
               * A format pins the layouts that carry its meaning — a quiz
               * question must be the loud one and its answer the quiet one, or
               * the contrast that *is* the format is gone. Only an
               * artifact-driven deck leaves the choice open.
               */
              const pinned = (slide as { layout?: CarouselLayout }).layout;
              const { layout, reason } = pinned
                ? { layout: pinned, reason: `Pinned by the ${chosenFormat.format.id} format.` }
                : chooseLayout({
                    role,
                    visualLanguage: undefined,
                    bodyLineCount: slide.bodyLines.length,
                    recentLayouts: usedLayouts,
                    hasImage: slideHasImage,
                  });
              usedLayouts.unshift(layout);
              ctx.log('carousel layout', { slide: slide.index, role, layout, because: reason });
              const render = await ctx.pool.query<{ id: string }>(
                `insert into renders (content_item_id, template_id, renderer, input_props, slide_index, quality)
                 values ($1, 'carousel_6', 'satori', $2, $3, 'final') returning id`,
                [
                  contentItemId,
                  {
                    ...slide,
                    typography: cardType,
                    layout,
                    ...(slideHasImage ? { imageAssetId: hero!.assetId } : {}),
                    ...(shot && shotSlideIndex >= 0 && slide.index - 1 === shotSlideIndex
                      ? {
                          screenshotAssetId: shot.assetId,
                          screenshotCaption: shot.caption ?? undefined,
                        }
                      : {}),
                  },
                  slide.index - 1,
                ],
              );
              await ctx.enqueue('render', { renderId: render.rows[0]!.id }, { priority: 50 });
            }
          }
        }

        /**
         * Video: a voiceover script, a Remotion render, and a `tts` job.
         *
         * The render row is created here but **not enqueued**. Its length and
         * its audio both come from the mix, so rendering before the voiceover
         * exists would produce a silent video of the wrong duration — and the
         * queue would show it as finished. The `tts` handler enqueues the
         * render once the audio has landed.
         */
        if (needsVideo(format)) {
          /*
           * §222. The canvas, from the piece's own format rather than from
           * what the platform happens to permit. Everything but YouTube
           * long-form is 9:16, which is what every render before this was.
           */
          const renderAspect = aspectForRender(account.platform, subtype);

          /**
           * §304. The video comes from the format when the format has one.
           *
           * The carousel path has done this since §281 and the video path never
           * did — it went straight to `chooseVideoComposition`, which picks
           * from three compositions all derived from the product artifact. So
           * every Remotion render in production is a `TransformationDiff`, and
           * `quiz` — whose only channel is `short_video` — has never produced a
           * single piece despite having a catalogue entry, a writer, a question
           * planner (§300) and five treatments (§302).
           *
           * `transformation` keeps the artifact path for the same reason it
           * does in the deck: it *is* the product demonstration, and that path
           * is proven. Everything else is a structure the artifact cannot fill.
           *
           * A format with a video builder that cannot fill it refuses the piece
           * rather than falling back. A quiz that quietly becomes a
           * transformation post is the format system appearing to work while
           * doing nothing.
           */
          let composition: { id: string; props: Record<string, unknown> } | null = null;
          let formatNarration: Array<{ atSeconds: number; text: string }> | null = null;
          if (written && VIDEO_FORMATS.includes(chosenFormat.format.id)) {
            /* §313. The draft written once above, not a second call. */
            const built = videoForFormat(
              chosenFormat.format.id,
              written.draft.slots.map((slot) => ({
                key: slot.key,
                index: slot.index,
                text: slot.text,
                citation: slot.citation ?? null,
              })),
            );
            if (!built) {
              throw new Error(
                `${chosenFormat.format.id} has a video builder and filled no usable slots. ` +
                  'Refused rather than rendered as a transformation, which would look like it worked.',
              );
            }
            /*
             * §222. Portrait only. A quiz is a `short_video` format and its
             * composition is registered 9:16; rendering it into a 16:9 slot
             * would produce a Short where a long-form video was asked for,
             * which is the mismatch `resolveVariant` exists to report.
             */
            if (renderAspect === '16:9') {
              ctx.log('format video is portrait-only', {
                format: chosenFormat.format.id,
                aspect: renderAspect,
              });
            } else if (enabledTemplates.includes(built.compositionId)) {
              /**
               * §318. A walkthrough gets the recording the operator asked for.
               *
               * `videoForFormat` cannot know what was captured — inventing a
               * `screenSrc` there would produce a composition confidently
               * referencing footage that does not exist. So the props it
               * returns are the words, and the footage is attached here, from
               * the capture run this piece was queued behind.
               *
               * No footage means no piece. Rendering a walkthrough with an
               * empty screen is a video of a drawn phone showing nothing,
               * which is worse than refusing: it looks like the product
               * failed to load.
               */
              let props = built.props;
              if (chosenFormat.format.needsCapture) {
                const flowId = String(job.payload.flowId ?? 'adapt_and_reveal');
                const { rows: footage } = await ctx.pool.query<{ tag: string }>(
                  `select t as tag
                     from assets a, unnest(a.tags) t
                    where 'capture_cut' = any(a.tags) and t like 'capture/%'
                      and t like '%' || $1 || '%'
                    order by a.created_at desc
                    limit 1`,
                  [flowId],
                );
                const file = footage[0]?.tag;
                if (!file) {
                  throw new Error(
                    `${chosenFormat.format.id} needs footage of ${flowId} and none is stored. ` +
                      'Run a capture for that flow first; a walkthrough with an empty screen ' +
                      'looks like the product failed to load.',
                  );
                }
                props = { ...props, screenSrc: file, flowId };
                ctx.log('walkthrough footage attached', { contentItemId, flowId, file });
              }
              /*
               * §358. An operator's look, passed to the composition. Absent
               * means `chooseQuizTemplate` runs, which varies the treatment
               * across a piece so two questions never look alike — the reason
               * auto is the default rather than a placeholder.
               */
              const look = (job.payload.options as Record<string, string> | undefined)?.template;
              composition = {
                id: built.compositionId,
                props: look && look !== 'auto' ? { ...props, forceTemplate: look } : props,
              };
              /*
               * §306. The read comes from the same slots as the picture.
               *
               * Sending the caption to `writeVoScript` — the path every other
               * video takes — would have the narrator talking about something
               * other than what is on screen, because the caption is written
               * for a feed and this is a quiz. Worse than silence.
               *
               * Written here rather than in the voiceover stage below, which
               * runs `writeVoScript` unconditionally; `vo_lines` being present
               * is what tells `tts` to place the lines rather than read a
               * block of prose.
               */
              formatNarration = built.narration;
              ctx.log('video built from format', {
                contentItemId,
                format: chosenFormat.format.id,
                composition: built.compositionId,
                attempts: written.attempts,
              });
            } else {
              ctx.log('format composition not enabled for this account', {
                format: chosenFormat.format.id,
                composition: built.compositionId,
                enabled: enabledTemplates,
              });
            }
          }

          composition ??= chooseVideoComposition(artifact, enabledTemplates, renderAspect);
          if (!composition) {
            // No enabled Remotion template can carry this. Refused, not queued:
            // a video item with no render never becomes publishable.
            ctx.log('no video template available', {
              platform: account.platform,
              /* §222. Named, because "no template" reads very differently when
                 the piece needed a landscape one that is not enabled. */
              aspect: renderAspect,
              enabled: enabledTemplates,
            });
            await ctx.pool.query(
              `update content_items set status = 'failed',
                      generation_meta = generation_meta || $2::jsonb
                where id = $1`,
              [
                contentItemId,
                JSON.stringify({
                  failed_because: 'No enabled Remotion template could render this item.',
                }),
              ],
            );
            continue;
          }

          /**
           * The same content rules the caption is held to.
           *
           * They reached `writeDraft` and never `writeVoScript`, so a product's
           * forbidden-claims list governed what was written beside a video and
           * not what was said in it.
           */
          /*
           * §232. The voice direction, decided once here and read by both the
           * scriptwriter and the synthesiser.
           *
           * Computed in `generate` rather than in `tts` because the script has
           * to be *written* for the delivery — the API has no emphasis or
           * speed control, so pace lives in the sentences. Recorded on the
           * brief so `tts` uses the same decision rather than making a second
           * one from the same inputs.
           */
          /**
           * §345. A voice for a piece that has no video.
           *
           * `planProduction` skips `voice` for anything that is not moving, and
           * this is where that becomes real: a still or a text post ran the
           * voice stage whenever its own conditions happened to pass, spending
           * a synthesis on audio nothing would ever play.
           */
          /**
           * §358. The operator's choice, above the plan's.
           *
           * `planProduction` decides whether a *kind of piece* has a voice; an
           * operator deciding this one should not is a different question, and
           * a silent caption-led cut is a real style rather than a broken
           * video. An absent override means auto, which is the plan.
           */
          const overrides = (job.payload.options ?? {}) as Record<string, string>;
          const wantsVoice =
            overrides.voice === 'off'
              ? false
              : overrides.voice === 'on'
                ? true
                : production.stages.some((stage) => stage.stage === 'voice');
          if (!wantsVoice) {
            ctx.log('voice skipped', {
              contentItemId,
              because:
                overrides.voice === 'off'
                  ? 'the operator asked for a silent, caption-led cut'
                  : (production.skipped.find((stage) => stage.stage === 'voice')?.because ??
                    'this production has no voice stage'),
            });
          }

          const voice = directVoice({
            platform: account.platform,
            /*
             * The visual language is not decided yet — the treatment is chosen
             * after the copy exists, because the copy is part of what a
             * treatment is judged against. So the voice is directed from what
             * *is* known here: the platform and the runtime. Passing a
             * language that has not been chosen would be inventing an input.
             */
            targetSeconds: runtimeSeconds,
          });

          /**
           * §251. A long script is written section by section.
           *
           * Asked for eleven hundred words in one call, the model wrote sixty
           * — a short-form script, because that is what a single "write a
           * voiceover" request looks like however large the word target says
           * it is. The first long-form run planned seven minutes and produced
           * a 372-character script.
           *
           * The sections already exist and each is a normal-sized writing
           * task with its own brief. They are written in order and stitched,
           * which also means each one can be told what it is *for* rather
           * than inferring it from position.
           */
          const longFormSections =
            artifact && aspectForRender(account.platform, subtype) === '16:9'
              ? planLongForm({
                  artifact,
                  targetSeconds: runtimeSeconds,
                  /*
                   * Whether footage exists is not known yet — the capture is
                   * resolved after the copy. It only affects which *shapes*
                   * are available, and the section briefs a writer needs are
                   * the same either way, so the structure here is planned
                   * without it and re-planned with it when the beats are built.
                   */
                  hasFootage: false,
                }).sections
              : null;

          /**
           * §351. Do not write a script that is already written.
           *
           * §306 made a format piece derive its narration from the same slots
           * the picture is built from, so the voice cannot say something the
           * screen does not show. `writeVoScript` still ran alongside it and
           * its output was discarded at the update below — a model call, its
           * cost, its retries and its QC, for a script nothing would ever read.
           *
           * Skipped rather than tidied away, because the reason matters: the
           * format's narration is *better*, not merely first. A script written
           * from the caption is two removes from the words on screen, which is
           * exactly the fault §350 traced.
           */
          const narrationAlreadyWritten = (formatNarration?.length ?? 0) > 0;
          if (narrationAlreadyWritten) {
            ctx.log('vo script skipped', {
              contentItemId,
              because:
                'the format built the narration from its own slots, so a script written from ' +
                'the caption would be discarded — and would say different words from the screen',
            });
          }

          const vo = narrationAlreadyWritten
            ? {
                script: formatNarration!.map((line) => line.text).join(' '),
                costUsd: 0,
                qc: null as Awaited<ReturnType<typeof writeVoScript>>['qc'] | null,
                attempts: 0,
              }
            : longFormSections
            ? await (async () => {
                const parts: string[] = [];
                let cost = 0;
                let attempts = 0;
                let lastQc: Awaited<ReturnType<typeof writeVoScript>>['qc'] | null = null;
                for (const [i, section] of longFormSections.entries()) {
                  const part = await writeVoScript(
                    {
                      body: draft.body,
                      artifact,
                      targetSeconds: section.targetSeconds,
                      platform: account.platform,
                      contentRules: {
                        bannedPhrases: product.content_rules?.banned_phrases,
                        forbiddenClaims: product.content_rules?.forbidden_claims,
                      },
                      deliveryNotes: voice.deliveryNotes,
                      section: {
                        title: section.title,
                        brief: section.brief,
                        index: i,
                        total: longFormSections.length,
                      },
                    },
                    llmFor(),
                  );
                  parts.push(part.script.trim());
                  cost += part.costUsd;
                  attempts += part.attempts;
                  lastQc = part.qc;
                }
                ctx.log('long-form script written in sections', {
                  sections: longFormSections.length,
                  words: parts.join(' ').split(/\s+/).filter(Boolean).length,
                  costUsd: Number(cost.toFixed(4)),
                });
                return { script: parts.join('\n\n'), costUsd: cost, qc: lastQc!, attempts };
              })()
            : await writeVoScript(
                {
                  body: draft.body,
                  artifact,
                  targetSeconds: runtimeSeconds,
                  platform: account.platform,
                  contentRules: {
                    bannedPhrases: product.content_rules?.banned_phrases,
                    forbiddenClaims: product.content_rules?.forbidden_claims,
                  },
                  /* §232. Pace and stress live in the sentences, because the
                     synthesis endpoint has neither. */
                  deliveryNotes: voice.deliveryNotes,
                },
                llmFor(),
              );

          await ctx.pool.query(
            `update content_items
                set vo_script = $2, vo_lines = $3, audio_mode = 'founder_cloned',
                    ai_components = array_append(ai_components, 'voiceover')
              where id = $1`,
            [
              contentItemId,
              /*
               * §306. When the format wrote the read, that is the script. The
               * prose version is kept as the plain text of the same lines so
               * every consumer that reads `vo_script` — the gates, the lexicon
               * check, the caption aligner — still has something true to read.
               */
              formatNarration ? formatNarration.map((l) => l.text).join(' ') : vo.script,
              /*
               * §354. The artifact path still has no timed lines, and this is
               * where the attempt stopped.
               *
               * Placing lines on beats needs each beat's *duration*, and at
               * this point in the pipeline they do not have one:
               * `CreativeBeat` carries no seconds, and the allocation that
               * turns weights into times happens later, at render.
               *
               * Duplicating that allocation here would give two answers to one
               * question and let them drift — the exact fault this section
               * keeps removing. The real fix is to share the allocator, which
               * is a change to make deliberately rather than in passing.
               *
               * So the format path has timed lines and the artifact path does
               * not, and that is written down rather than papered over with
               * timings derived from nothing. `docs/NEXT_STEPS.md` carries it.
               */
              formatNarration ? JSON.stringify(formatNarration) : null,
            ],
          );

          /**
           * §160. The creative plan, decided before anything renders.
           *
           * `chooseVideoComposition` has already said which template can carry
           * this artifact. This says how the story inside it is paced: which
           * change is held on, which are corroboration, and where the evidence
           * beat goes. The beats travel in `input_props`, so the render is
           * reproducible from the row without re-deriving anything.
           *
           * `null` when the artifact has no transformation, and that is not a
           * failure — the composition falls back to its own flat layout, which
           * is what it did before plans existed.
           */
          // `artifact` is non-null here: `chooseVideoComposition` returns null
          // without one, and that path returned above.
          /*
           * §163. Footage, if a capture actually produced any.
           *
           * The tag is written by the capture handler alongside the cut it
           * wrote into the render bundle. Queried rather than assumed: no row
           * means no footage means no demo beat, which is the honest outcome
           * and the one that keeps a render from pointing at a missing file.
           *
           * Bounded by age because a capture is evidence about a product that
           * changes. Footage of an interface two months of releases old is a
           * claim about a product that no longer looks like that.
           */
          const footage = await captureFootage(ctx, productId);
          if (footage) {
            ctx.log('planning on captured footage', {
              file: footage.file,
              ageDays: footage.ageDays,
            });
          }

          /**
           * §203. Choose a treatment; do not assume one.
           *
           * This called `planBeforeAfter` directly, so every video on every
           * account was a before/after — the nine declared creative types had
           * one implementation between them. `selectCreativePlan` runs every
           * planner, keeps the ones the artifact actually supports, and
           * subtracts recent use so a strong treatment does not become the
           * only treatment.
           *
           * The recency read is the account's own last few creative types,
           * which generation has recorded in `generation_meta.creative.type`
           * since §160 — so diversity needed a reader, not a column.
           */
          const recentTypes = artifact
            ? (
                await ctx.pool.query<{ type: string }>(
                  `select generation_meta -> 'creative' ->> 'type' as type
                     from content_items
                    where account_id = $1
                      and generation_meta -> 'creative' ->> 'type' is not null
                    order by created_at desc
                    limit 6`,
                  [account.id],
                )
              ).rows.map((r) => r.type as CreativeType)
            : [];

          /**
           * §204. What this account's own results have taught us.
           *
           * The consumption half of the learning loop, and the half that is
           * usually missing — a table of insights nobody reads is not
           * learning. Account scope only: a belief formed across accounts that
           * behave differently is not evidence about this one, and the account
           * cohort is where the specification says narrow evidence should
           * dominate.
           *
           * Stale and merely-`observed` beliefs are filtered inside
           * `selectCreativePlan` by `actionableInsights`, not here, so every
           * caller gets the same freshness rule.
           */
          const learned = artifact
            ? (
                await ctx.pool.query(
                  `select scope, platform, account_id, feature, feature_value,
                          cohort_mean, baseline_mean, lift, sample_size, baseline_size,
                          status, confidence, corroborations,
                          supporting_content_ids, contradicting_content_ids,
                          evidence_window_start, evidence_window_end,
                          observation, recommendation, review_after
                     from learned_insights
                    where scope = 'account' and account_id = $1 and feature = 'creative_type'`,
                  [account.id],
                )
              ).rows.map((r) => ({
                scope: r.scope,
                platform: r.platform,
                accountId: r.account_id,
                feature: r.feature,
                featureValue: r.feature_value,
                cohortMean: Number(r.cohort_mean),
                baselineMean: Number(r.baseline_mean),
                lift: Number(r.lift),
                sampleSize: r.sample_size,
                baselineSize: r.baseline_size,
                status: r.status,
                confidence: Number(r.confidence),
                corroborations: r.corroborations,
                evidence: {
                  supporting: r.supporting_content_ids ?? [],
                  contradicting: r.contradicting_content_ids ?? [],
                  windowStart: new Date(r.evidence_window_start ?? 0),
                  windowEnd: new Date(r.evidence_window_end ?? 0),
                },
                observation: r.observation,
                recommendation: r.recommendation,
                reviewAfter: new Date(r.review_after),
              }))
            : [];

          /**
           * §208. The account's own mix, as it was last measured.
           *
           * Read rather than recomputed: `build_account_intelligence` owns the
           * arithmetic, and a second implementation here would be a second
           * answer to the same question. Absent — a new account, or the job has
           * not run — means no portfolio pressure at all, which is the honest
           * state rather than a guessed one.
           */
          const portfolioRow = artifact
            ? (
                await ctx.pool.query<{
                  window_size: number;
                  slices: unknown;
                  findings: unknown;
                  gaps: unknown;
                  exploration_share: string | null;
                  summary: string;
                }>(
                  `select window_size, slices, findings, gaps, exploration_share, summary
                     from account_intelligence
                    where account_id = $1
                    order by observed_at desc
                    limit 1`,
                  [account.id],
                )
              ).rows[0]
            : undefined;

          const portfolio = portfolioRow
            ? {
                window: portfolioRow.window_size,
                slices: (portfolioRow.slices as never) ?? [],
                findings: (portfolioRow.findings as never) ?? [],
                gaps: (portfolioRow.gaps as never) ?? {},
                explorationShare: Number(portfolioRow.exploration_share ?? 0),
                summary: portfolioRow.summary,
              }
            : undefined;

          /**
           * §249. Long-form is a different architecture, not a longer short.
           *
           * Ask a short-form planner for eight minutes and the timing engine
           * stretches four beats to two minutes each — a slideshow with very
           * patient slides. A long-form piece has sections with intended
           * lengths, real chapter titles, and a body that dominates.
           *
           * Decided before `selectCreativePlan` because the two produce
           * different things: one returns beats, the other returns sections
           * that become beats.
           */
          const wantsLongForm = aspectForRender(account.platform, subtype) === '16:9';

          const longForm =
            wantsLongForm && artifact
              ? planLongForm({
                  artifact,
                  targetSeconds: runtimeSeconds,
                  hasFootage: Boolean(footage),
                  /* Shape recency comes from the briefs themselves, read
                     here rather than reusing the direction query below —
                     which has not run yet at this point. */
                  recentShapes: (
                    await ctx.pool.query<{ shape: string }>(
                      `select visual_direction ->> 'longFormShape' as shape
                         from creative_briefs
                        where account_id = $1
                          and visual_direction ->> 'longFormShape' is not null
                        order by created_at desc limit 4`,
                      [account.id],
                    )
                  ).rows.map((r) => r.shape),
                })
              : null;
          if (longForm) {
            ctx.log('long-form structure', {
              shape: longForm.shape,
              because: longForm.rationale,
              sections: longForm.sections.map((x) => `${x.title} (${x.targetSeconds}s)`),
              totalSeconds: longForm.totalSeconds,
            });
          }

          const selection = artifact
            ? selectCreativePlan(artifact, {
                platform: account.platform,
                format,
                targetSeconds: runtimeSeconds,
                recentTypes,
                insights: learned,
                ...(portfolio ? { portfolio } : {}),
                ...(footage ? { footage } : {}),
              })
            : null;
          /*
           * §249. A long-form structure replaces the short-form plan.
           *
           * Built as a `CreativePlan` so everything downstream — motion,
           * typography, the renderer, the QC gate — is unchanged. The
           * difference is entirely in the beats and their intended lengths.
           */
          const plan: CreativePlan | null = longForm
            ? {
                creativeType: creativeTypeForShape(longForm.shape) as CreativePlan['creativeType'],
                platform: account.platform,
                format,
                targetSeconds: longForm.totalSeconds,
                beats: longFormBeats(longForm, artifact!),
                /* Long-form sections that want footage play it full-bleed, so
                   captions sit over media; the rest fall back to a surface. */
                captionBackdrop: longForm.sections.some((x) => x.wantsFootage)
                  ? 'media'
                  : 'surface',
                evidence: longFormBeats(longForm, artifact!)
                  .map((b) => b.sourcePath)
                  .filter((v): v is string => Boolean(v)),
                rationale: longForm.rationale,
              }
            : (selection?.chosen ?? null);

          /**
           * §215. Record why this post exists.
           *
           * §210 built `decideStrategy` and `strategy_decisions` and wired
           * neither — the lineage table had no writer, which makes "why did
           * Halyard make this post" exactly as unanswerable as it was before.
           *
           * Written after the item so the row can point at it, and non-fatally:
           * a failure to record the reasoning must not lose a post that is
           * otherwise fine. The decision is a description of a choice already
           * made, not a gate on making it.
           */
          try {
            const decision = decideStrategy({
              opportunity: {
                id: idea.id,
                summary: idea.title,
                source: 'editorial',
                effectiveValue: 1,
              },
              account: {
                id: account.id,
                platform: account.platform,
                capabilityState: 'live',
                lastPublishedAt: null,
              },
              ...(portfolio ? { portfolio } : {}),
              insights: learned,
            });

            if (!isRefusal(decision)) {
              await ctx.pool.query(
                `insert into strategy_decisions
                   (product_id, account_id, platform, idea_id, content_item_id,
                    objective, creation_mode, why_now, audience, rationale,
                    preferred_treatments, avoid_treatments,
                    publish_earliest, publish_latest, timing_reason,
                    primary_metric, success_threshold, measurement_basis, review_after,
                    confidence, evidence)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
                [
                  productId,
                  account.id,
                  account.platform,
                  idea.id,
                  contentItemId,
                  decision.objective,
                  decision.creationMode,
                  decision.whyNow,
                  decision.audience,
                  decision.rationale,
                  decision.preferredTreatments,
                  decision.avoidTreatments,
                  decision.timing.earliest,
                  decision.timing.latest,
                  decision.timing.reason,
                  decision.measurement.primaryMetric,
                  decision.measurement.successThreshold,
                  decision.measurement.basis,
                  decision.measurement.reviewAfter,
                  decision.confidence,
                  decision.evidence,
                ],
              );
            }
          } catch (err) {
            ctx.log('could not record the strategy decision', {
              contentItemId,
              error: (err as Error).message,
            });
          }

          if (selection) {
            ctx.log('creative treatment chosen', {
              chosen: selection.chosen.creativeType,
              considered: selection.considered.map((c) => c.plan.creativeType),
              recent: recentTypes,
              // Zero here is the honest state for an account nobody has measured.
              learnedFrom: learned.length,
              portfolioWindow: portfolio?.window ?? 0,
            });
          } else if (artifact) {
            // No treatment fitted. Honest, and worth seeing: it means the
            // artifact carried nothing a planner recognised as a story.
            ctx.log('no creative treatment supported by this artifact', {
              highlights: artifact.highlights?.length ?? 0,
            });
          }

          /*
           * §226. Which type this piece is set in, and why.
           *
           * Recency comes from the account's own recent briefs rather than a
           * global window: two accounts should be allowed to use the same
           * system at the same time, and only repetition *within one feed* is
           * the thing a viewer notices.
           */
          /*
           * §228. The Creative Director, and everything that hangs off it.
           *
           * One decision — the visual language — read by typography, motion
           * and the music director, rather than five modules each guessing
           * from the treatment. That is what makes the choices cooperate: a
           * documentary bed under a fast-cut edit is the failure that happens
           * when each module derives its own answer.
           */
          const recentDirection = await ctx.pool.query<{ language: string; typography: string; opening: string }>(
            `select b.visual_direction ->> 'language' as language,
                    b.visual_direction ->> 'typography' as typography,
                    b.visual_direction ->> 'opening' as opening
               from creative_briefs b
              where b.account_id = $1
              order by b.created_at desc
              limit 6`,
            [account.id],
          );

          const direction = plan
            ? directCreative({
                platform: account.platform,
                treatment: plan.creativeType,
                targetSeconds: plan.targetSeconds,
                hasProductFootage: Boolean(footage),
                hasImagery: plan.beats.some((b) => Boolean(b.image)),
                recentLanguages: recentDirection.rows.map((r) => r.language).filter(Boolean),
                insights: learned,
              })
            : null;
          if (direction) {
            ctx.log('creative direction', {
              language: direction.language,
              because: direction.reason,
              considered: direction.considered.slice(0, 4),
            });
          }

          /*
           * §229. Which layout the first frame is.
           *
           * The one thing that survived every other variation: six typography
           * systems all still opened with the same kicker over the same
           * headline at the same height.
           */
          const hookBeat = plan?.beats.find((b) => b.role === 'hook');
          const hookText =
            (hookBeat?.content?.text as string | undefined) ?? draft.title ?? idea.title;
          const opening = plan
            ? chooseOpening({
                text: hookText,
                visualLanguage: direction?.language ?? DEFAULT_LANGUAGE,
                hasMedia: Boolean(hookBeat?.image || hookBeat?.media),
                /* Only a figure the artifact actually contains. */
                numeral: (hookBeat?.content?.numeral as string | undefined) ?? null,
                beforeState: (hookBeat?.content?.before as string | undefined) ?? null,
                recent: recentDirection.rows
                  .map((r) => (r as { opening?: string }).opening)
                  .filter((v): v is string => Boolean(v)),
              })
            : null;
          if (opening) {
            ctx.log('opening composition', {
              composition: opening.composition,
              because: opening.reason,
              unavailable: opening.unavailable.map((u) => `${u.composition}: ${u.because}`),
            });
          }

          const typography = plan
            ? selectTypography({
                visualLanguage: direction?.language ?? DEFAULT_LANGUAGE,
                recentSystemIds: recentDirection.rows.map((r) => r.typography).filter(Boolean),
              })
            : null;
          if (typography) {
            ctx.log('typography chosen', {
              system: typography.system.id,
              because: typography.reason,
              instead: typography.alternatives,
            });
          }

          await ctx.pool.query(
            `insert into renders (content_item_id, template_id, renderer, input_props, quality)
             values ($1, $2, 'remotion', $3, 'final')`,
            [
              contentItemId,
              composition.id,
              {
                ...composition.props,
                alt_text: draft.altText,
                /**
                 * §215. The visual register, chosen per platform.
                 *
                 * §211 built this and left it unwired — `presentationFor` was
                 * called only by the acceptance script, so every production
                 * render was still editorial and the whole change did nothing
                 * outside a test. A module with no caller is the same defect as
                 * a learning table nobody reads, pointed the other way.
                 */
                /*
                 * The same subtype resolver the copywriter uses, so the words
                 * and the frames are briefed for the same surface. A YouTube
                 * Short and a long-form upload are different registers, and
                 * `defaultSubtypeFor` is where that is decided once.
                 */
                presentation: {
                  ...presentationFor(account.platform, subtype),
                  /*
                   * §226. The typography system, resolved per piece.
                   *
                   * Every video before this set its headings in one serif and
                   * its body in one sans, because those were the only faces on
                   * disk. Motion varied, the register varied, the treatment
                   * varied — and every frame still opened in the same type, so
                   * none of that variation was visible. `typography` is chosen
                   * from what fits the visual language and is least recently
                   * used, so an account's feed stops looking like one video
                   * with different words in it.
                   */
                  ...(typography ? { typography: renderTypography(typography.system) } : {}),
                },
                ...(plan
                  ? {
                      beats: beatsForRender(
                        plan,
                        presentationFor(account.platform, subtype).mode,
                        /* §228. The director's language, not the treatment's
                           default — otherwise eight of the thirteen are
                           reachable from nothing. */
                        direction?.language,
                        opening
                          ? {
                              composition: opening.composition,
                              ...(opening.holdWords ? { holdWords: opening.holdWords } : {}),
                            }
                          : undefined,
                      ),
                      captionBackdrop: plan.captionBackdrop,
                    }
                  : {}),
              },
            ],
          );

          if (plan) {
            // Recorded on the item, not only in the render row: the plan is a
            // decision about the post, and `evidence` is the provenance chain
            // behind what the frames show.
            await ctx.pool.query(
              `update content_items
                  set generation_meta = generation_meta || $2::jsonb
                where id = $1`,
              [
                contentItemId,
                JSON.stringify({
                  creative: {
                    type: plan.creativeType,
                    beats: plan.beats.length,
                    evidence: plan.evidence,
                    rationale: plan.rationale,
                    /*
                     * §203. What else the artifact supported, and what recency
                     * cost each one. "Why this treatment" is only answerable
                     * against the alternatives that lost.
                     */
                    considered: selection?.considered.map((c) => ({
                      type: c.plan.creativeType,
                      support: c.support,
                      penalty: Number(c.penalty.toFixed(2)),
                      /* §204, §208. Kept apart so "why this treatment" can name
                       * performance and portfolio as separate reasons. */
                      learned: c.learned,
                      portfolio: c.portfolio,
                      score: Number(c.score.toFixed(2)),
                    })),
                  },
                }),
              ],
            );

            /**
             * §225. The brief as a row, and the item pointing at it.
             *
             * §218 built `concepts`, `creative_briefs` and `platform_variants`
             * and wired none of them: production held zero briefs, and
             * `content_items.brief_id` had no writer at all. So §221's audio
             * direction and §223's chapters — both of which read the brief —
             * were correct code joined to an empty table. Three systems, one
             * missing insert.
             *
             * The plan *is* the brief. It already carries the treatment, the
             * beats, the runtime and the register; writing it down is not a
             * derivation, it is a record of a decision that was made.
             */
            const brief = await ctx.pool.query<{ id: string }>(
              `insert into creative_briefs
                 (product_id, account_id, platform, treatment, presentation_mode,
                  target_seconds, aspect_ratio, beats, visual_direction,
                  audio_direction, caption_direction, evidence, rationale)
               values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
               returning id`,
              [
                productId,
                account.id,
                account.platform,
                plan.creativeType,
                presentationFor(account.platform, defaultSubtypeFor(account.platform, format)).mode,
                plan.targetSeconds,
                renderAspect,
                JSON.stringify(
                  beatsForRender(
                    plan,
                    presentationFor(account.platform, defaultSubtypeFor(account.platform, format))
                      .mode,
                  ),
                ),
                /* §226. The typography id lives here because this is what the
                   next piece's recency window reads. A choice recorded nowhere
                   cannot be varied against. */
                JSON.stringify({
                  language: direction?.language ?? LANGUAGE_FOR_TREATMENT[plan.creativeType] ?? null,
                  languageReason: direction?.reason ?? null,
                  languageConsidered: direction?.considered.slice(0, 5) ?? null,
                  typography: typography?.system.id ?? null,
                  typographyReason: typography?.reason ?? null,
                  opening: opening?.composition ?? null,
                  openingReason: opening?.reason ?? null,
                  /* §249. So the next long-form piece can vary from this one. */
                  longFormShape: longForm?.shape ?? null,
                  longFormRationale: longForm?.rationale ?? null,
                  longFormSections: longForm?.sections.map((x) => x.title) ?? null,
                }),
                /* §232. The voice decision, recorded so `tts` reads it rather
                   than deriving a second one from the same inputs. */
                JSON.stringify({
                  captionBackdrop: plan.captionBackdrop,
                  voiceEnergy: voice.energy,
                  voiceStability: voice.stability,
                  voiceSimilarityBoost: voice.similarityBoost,
                  voiceReason: voice.reason,
                  deliveryNotes: voice.deliveryNotes,
                }),
                JSON.stringify({ overflowHome: budgetFor(account.platform).overflowHome }),
                plan.evidence,
                plan.rationale,
              ],
            );
            await ctx.pool.query('update content_items set brief_id = $2 where id = $1', [
              contentItemId,
              brief.rows[0]!.id,
            ]);

            /**
             * §231. What this concept should become on every other surface.
             *
             * `platform_variants` has had columns for pacing, text density,
             * hook treatment, CTA and audio treatment since §218 and no writer
             * at all — the only per-platform difference a render actually had
             * was the caption budget. A TikTok, a Reel and a Short got the
             * same file with different words underneath.
             *
             * Written as a *plan*, not as queued work. The decision — reuse,
             * remix, make an original, or skip entirely — is a record an
             * operator can read and disagree with before anything is built,
             * and `skip` is the one that makes the others honest.
             */
            const connected = await ctx.pool.query<{ platform: string; unsupported: string[] }>(
              `select platform,
                      coalesce(array(select unnest(array['text','image','video','carousel'])
                                     except select unnest(supported_formats)), '{}') as unsupported
                 from social_accounts
                /* Every connected account, whatever its capability state. A
                   variant plan is a plan; whether the account can publish is
                   the approval boundary's question, not the director's. */
                where product_id = $1`,
              [productId],
            );
            const variants = planVariants({
              primaryPlatform: account.platform,
              platforms: connected.rows.map((r) => r.platform),
              treatment: plan.creativeType,
              voiceCarriesMeaning: needsVideo(format),
              needsFootage: plan.beats.some((b) => Boolean(b.media)),
              hasFootage: Boolean(footage),
              unsupported: Object.fromEntries(
                connected.rows.map((r) => [r.platform, r.unsupported ?? []]),
              ),
            });
            for (const variant of variants) {
              await ctx.pool.query(
                `insert into platform_variants
                   (brief_id, content_item_id, platform, aspect_ratio, target_seconds,
                    pacing, text_density, hook_treatment, cta, audio_treatment,
                    decision, decision_reason)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                  brief.rows[0]!.id,
                  variant.platform === account.platform ? contentItemId : null,
                  variant.platform,
                  variant.aspectRatio,
                  variant.targetSeconds,
                  variant.pacing,
                  variant.textDensity,
                  variant.hookTreatment,
                  variant.cta,
                  variant.audioTreatment,
                  variant.decision,
                  variant.decisionReason,
                ],
              );
            }
            ctx.log('platform variants planned', {
              contentItemId,
              plan: variants.map((v) => `${v.platform}:${v.decision}`),
            });

            /**
             * §224. A thumbnail, for the one format that lives or dies by one.
             *
             * Long-form only: a Short is discovered by autoplay and never shows
             * a custom thumbnail in the feed it appears in, so rendering one
             * would be work nobody ever sees.
             *
             * The text comes from what the concept already said and is refused
             * rather than truncated — a headline stopped mid-thought reads as a
             * bug. A refusal is logged and the item continues: a long-form
             * video with YouTube's auto-generated thumbnail is worse than one
             * with a good custom thumbnail and better than no video.
             */
            if (renderAspect === '16:9' && enabledTemplates.includes('youtube_thumbnail')) {
              const line = thumbnailTextFrom({ hook: draft.title, title: idea.title });
              if (line.text === null) {
                ctx.log('no thumbnail text', { contentItemId, reason: line.reason });
              } else {
                const thumb = await ctx.pool.query<{ id: string }>(
                  `insert into renders (content_item_id, template_id, renderer, input_props, quality)
                   values ($1, 'youtube_thumbnail', 'satori', $2, 'final') returning id`,
                  [
                    contentItemId,
                    {
                      overlayText: line.text,
                      fontSizePx: thumbnailFontSize(line.text),
                      alt_text: `Thumbnail: ${line.text}`,
                    },
                  ],
                );
                await ctx.enqueue('render', { renderId: thumb.rows[0]!.id }, { priority: 50 });
                ctx.log('thumbnail queued', { contentItemId, text: line.text, from: line.source });
              }
            }
          }

          await ctx.enqueue(
            'tts',
            { contentItemId },
            { dedupeKey: `tts:${contentItemId}`, priority: 45 },
          );
        }

        /**
         * The hook stage — generate variants, score them, apply the best.
         *
         * `surfaceBestVariants` had no caller. Generation only ever *recorded*
         * a hook after the fact, by classifying whatever first line the
         * copywriter happened to write, so the half of the system that chooses
         * a better opening never ran. The module calls itself "the loop that
         * compounds"; it was recording its results and never acting on them.
         */
        const hookStage = await runHookStage(
          ctx,
          {
            contentItemId,
            productId,
            platform: account.platform,
            category: idea.category,
            format,
            body: draft.body,
            brandNames: [product.name],
          },
          llmFor(),
        );

        if (hookStage.applied) {
          /**
           * §143. Re-gate the rewritten post, and store the result that
           * describes it. The first live run made the exposure concrete: the
           * copy gate had already warned at 267 of 280 characters, so any hook
           * longer than the sentence it replaced took the post past X's
           * ceiling with `qc_results` still reading "passed".
           */
          const hooked = regateHookedBody({
            body: draft.body,
            hook: hookStage.applied.textHook,
            platform: account.platform,
            hashtags: draft.hashtags,
            bannedPhrases: product.content_rules?.banned_phrases,
            forbiddenClaims: product.content_rules?.forbidden_claims,
            claims: draft.claims,
            artifact: artifact?.raw,
          });

          if (hooked) {
            await ctx.pool.query(
              'update content_items set body = $2, qc_results = $3 where id = $1',
              [contentItemId, hooked.body, JSON.stringify(hooked.qc)],
            );
          } else {
            // Never queued with an unpublishable opening. The copywriter's
            // version is already in the row, and it passed.
            ctx.log('hook rejected by QC, keeping the copywriter opening', {
              contentItemId,
              platform: account.platform,
            });
          }

          /**
           * §212. The hook reaches the frames, not just the caption.
           *
           * The hook stage produces genuinely good openings — "One teaspoon.
           * Nothing else moved.", "Halving a recipe isn't math" — and until now
           * they only ever rewrote `content_items.body`. The *video* opened on
           * whatever the planner had put in the hook beat, which is the
           * artifact headline: "5 things — Sally's Artisan Bread, gluten-free".
           *
           * So the best line the system wrote was in the caption, and the most
           * valuable frame in the piece — the one that is also the thumbnail —
           * showed a title. Two halves of one decision, disconnected.
           *
           * Patched here rather than by re-planning because the plan's
           * *structure* is right and only its opening words were a placeholder.
           * Safe at this point in the flow: the video render is enqueued later
           * by `tts`, so the row being edited has not been drawn yet.
           */
          await ctx.pool.query(
            `update renders
                set input_props = jsonb_set(
                      input_props,
                      '{beats,0,content,text}',
                      to_jsonb($2::text),
                      true
                    )
              where content_item_id = $1
                and status = 'queued'
                and input_props -> 'beats' -> 0 ->> 'role' = 'hook'`,
            [contentItemId, hookStage.applied.textHook],
          );
        }

        if (draft.hookPattern) {
          // `hook_type` is NOT NULL as of migration 0012 and this insert never
          // supplied it, so every hook a draft produced was lost to a
          // constraint violation — inside a try that treats the failure as a
          // failed draft. Classified here from the pattern itself, which is
          // what /hooks groups by.
          await ctx.pool.query(
            `insert into hooks
               (product_id, pattern, pattern_template, hook_type, layer, platform, category, source, uses)
             values ($1,$2,$3,$4,'text',$5,$6,'approved_post',1)
             on conflict do nothing`,
            [
              productId,
              draft.hookPattern,
              extractHookPattern(draft.hookPattern).template,
              classifyHookType(draft.hookPattern),
              account.platform,
              idea.category,
            ],
          );
        }

        ctx.log('drafted', { contentItemId, platform: account.platform, attempts: draft.attempts });

      } catch (err) {
        if (err instanceof DraftRejectedError) {
          /*
           * The gate did its job. The row it left behind is the problem: the
           * copy insert happens ~240 lines before the voiceover is written, so
           * a script this rejects leaves an approvable video with no audio and
           * no render. §258.
           */
          /**
           * §262. Say which gate refused, not merely that one did.
           *
           * `DraftRejectedError` has carried `lastQc` since it was written and
           * nothing has ever read it, so a rejection reached the operator as
           * "rejected by QC after 3 attempts" with no way to find out why. The
           * copywriter's own comment calls that "the failure recorded somewhere
           * nobody reads"; it was in fact recorded nowhere.
           *
           * Three consecutive attempts failing the same rule is the signal
           * worth having — it means the brief and the gate disagree, which no
           * number of retries will settle.
           */
          const refusedBy = err.lastQc.gates
            .filter((g) => g.status === 'failed')
            .map((g) => `${g.gate}: ${g.summary}`);
          const why = refusedBy.length
            ? `The voiceover was rejected by QC after ${err.attempts} attempts (${refusedBy.join('; ')}), so no video was built.`
            : `The voiceover was rejected by QC after ${err.attempts} attempts, so no video was built.`;

          await disownPartialItem(why);
          ctx.log('draft rejected by QC', {
            platform: account.platform,
            idea: idea.id,
            attempts: err.attempts,
            refusedBy: refusedBy.length ? refusedBy : ['no gate reported failed'],
            disowned: insertedItemId ?? 'nothing inserted yet',
          });
          continue;
        }
        /**
         * §290. A format that could not be filled fails this piece, not the job.
         *
         * `FormatRejectedError` was reaching the generic rethrow, which fails
         * the whole `generate` job and retries it — so one unfillable quiz took
         * down the drafts for every other account in the run, and the retry
         * asked for the same impossible thing again.
         *
         * It is a fact about *this* piece: the shape asked for something the
         * writer could not produce with a source it could verify. The item is
         * disowned with the reason, the account loop continues, and the reason
         * survives on the row instead of only in a log line.
         */
        if (err instanceof FormatRejectedError) {
          await disownPartialItem(err.message);
          ctx.log('format could not be filled, piece abandoned', {
            platform: account.platform,
            idea: idea.id,
            attempts: err.attempts,
            refusedBy: err.problems
              .filter((p) => p.severity === 'error')
              .map((p) => `${p.rule}${p.slot ? ` (${p.slot})` : ''}`),
          });
          continue;
        }

        if (err instanceof NoUsableFormatError) {
          /**
           * One account's capabilities are unknown. That is a fact about that
           * account, not a reason to abandon the other five.
           *
           * This used to rethrow, and the first live generation run showed what
           * that costs: an Instagram account with an empty `supported_formats`
           * failed the whole job before the loop reached `x`, which was the one
           * account that could have produced a publishable draft. With
           * `maxAttempts: 2` the job then dead-letters, so a single
           * unreconnected account stops daily generation for the product
           * entirely — and the error names Instagram, so nothing points at the
           * drafts that never happened elsewhere.
           *
           * The guard itself is unchanged: nothing is generated for an account
           * whose capabilities are unknown, because a format guess is how
           * TikTok ended up with image drafts it could not publish.
           */
          await disownPartialItem(`No usable format for this account: ${err.message}`);
          ctx.log('account cannot take any format Halyard produces, skipping it', {
            platform: account.platform,
            idea: idea.id,
            reason: err.message,
          });
          continue;
        }
        /*
         * Rethrown, so the job fails and retries — but the row is disowned
         * first. A retry inserts a fresh one, and without this the queue
         * accumulates a no-media item per attempt.
         */
        await disownPartialItem(`Generation threw before the piece was finished: ${(err as Error).message}`);
        throw err;
      }
    }

    await ctx.pool.query(`update ideas set status = 'used' where id = $1`, [idea.id]);
  }
}

/**
 * Turn recent signals into proposed ideas, with provenance.
 *
 * Returns how many were written, so the caller can tell "the model proposed
 * nothing usable" from "there was nothing to propose from" — those look
 * identical in an empty table and only one of them is worth investigating.
 *
 * Signals are marked `consumed_at` whether or not they produced a usable idea.
 * A signal that has been in front of the model once should not queue up behind
 * every future run; if it deserves another look, it will recur and
 * `collect_watch_terms` will raise it again, which is the whole point of
 * measuring recurrence over thirty days.
 */
export async function proposeFromSignals(
  ctx: HandlerContext,
  product: { id: string; name: string; brief_summary: string | null; brief_markdown: string | null },
  llm: LlmClient,
): Promise<number> {
  /**
   * Claimed, not merely read.
   *
   * `generate` is not worker-scheduled — it runs from the web cron and from
   * `regenerateItem` — so two runs for one product can overlap. A plain
   * `select … where consumed_at is null` lets both read the same signals and
   * both send them to the model: the same evidence paid for twice, which is the
   * defect §87 closed for *retries* and left open for *concurrency*.
   *
   * The update is the select. Postgres evaluates the `where` and writes the row
   * atomically, so a second run in flight sees them already consumed and takes
   * none — the same claim-by-writing the job poller uses.
   *
   * Released again if the model call fails, below. Claiming without releasing
   * would drain every signal on the first run while there are no LLM credits,
   * and they would be gone when credits arrive.
   */
  /**
   * Candidates first, ranked second. §206.
   *
   * Deliberately reads more than it needs — staleness is decided by the curve,
   * and a fixed SQL limit would truncate before the curve got a look. Sixty is
   * generous against a table that holds a few dozen live signals per product.
   */
  const { rows: candidates } = await ctx.pool.query<{
    id: string;
    source: string;
    relevance: string | null;
    observed_at: string;
    expires_at: string | null;
    confidence: string | null;
    velocity: string | null;
    platform: string | null;
  }>(
    `select id, source, relevance, coalesce(observed_at, created_at) as observed_at,
            expires_at, confidence, velocity, platform
       from signals
      where product_id = $1 and consumed_at is null
      order by coalesce(observed_at, created_at) desc
      limit 60`,
    [product.id],
  );

  const ranked = rankSignals(
    candidates.map((c) => ({
      id: c.id,
      source: c.source,
      relevance: c.relevance === null ? null : Number(c.relevance),
      observedAt: new Date(c.observed_at),
      expiresAt: c.expires_at ? new Date(c.expires_at) : null,
      confidence: c.confidence === null ? null : Number(c.confidence),
      velocity: c.velocity === null ? null : Number(c.velocity),
      platform: c.platform,
    })),
    new Date(),
    20,
  );

  const chosenSignalIds = ranked.map((r) => r.id);

  if (candidates.length > 0 && chosenSignalIds.length === 0) {
    /*
     * Every candidate had decayed. Worth saying out loud: it means discovery
     * has stopped supplying anything current, which reads identically to "no
     * signals" unless someone says so.
     */
    ctx.log('every unconsumed signal is stale', { productId: product.id, candidates: candidates.length });
    // Zero ideas proposed, and no model call — the same shape as "no signals".
    return 0;
  }

  const { rows: signals } = await ctx.pool.query<{
    id: string;
    source: string;
    summary: string;
  }>(
    /*
     * §206. Ranked by present worth, not by relevance alone.
     *
     * This ordered by `relevance desc, created_at desc`, and relevance being
     * the primary key of that sort meant a six-month-old trend at 0.9 beat
     * today's at 0.7 forever. The decay curve lives in
     * `discovery/freshness.ts` because a half-life per source is a judgement
     * about the world rather than a SQL expression, and it is the same function
     * the UI ranks with.
     *
     * So: read the candidates, rank them in code, consume the winners by id.
     * The `skip locked` claim is preserved — two workers still cannot take the
     * same signal — and the extra round trip buys one authoritative
     * implementation of staleness instead of two that drift.
     */
    `update signals set consumed_at = now()
      where product_id = $1
        and id = any($2::uuid[])
        and consumed_at is null
      returning id, source, summary`,
    [product.id, chosenSignalIds],
  );

  /**
   * No signal, no proposal — and no model call.
   *
   * `generate` runs daily per product, and the branch that reaches here is "no
   * proposed ideas", which is the *normal* state of an idle product. Proposing
   * from mix state alone would spend a strategy-model call on every empty run
   * forever, to reason about a content mix with no new observation behind it.
   * That is the cost shape §78 was written about.
   *
   * A signal is the evidence that something is worth writing about. Without
   * one, this returns having spent nothing, and the caller logs that it could
   * not propose — which is different from having proposed badly.
   */
  if (signals.length === 0) return 0;

  const { rows: recent } = await ctx.pool.query<{ title: string }>(
    `select title from ideas
      where product_id = $1 and created_at > now() - interval '60 days'
      order by created_at desc limit 60`,
    [product.id],
  );

  const { rows: voiceRows } = await ctx.pool.query<{
    description: string | null;
    mix_targets: Record<string, number>;
  }>(`select description, mix_targets from brand_voices where product_id = $1 limit 1`, [
    product.id,
  ]);

  const mix = await ctx.pool.query<{ category: string; share: string }>(
    'select * from content_mix_actual($1, $2, 21)',
    [product.id, 'brand'],
  );
  const mixActual = Object.fromEntries(mix.rows.map((r) => [r.category, Number(r.share)]));

  const release = async (): Promise<void> => {
    await ctx.pool.query(`update signals set consumed_at = null where id = any($1)`, [
      signals.map((s) => s.id),
    ]);
  };

  let result: Awaited<ReturnType<typeof proposeIdeas>>;
  try {
    result = await proposeIdeas(
    {
      productBrief: product.brief_summary ?? product.brief_markdown ?? product.name,
      voiceSummary: voiceRows[0]?.description ?? '',
      signals,
      recentTitles: recent.map((r) => r.title),
      /**
       * Empty until something has published and been scored. Stated rather than
       * faked: `performance_scores` is empty by design (nothing has published),
       * and inventing a "top performer" would put a fabricated claim into the
       * prompt that writes the next sixty days of content.
       */
      topPerformers: [],
      /**
       * The product's own targets, from `brand_voices.mix_targets` — the same
       * row `scoreIdeas` reads further down. A constant here would be a second
       * opinion about the content mix, and the prompt tells the model to weight
       * under-served pillars heavily, so a wrong one steers everything.
       */
      mixTargets: voiceRows[0]?.mix_targets ?? {},
      mixActual,
      seasonalWindow: [],
    },
      llm,
    );
  } catch (err) {
    /**
     * The call did not complete, so nothing was paid for and the evidence is
     * still worth using. Released rather than consumed — otherwise the first
     * run against a provider with no credits would silently drain every signal,
     * and they would be gone by the time credits arrived.
     */
    await release();
    throw err;
  }

  /**
   * Nothing to consume here — the signals were claimed at read time.
   *
   * Two failures are being defended against, and they want opposite things.
   * A **retry** must not resend the same evidence (§87), so consumption cannot
   * wait until after persistence. A **concurrent run** must not read the same
   * evidence, so it cannot wait until after the model call either. Claiming in
   * the select satisfies both, and the catch above releases the claim when the
   * call never completed — which is the only case where the evidence is still
   * worth having.
   *
   * If persistence fails from here the proposals are lost and the signals stay
   * consumed. That trade is deliberate: a question that genuinely matters
   * recurs and `collect_watch_terms` raises it again, which is what measuring
   * recurrence over thirty days is for. A spent credit does not come back.
   */
  for (const rejection of result.rejected) {
    ctx.log('idea proposal rejected', { title: rejection.title, reason: rejection.reason });
  }

  let written = 0;
  for (const proposal of result.proposals) {
    const inserted = await ctx.pool.query<{ id: string }>(
      `insert into ideas
         (product_id, title, angle, category, rationale, source_signals, status)
       values ($1, $2, $3, $4, $5, $6, 'proposed')
       on conflict do nothing
       returning id`,
      [
        product.id,
        proposal.title,
        proposal.angle,
        proposal.category,
        proposal.rationale || null,
        proposal.sourceSignalIds,
      ],
    );
    written += inserted.rows.length;
  }

  ctx.log('proposed ideas from signals', {
    productId: product.id,
    signals: signals.length,
    proposed: result.proposals.length,
    rejected: result.rejected.length,
    written,
    promptVersion: result.promptVersion,
  });

  return written;
}

/**
 * The origin published links are built from.
 *
 * `HALYARD_PUBLIC_URL` was read in exactly one place and defined in none — not
 * `.env.example`, not the deployment config, not the docs. So in production it
 * is unset, and the old `?? 'http://localhost:3200'` meant every generated item
 * carried a localhost link into a real post. Nothing downstream would have
 * caught it: no QC gate reads `link_url`.
 *
 * Failing the whole generation job is deliberate. The alternative — dropping
 * the link and publishing anyway — changes what goes out, and that is the
 * operator's call, not this handler's. A permanent failure names the variable,
 * stops before anything is drafted, and costs nothing.
 */
function publicBaseUrl(): string {
  const configured = publishableBaseUrl(process.env.HALYARD_PUBLIC_URL);
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new PermanentJobFailure(
      'HALYARD_PUBLIC_URL is not set to a publicly reachable URL. Published links are built ' +
        'from it, so generating now would attach a link no reader can open. Set it on the ' +
        'worker to the deployed web origin (for example https://halyard.example.com).',
      'HALYARD_PUBLIC_URL is unset or local, which no retry changes',
    );
  }
  return 'http://localhost:3200';
}

/**
 * The copywriter's DO NOT list: the brand voice's own rules, plus every rule
 * the operator accepted from a rejection cluster.
 *
 * `acceptCluster` writes those into `products.content_rules.operator_rules`
 * and, until this existed, nothing read them. Accepting a pattern moved a row's
 * status, wrote an audit entry, and changed no output — so the loop appeared to
 * close while the copywriter carried on making the same mistake.
 *
 * Merged rather than replaced, and de-duplicated because an operator can accept
 * a rule that a brand voice already states; the prompt is worse for saying the
 * same thing twice. Order is preserved with the voice first, which is the one
 * the operator wrote deliberately rather than accepted in passing.
 */
export function copywriterDontRules(
  voiceDontRules: string[],
  contentRules: { operator_rules?: string[] } | null | undefined,
): string[] {
  const merged = [...voiceDontRules, ...(contentRules?.operator_rules ?? [])];
  const seen = new Set<string>();
  return merged.filter((rule) => {
    const key = rule.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
