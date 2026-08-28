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
} from '@halyard/core';
import { carouselProps, transformationDiffProps } from '@halyard/render';
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
  fitWords,
  directVoice,
  planVariants,
  directCreative,
  type VisualLanguage,
  LANGUAGE_FOR_TREATMENT,
  renderTypography,
  selectTypography,
  aspectForRender,
  thumbnailFontSize,
  thumbnailTextFrom,
  defaultSubtypeFor,
  presentationFor,
  rankSignals,
  selectCreativePlan,
  type CreativeType,
  writeVoScript,
} from '@halyard/core';
import { chooseVideoComposition } from '@halyard/render/video-props';
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
    const value = content[key];
    if (typeof value === 'string' && value.trim()) out[key] = fitWords(value, spec);
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
  if (selected.length === 0) return;

  // ── Accounts to draft for ────────────────────────────────────────────────
  const accounts = await ctx.pool.query<{
    id: string;
    platform: SlopPlatform;
    persona: 'brand' | 'founder';
    supported_formats: string[];
  }>(
    `select id, platform, persona, supported_formats from social_accounts
      where product_id = $1 and capability_state in ('live','draft_only')`,
    [productId],
  );

  if (accounts.rows.length === 0) {
    ctx.log('no connected accounts, nothing to draft', { productId });
    return;
  }

  const connector = createConnector(product);

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
        const draft = await writeDraft(
          {
            platform: account.platform,
            format,
            category: idea.category,
            persona: account.persona,
            idea: { title: idea.title, angle: idea.angle },
            artifact,
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

        const inserted = await ctx.pool.query<{ id: string }>(
          `insert into content_items
             (product_id, idea_id, account_id, platform, persona, format, category,
              body, title, alt_text, hashtags, product_artifact, claims, qc_results,
              ai_components, status, generation_meta,
              destination_type, destination_url, destination_reason,
              board_id, board_reason,
              /* §215. The writing that did not fit the caption budget, and
                 where it belongs. Never discarded. */
              overflow_body, overflow_home)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_approval',$16,
                   $17,$18,$19,$20,$21,$22,$23)
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
],
        );

        const contentItemId = inserted.rows[0]!.id;

        // The published link points at Halyard's router, not at the destination,
        // so the device decision happens at click time and the click is counted.
        await ctx.pool.query('update content_items set link_url = $2 where id = $1', [
          contentItemId,
          routerUrlFor(publicBaseUrl(), contentItemId),
        ]);

        // Enqueue renders from the artifact, if it supports the template.
        if (artifact) {
          const props = transformationDiffProps(artifact);
          if (props && enabledTemplates.includes('transformation_diff_4x5')) {
            const render = await ctx.pool.query<{ id: string }>(
              `insert into renders (content_item_id, template_id, renderer, input_props, quality)
               values ($1, 'transformation_diff_4x5', 'satori', $2, 'final') returning id`,
              [contentItemId, { ...props, alt_text: draft.altText }],
            );
            await ctx.enqueue('render', { renderId: render.rows[0]!.id }, { priority: 50 });
          }

          if (account.platform === 'instagram' && enabledTemplates.includes('carousel_6')) {
            for (const slide of carouselProps(artifact)) {
              const render = await ctx.pool.query<{ id: string }>(
                `insert into renders (content_item_id, template_id, renderer, input_props, slide_index, quality)
                 values ($1, 'carousel_6', 'satori', $2, $3, 'final') returning id`,
                [contentItemId, slide, slide.index - 1],
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
          const renderAspect = aspectForRender(
            account.platform,
            defaultSubtypeFor(account.platform, format),
          );
          const composition = chooseVideoComposition(
            artifact,
            enabledTemplates,
            renderAspect,
          );
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
          const voice = directVoice({
            platform: account.platform,
            /*
             * The visual language is not decided yet — the treatment is chosen
             * after the copy exists, because the copy is part of what a
             * treatment is judged against. So the voice is directed from what
             * *is* known here: the platform and the runtime. Passing a
             * language that has not been chosen would be inventing an input.
             */
            targetSeconds: VO_TARGET_SECONDS,
          });

          const vo = await writeVoScript(
            {
              body: draft.body,
              artifact,
              targetSeconds: VO_TARGET_SECONDS,
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
                set vo_script = $2, audio_mode = 'founder_cloned',
                    ai_components = array_append(ai_components, 'voiceover')
              where id = $1`,
            [contentItemId, vo.script],
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

          const selection = artifact
            ? selectCreativePlan(artifact, {
                platform: account.platform,
                format,
                targetSeconds: VO_TARGET_SECONDS,
                recentTypes,
                insights: learned,
                ...(portfolio ? { portfolio } : {}),
                ...(footage ? { footage } : {}),
              })
            : null;
          const plan = selection?.chosen ?? null;

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
                  ...presentationFor(
                    account.platform,
                    defaultSubtypeFor(account.platform, format),
                  ),
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
                        presentationFor(account.platform, defaultSubtypeFor(account.platform, format)).mode,
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
          // Never queued. That is the point of the gates.
          ctx.log('draft rejected by QC, nothing queued', {
            platform: account.platform,
            idea: idea.id,
            attempts: err.attempts,
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
          ctx.log('account cannot take any format Halyard produces, skipping it', {
            platform: account.platform,
            idea: idea.id,
            reason: err.message,
          });
          continue;
        }
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
