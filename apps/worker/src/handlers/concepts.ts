/**
 * Propose several creative directions, score them, and keep the batch. §218.
 *
 * Between "there is an idea worth making" and "write the post" there was
 * nothing. `generate` took an idea and produced one draft, so the account got
 * whichever direction the copywriter happened to take — and nobody, human or
 * otherwise, ever saw the alternatives.
 *
 * This is the missing stage. It generates a batch, scores it against what the
 * account can actually build and what its results have established, and stores
 * the whole batch rather than only the winner: "chosen over three others" is
 * only meaningful if the others are still there to look at.
 *
 * ## Autonomy and operator control, together
 *
 * The pipeline stays autonomous — `generate` takes the highest-scoring
 * buildable concept when nobody has chosen. An operator who *does* choose in
 * the Studio marks one `selected`, and that wins. Neither mode blocks the
 * other, and the default is explainable rather than arbitrary.
 */
import {
  analysePortfolio,
  conceptDiversity,
  generateConcepts,
  scoreConcepts,
  type Concept,
  type ConceptCapabilities,
  type ConceptObjective,
  type Insight,
  createLlmClient,
  type PortfolioItem,
} from '@halyard/core';
import type { JobHandler } from '../poller.js';
import { recordingClient } from '../agentRuns.js';

/** How many directions to ask for. The scorer discards most. */
const BATCH_SIZE = 4;

export const generateConceptsHandler: JobHandler = async (job, ctx) => {
  const productId = String(job.payload.productId ?? '');
  const ideaId = (job.payload.ideaId as string | undefined) ?? null;
  const intentOverride = (job.payload.intent as string | undefined) ?? null;
  if (!productId) throw new Error('generate_concepts needs a productId');

  const product = (
    await ctx.pool.query<{ id: string; name: string; brief_summary: string | null }>(
      'select id, name, brief_summary from products where id = $1',
      [productId],
    )
  ).rows[0];
  if (!product) return;

  /* The subject. An idea if there is one, otherwise what the operator asked. */
  const idea = ideaId
    ? (
        await ctx.pool.query<{ id: string; title: string; angle: string }>(
          'select id, title, angle from ideas where id = $1',
          [ideaId],
        )
      ).rows[0]
    : undefined;

  const intent = intentOverride ?? (idea ? `${idea.title}. ${idea.angle}` : null);
  if (!intent) {
    ctx.log('no subject to build concepts from', { productId });
    return;
  }

  /* ── What the account can actually build ──────────────────────────────── */

  const capture = await ctx.pool.query<{ n: string }>(
    `select count(*)::text as n from capture_runs
      where product_id = $1 and ok = true and video_asset_id is not null
        and started_at > now() - interval '30 days'`,
    [productId],
  );
  const facts = await ctx.pool.query<{ value: string; detail: string | null }>(
    `select value, detail from product_facts
      where product_id = $1 and status = 'verified' and superseded_by is null
      order by confidence desc nulls last limit 12`,
    [productId],
  );
  const ownedImagery = await ctx.pool.query<{ n: string }>(
    `select count(*)::text as n from assets
      where kind in ('generated','screenshot') and archived_at is null`,
  );
  const measured = await ctx.pool.query<{ n: string }>(
    'select count(*)::text as n from performance_scores where low_confidence is not true',
  );

  const capabilities: ConceptCapabilities = {
    hasProductCapture: Number(capture.rows[0]!.n) > 0,
    verifiedFactCount: facts.rowCount ?? 0,
    hasOwnedImagery: Number(ownedImagery.rows[0]!.n) > 0,
    hasMeasuredHistory: Number(measured.rows[0]!.n) > 0,
  };

  const accounts = await ctx.pool.query<{ id: string; platform: string }>(
    `select id, platform from social_accounts
      where product_id = $1 and capability_state in ('live','draft_only')`,
    [productId],
  );

  const recent = await ctx.pool.query<{ type: string }>(
    `select generation_meta -> 'creative' ->> 'type' as type
       from content_items
      where product_id = $1 and generation_meta -> 'creative' ->> 'type' is not null
      order by created_at desc limit 6`,
    [productId],
  );
  const recentTreatments = recent.rows.map((r) => r.type);

  /* ── Generate ─────────────────────────────────────────────────────────── */

  const batch = await generateConcepts(
    {
      intent,
      productName: product.name,
      productBrief: product.brief_summary ?? product.name,
      verifiedFacts: facts.rows.map((f) => (f.detail ? `${f.value} — ${f.detail}` : f.value)),
      platforms: accounts.rows.map((a) => a.platform),
      recentTreatments,
      hasProductCapture: capabilities.hasProductCapture,
      count: BATCH_SIZE,
    },
    /*
     * Recorded through the same seam every other agent uses, so a concept
     * batch shows up in `agent_runs` with its cost beside the four that
     * already do.
     */
    recordingClient(ctx.pool, createLlmClient(), { trigger: 'job', triggerRef: job.id }),
  );

  if (batch.concepts.length === 0) {
    ctx.log('no usable concepts returned', { productId, malformed: batch.malformed });
    return;
  }

  /* ── Score against what this account is and has done ──────────────────── */

  const strategy = await ctx.pool.query<{ objective: string }>(
    `select objective from strategy_decisions
      where product_id = $1 order by created_at desc limit 1`,
    [productId],
  );

  const published = await ctx.pool.query<{
    id: string;
    published_at: string;
    platform: string;
    treatment: string | null;
  }>(
    `select id, published_at, platform,
            generation_meta -> 'creative' ->> 'type' as treatment
       from content_items
      where product_id = $1 and status = 'published' and published_at is not null
      order by published_at desc limit 20`,
    [productId],
  );
  const portfolioItems: PortfolioItem[] = published.rows.map((r) => ({
    contentItemId: r.id,
    publishedAt: new Date(r.published_at),
    platform: r.platform,
    dimensions: { treatment: r.treatment },
  }));

  const insightRows = await ctx.pool.query(
    `select scope, platform, account_id, feature, feature_value, cohort_mean, baseline_mean,
            lift, sample_size, baseline_size, status, confidence, corroborations,
            supporting_content_ids, contradicting_content_ids,
            evidence_window_start, evidence_window_end, observation, recommendation, review_after
       from learned_insights where feature = 'creative_type'`,
  );
  const insights: Insight[] = insightRows.rows.map((r) => ({
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
  }));

  const scored = scoreConcepts({
    concepts: batch.concepts,
    capabilities,
    objective: (strategy.rows[0]?.objective as ConceptObjective) ?? null,
    portfolio: analysePortfolio(portfolioItems),
    insights,
    recentTreatments,
  });

  const diversity = conceptDiversity(batch.concepts);

  /* ── Persist the whole batch, not only the winner ─────────────────────── */

  const batchId = crypto.randomUUID();
  let stored = 0;

  for (const entry of scored) {
    const c: Concept = entry.concept;
    await ctx.pool.query(
      `insert into concepts
         (product_id, idea_id, title, premise, hook, audience, objective, emotional_angle,
          story_structure, visual_treatment, audio_direction, platform_intent,
          differentiation, evidence_requirements, retention_strategy,
          score, score_breakdown, status, batch_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15,
               $16,$17::jsonb,$18,$19)`,
      [
        productId,
        ideaId,
        c.title,
        c.premise,
        c.hook,
        c.audience,
        c.objective,
        c.emotionalAngle,
        JSON.stringify({ treatment: c.treatment }),
        JSON.stringify({}),
        JSON.stringify({}),
        c.platformIntent,
        c.differentiation,
        JSON.stringify(c.evidenceRequirements),
        c.retentionStrategy,
        entry.score,
        JSON.stringify({ ...entry.breakdown, buildable: entry.buildable, reason: entry.reason }),
        /* Unbuildable concepts are kept and marked, not discarded: "this needs
           a capture you do not have" is often the most useful row in the batch. */
        entry.buildable ? 'proposed' : 'rejected',
        batchId,
      ],
    );
    stored += 1;
  }

  ctx.log('concepts proposed', {
    productId,
    batchId,
    stored,
    buildable: scored.filter((s) => s.buildable).length,
    malformed: batch.malformed,
    /* Recorded because a batch that is not diverse is a batch that wasted a
       model call, and that should be visible rather than inferred. */
    diverse: diversity.diverse,
    treatments: diversity.distinctTreatments,
    premiseOverlap: diversity.meanPremiseOverlap,
    topScore: scored[0]?.score,
    costUsd: batch.costUsd,
  });
};
