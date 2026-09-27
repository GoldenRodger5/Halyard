import type { Pool, PoolClient, QueryResultRow } from 'pg';

export type PgQueryable = Pick<Pool | PoolClient, 'query'>;

export interface CreativePackageRecordInput {
  productId: string;
  originKind: 'launch' | 'campaign' | 'daily' | 'manual' | 'opportunity' | 'experiment';
  originRef: string;
  family: string;
  objective: string;
  title: string;
  premise: string;
  hook?: string | null;
  audience?: string | null;
  audienceProblem?: string | null;
  audienceAwareness?: string | null;
  whyCareBeforeProduct?: string | null;
  payoff?: string | null;
  emotionalAngle?: string | null;
  storyStructure?: unknown;
  visualTreatment?: unknown;
  audioDirection?: unknown;
  ctaDirection?: unknown;
  experiment?: unknown;
  qualityBar?: unknown[];
  productionRequirements?: unknown[];
  platformIntent?: string[];
  differentiation?: string | null;
  evidenceRequirements?: unknown[];
  retentionStrategy?: string | null;
  status?: 'proposed' | 'selected' | 'rejected' | 'used' | 'expired';
}

export interface CreativeBriefRecordInput {
  conceptId: string;
  productId: string;
  accountId: string;
  platform: string;
  treatment: string;
  presentationMode?: 'editorial' | 'punch';
  targetSeconds?: number | null;
  aspectRatio?: string | null;
  beats?: unknown[];
  visualDirection?: unknown;
  audioDirection?: unknown;
  captionDirection?: unknown;
  evidence?: string[];
  rationale?: string | null;
  format?: string | null;
  subtype?: string | null;
  hook?: string | null;
  captionBrief?: string | null;
  titleBrief?: string | null;
  productionRequirements?: unknown[];
  qualityBar?: unknown[];
}

export interface PlatformVariantRecordInput {
  conceptId: string;
  briefId: string;
  contentItemId?: string | null;
  platform: string;
  aspectRatio?: string | null;
  targetSeconds?: number | null;
  pacing?: string | null;
  textDensity?: string | null;
  hookTreatment?: string | null;
  cta?: string | null;
  audioTreatment?: string | null;
  decision?: 'original' | 'remix' | 'reuse' | 'skip' | 'produce' | 'defer';
  decisionReason?: string | null;
}

export interface ProductionRecipeRecordInput {
  conceptId: string;
  briefId: string;
  platformVariantId?: string | null;
  contentItemId?: string | null;
  mode: 'calibration' | 'production';
  revision?: number;
  status?: 'planned' | 'producing' | 'review_required' | 'accepted' | 'rejected' | 'failed' | 'obsolete';
  requirements: unknown[];
  steps: unknown[];
  refusals?: unknown[];
  reasons?: unknown[];
  humanReviewRequired: boolean;
  estimatedCostUsd?: number | null;
  costCapUsd?: number | null;
  providerVersions?: Record<string, unknown>;
}

function jsonParam(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function one<T extends QueryResultRow>(
  db: PgQueryable,
  sql: string,
  params: unknown[],
): Promise<T> {
  const result = await db.query<T>(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error('Creative package persistence expected a row and got none.');
  return row;
}

/** Stable package identity: (product, origin, originRef). */
export async function upsertCreativePackageRecord(
  db: PgQueryable,
  input: CreativePackageRecordInput,
): Promise<{ id: string }> {
  return one<{ id: string }>(
    db,
    `insert into concepts
       (product_id, origin_kind, origin_ref, package_version, family, objective,
        title, premise, hook, audience, audience_problem, audience_awareness,
        why_care_before_product, payoff, emotional_angle, story_structure,
        visual_treatment, audio_direction, cta_direction, experiment, quality_bar,
        production_requirements, platform_intent, differentiation,
        evidence_requirements, retention_strategy, status, selected_at)
     values
       ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,case when $26='selected' then now() else null end)
     on conflict (product_id, origin_kind, origin_ref)
       where origin_kind is not null and origin_ref is not null
     do update set
       family = excluded.family,
       objective = excluded.objective,
       title = excluded.title,
       premise = excluded.premise,
       audience = excluded.audience,
       audience_problem = excluded.audience_problem,
       audience_awareness = excluded.audience_awareness,
       why_care_before_product = excluded.why_care_before_product,
       payoff = excluded.payoff,
       emotional_angle = excluded.emotional_angle,
       story_structure = excluded.story_structure,
       visual_treatment = excluded.visual_treatment,
       audio_direction = excluded.audio_direction,
       cta_direction = excluded.cta_direction,
       experiment = excluded.experiment,
       quality_bar = excluded.quality_bar,
       production_requirements = excluded.production_requirements,
       platform_intent = excluded.platform_intent,
       differentiation = excluded.differentiation,
       evidence_requirements = excluded.evidence_requirements,
       retention_strategy = excluded.retention_strategy,
       status = excluded.status,
       selected_at = case when excluded.status='selected' then coalesce(concepts.selected_at, now()) else concepts.selected_at end,
       updated_at = now()
     returning id`,
    [
      input.productId,
      input.originKind,
      input.originRef,
      input.family,
      input.objective,
      input.title,
      input.premise,
      input.hook ?? null,
      input.audience ?? null,
      input.audienceProblem ?? null,
      input.audienceAwareness ?? null,
      input.whyCareBeforeProduct ?? null,
      input.payoff ?? null,
      input.emotionalAngle ?? null,
      jsonParam(input.storyStructure ?? {}),
      jsonParam(input.visualTreatment ?? {}),
      jsonParam(input.audioDirection ?? {}),
      jsonParam(input.ctaDirection ?? {}),
      jsonParam(input.experiment ?? {}),
      jsonParam(input.qualityBar ?? []),
      jsonParam(input.productionRequirements ?? []),
      input.platformIntent ?? [],
      input.differentiation ?? null,
      jsonParam(input.evidenceRequirements ?? []),
      input.retentionStrategy ?? null,
      input.status ?? 'selected',
    ],
  );
}

/** One brief per package + social identity + platform. */
export async function upsertCreativeBriefRecord(
  db: PgQueryable,
  input: CreativeBriefRecordInput,
): Promise<{ id: string }> {
  return one<{ id: string }>(
    db,
    `insert into creative_briefs
       (concept_id, product_id, account_id, platform, treatment, presentation_mode,
        target_seconds, aspect_ratio, beats, visual_direction, audio_direction,
        caption_direction, evidence, rationale, format, subtype, hook,
        caption_brief, title_brief, production_requirements, quality_bar)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     on conflict (concept_id, account_id, platform)
       where account_id is not null
     do update set
       treatment = excluded.treatment,
       presentation_mode = excluded.presentation_mode,
       target_seconds = excluded.target_seconds,
       aspect_ratio = excluded.aspect_ratio,
       beats = excluded.beats,
       visual_direction = excluded.visual_direction,
       audio_direction = excluded.audio_direction,
       caption_direction = excluded.caption_direction,
       evidence = excluded.evidence,
       rationale = excluded.rationale,
       format = excluded.format,
       subtype = excluded.subtype,
       hook = coalesce(excluded.hook, creative_briefs.hook),
       caption_brief = excluded.caption_brief,
       title_brief = excluded.title_brief,
       production_requirements = excluded.production_requirements,
       quality_bar = excluded.quality_bar
     returning id`,
    [
      input.conceptId,
      input.productId,
      input.accountId,
      input.platform,
      input.treatment,
      input.presentationMode ?? 'punch',
      input.targetSeconds ?? null,
      input.aspectRatio ?? null,
      jsonParam(input.beats ?? []),
      jsonParam(input.visualDirection ?? {}),
      jsonParam(input.audioDirection ?? {}),
      jsonParam(input.captionDirection ?? {}),
      input.evidence ?? [],
      input.rationale ?? null,
      input.format ?? null,
      input.subtype ?? null,
      input.hook ?? null,
      input.captionBrief ?? null,
      input.titleBrief ?? null,
      jsonParam(input.productionRequirements ?? []),
      jsonParam(input.qualityBar ?? []),
    ],
  );
}

export async function upsertPlatformVariantRecord(
  db: PgQueryable,
  input: PlatformVariantRecordInput,
): Promise<{ id: string }> {
  return one<{ id: string }>(
    db,
    `insert into platform_variants
       (concept_id, brief_id, content_item_id, platform, aspect_ratio, target_seconds,
        pacing, text_density, hook_treatment, cta, audio_treatment, decision, decision_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (brief_id, platform) where brief_id is not null
     do update set
       concept_id = excluded.concept_id,
       content_item_id = excluded.content_item_id,
       aspect_ratio = excluded.aspect_ratio,
       target_seconds = excluded.target_seconds,
       pacing = excluded.pacing,
       text_density = excluded.text_density,
       hook_treatment = excluded.hook_treatment,
       cta = excluded.cta,
       audio_treatment = excluded.audio_treatment,
       decision = excluded.decision,
       decision_reason = excluded.decision_reason,
       updated_at = now()
     returning id`,
    [
      input.conceptId,
      input.briefId,
      input.contentItemId ?? null,
      input.platform,
      input.aspectRatio ?? null,
      input.targetSeconds ?? null,
      input.pacing ?? null,
      input.textDensity ?? null,
      input.hookTreatment ?? null,
      input.cta ?? null,
      input.audioTreatment ?? null,
      input.decision ?? 'produce',
      input.decisionReason ?? null,
    ],
  );
}

export async function insertProductionRecipeRecord(
  db: PgQueryable,
  input: ProductionRecipeRecordInput,
): Promise<{ id: string }> {
  return one<{ id: string }>(
    db,
    `insert into production_recipes
       (concept_id, brief_id, platform_variant_id, content_item_id, mode, revision,
        status, requirements, steps, refusals, reasons, human_review_required,
        estimated_cost_usd, cost_cap_usd, provider_versions)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (platform_variant_id, revision) where platform_variant_id is not null
     do update set
       content_item_id = excluded.content_item_id,
       status = excluded.status,
       requirements = excluded.requirements,
       steps = excluded.steps,
       refusals = excluded.refusals,
       reasons = excluded.reasons,
       human_review_required = excluded.human_review_required,
       estimated_cost_usd = excluded.estimated_cost_usd,
       cost_cap_usd = excluded.cost_cap_usd,
       provider_versions = excluded.provider_versions,
       updated_at = now()
     returning id`,
    [
      input.conceptId,
      input.briefId,
      input.platformVariantId ?? null,
      input.contentItemId ?? null,
      input.mode,
      input.revision ?? 1,
      input.status ?? 'planned',
      jsonParam(input.requirements),
      jsonParam(input.steps),
      jsonParam(input.refusals ?? []),
      jsonParam(input.reasons ?? []),
      input.humanReviewRequired,
      input.estimatedCostUsd ?? null,
      input.costCapUsd ?? null,
      jsonParam(input.providerVersions ?? {}),
    ],
  );
}

export interface StageCreativeContentInput {
  productId: string;
  campaignId?: string | null;
  accountId: string;
  platform: string;
  persona: 'brand' | 'founder';
  format: string;
  category: string;
  scheduledAt?: Date | string | null;
  generationMeta?: Record<string, unknown>;
}

export interface StageCreativeVariantInput {
  package: CreativePackageRecordInput;
  brief: Omit<CreativeBriefRecordInput, 'conceptId'>;
  content: StageCreativeContentInput;
  variant: Omit<PlatformVariantRecordInput, 'conceptId' | 'briefId' | 'contentItemId' | 'platform'>;
  recipe: Omit<
    ProductionRecipeRecordInput,
    'conceptId' | 'briefId' | 'platformVariantId' | 'contentItemId' | 'revision'
  >;
}

export interface StagedCreativeVariantIds {
  conceptId: string;
  briefId: string;
  contentItemId: string;
  platformVariantId: string;
  productionRecipeId: string;
  productionRecipeRevision: number;
}

/**
 * Persist one concrete platform execution of a CreativePackage atomically.
 *
 * This is the shared staging boundary for Launch, Campaigns and future entry
 * points. If any row fails, none of the creative lineage survives as a partial
 * package that later readers mistake for buildable work.
 */
export async function stageCreativeVariantRecord(
  db: Pool,
  input: StageCreativeVariantInput,
): Promise<StagedCreativeVariantIds> {
  const client = await db.connect();
  try {
    await client.query('begin');

    const concept = await upsertCreativePackageRecord(client, input.package);
    const brief = await upsertCreativeBriefRecord(client, {
      ...input.brief,
      conceptId: concept.id,
    });

    const content = await one<{ id: string }>(
      client,
      `insert into content_items
         (product_id, campaign_id, account_id, platform, persona, format, category,
          body, status, scheduled_at, generation_meta, concept_id, brief_id)
       values ($1,$2,$3,$4,$5,$6,$7,'','draft',$8,$9::jsonb,$10,$11)
       returning id`,
      [
        input.content.productId,
        input.content.campaignId ?? null,
        input.content.accountId,
        input.content.platform,
        input.content.persona,
        input.content.format,
        input.content.category,
        input.content.scheduledAt ?? null,
        jsonParam(input.content.generationMeta ?? {}),
        concept.id,
        brief.id,
      ],
    );

    const variant = await upsertPlatformVariantRecord(client, {
      ...input.variant,
      conceptId: concept.id,
      briefId: brief.id,
      contentItemId: content.id,
      platform: input.content.platform,
    });

    await client.query(
      `update production_recipes
          set status = 'obsolete', updated_at = now()
        where brief_id = $1 and status = 'planned'`,
      [brief.id],
    );
    const revision = await one<{ revision: number }>(
      client,
      `select coalesce(max(revision), 0)::int + 1 as revision
         from production_recipes where brief_id = $1`,
      [brief.id],
    );
    const recipe = await insertProductionRecipeRecord(client, {
      ...input.recipe,
      conceptId: concept.id,
      briefId: brief.id,
      platformVariantId: variant.id,
      contentItemId: content.id,
      revision: revision.revision,
    });

    await client.query(
      `update content_items set production_recipe_id = $2 where id = $1`,
      [content.id, recipe.id],
    );

    await client.query('commit');
    return {
      conceptId: concept.id,
      briefId: brief.id,
      contentItemId: content.id,
      platformVariantId: variant.id,
      productionRecipeId: recipe.id,
      productionRecipeRevision: revision.revision,
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface AcceptedProductionCalibration {
  provider: string;
  capability: string;
  recipeKey: string;
  sourceRecipeId: string | null;
}

export async function acceptedProductionCalibrations(
  db: PgQueryable,
  productId: string,
): Promise<AcceptedProductionCalibration[]> {
  const result = await db.query<{
    provider: string;
    capability: string;
    recipe_key: string;
    source_recipe_id: string | null;
  }>(
    `select provider, capability, recipe_key, source_recipe_id
       from production_provider_calibrations
      where product_id=$1 and status='accepted'
      order by provider, capability, recipe_key`,
    [productId],
  );
  return result.rows.map((row) => ({
    provider: row.provider,
    capability: row.capability,
    recipeKey: row.recipe_key,
    sourceRecipeId: row.source_recipe_id,
  }));
}

export async function acceptProductionCalibration(
  db: PgQueryable,
  input: {
    productId: string;
    provider: string;
    capability: string;
    recipeKey?: string;
    sourceRecipeId: string;
    notes?: string | null;
  },
): Promise<{ id: string }> {
  return one<{ id: string }>(
    db,
    `insert into production_provider_calibrations
       (product_id, provider, capability, recipe_key, status, source_recipe_id, notes, accepted_at)
     values ($1,$2,$3,$4,'accepted',$5,$6,now())
     on conflict (product_id, provider, capability, recipe_key)
     do update set
       status='accepted',
       source_recipe_id=excluded.source_recipe_id,
       notes=excluded.notes,
       accepted_at=now(),
       updated_at=now()
     returning id`,
    [
      input.productId,
      input.provider,
      input.capability,
      input.recipeKey ?? 'default',
      input.sourceRecipeId,
      input.notes ?? null,
    ],
  );
}

export async function rejectProductionCalibration(
  db: PgQueryable,
  input: {
    productId: string;
    provider: string;
    capability: string;
    recipeKey?: string;
    sourceRecipeId: string;
    notes?: string | null;
  },
): Promise<{ id: string }> {
  return one<{ id: string }>(
    db,
    `insert into production_provider_calibrations
       (product_id, provider, capability, recipe_key, status, source_recipe_id, notes, accepted_at)
     values ($1,$2,$3,$4,'rejected',$5,$6,null)
     on conflict (product_id, provider, capability, recipe_key)
     do update set
       status='rejected',
       source_recipe_id=excluded.source_recipe_id,
       notes=excluded.notes,
       accepted_at=null,
       updated_at=now()
     returning id`,
    [
      input.productId,
      input.provider,
      input.capability,
      input.recipeKey ?? 'default',
      input.sourceRecipeId,
      input.notes ?? null,
    ],
  );
}
