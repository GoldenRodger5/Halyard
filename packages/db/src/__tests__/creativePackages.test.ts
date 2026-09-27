import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';
import {
  acceptProductionCalibration,
  acceptedProductionCalibrations,
  rejectProductionCalibration,
  stageCreativeVariantRecord,
} from '../creativePackages.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;
let pool: pg.Pool;
let accountId = '';

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('creative_pkg', 4);
  await pool.query(
    `insert into products (id,name,connector_type) values ('pkgtest','Package Test','none')`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts
       (product_id,platform,persona,handle,capability_state,provider_account_id)
     values ('pkgtest','instagram','brand','@pkgtest','draft_only','provider-pkgtest')
     returning id`,
  );
  accountId = rows[0]!.id;
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

function input(account = accountId) {
  return {
    package: {
      productId: 'pkgtest',
      originKind: 'launch' as const,
      originRef: '2026-09-28:teach:0',
      family: 'teach',
      objective: 'education',
      title: 'Why the obvious swap fails',
      premise: 'A substitution changes method as well as ingredients.',
      whyCareBeforeProduct: 'A bad substitution wastes dinner.',
      payoff: 'Understand the mechanism before seeing the product.',
      qualityBar: [{ id: 'truth', severity: 'hard', description: 'No fake proof.' }],
      productionRequirements: [{ id: 'static', capability: 'branded_static', required: true }],
      platformIntent: ['instagram'],
      status: 'selected' as const,
    },
    brief: {
      productId: 'pkgtest',
      accountId: account,
      platform: 'instagram',
      treatment: 'how_to',
      presentationMode: 'editorial' as const,
      aspectRatio: '4:5',
      format: 'image',
      captionBrief: 'Teach the mechanism without turning the post into an ad.',
      productionRequirements: [{ id: 'static', capability: 'branded_static', required: true }],
      qualityBar: [{ id: 'asset', severity: 'hard', description: 'Review actual media.' }],
    },
    content: {
      productId: 'pkgtest',
      accountId: account,
      platform: 'instagram',
      persona: 'brand' as const,
      format: 'image',
      category: 'education',
      generationMeta: { source: 'test', production_v2: true, production_media_required: true },
    },
    variant: {
      aspectRatio: '4:5',
      pacing: 'measured',
      textDensity: 'medium',
      hookTreatment: 'native_open',
      cta: 'none',
      audioTreatment: 'none',
      decision: 'produce' as const,
      decisionReason: 'Native Instagram educational execution.',
    },
    recipe: {
      mode: 'calibration' as const,
      status: 'planned' as const,
      requirements: [{ id: 'static', capability: 'branded_static', required: true }],
      steps: [{ requirementId: 'static', capability: 'branded_static', provider: 'halyard_render' }],
      refusals: [],
      reasons: ['test'],
      humanReviewRequired: true,
    },
  };
}

d('stageCreativeVariantRecord', () => {
  it('writes one complete lineage in one transaction', async () => {
    const ids = await stageCreativeVariantRecord(pool, input());
    const { rows } = await pool.query<{
      concept_id: string | null;
      brief_id: string | null;
      production_recipe_id: string | null;
      variant_id: string | null;
    }>(
      `select ci.concept_id, ci.brief_id, ci.production_recipe_id, pv.id as variant_id
         from content_items ci
         left join platform_variants pv on pv.content_item_id=ci.id
        where ci.id=$1`,
      [ids.contentItemId],
    );
    expect(rows[0]).toMatchObject({
      concept_id: ids.conceptId,
      brief_id: ids.briefId,
      production_recipe_id: ids.productionRecipeId,
      variant_id: ids.platformVariantId,
    });
  });

  it('rolls the entire creative lineage back when the concrete item cannot be staged', async () => {
    const before = await pool.query<{ n: string }>(
      `select count(*)::text as n from concepts where product_id='pkgtest' and origin_ref='rollback-case'`,
    );
    const bad = input('00000000-0000-0000-0000-000000000000');
    bad.package.originRef = 'rollback-case';
    await expect(stageCreativeVariantRecord(pool, bad)).rejects.toThrow();

    const after = await pool.query<{ concepts: string; briefs: string; recipes: string }>(
      `select
         (select count(*) from concepts where product_id='pkgtest' and origin_ref='rollback-case')::text as concepts,
         (select count(*) from creative_briefs b join concepts c on c.id=b.concept_id where c.product_id='pkgtest' and c.origin_ref='rollback-case')::text as briefs,
         (select count(*) from production_recipes pr join concepts c on c.id=pr.concept_id where c.product_id='pkgtest' and c.origin_ref='rollback-case')::text as recipes`,
    );
    expect(Number(before.rows[0]!.n)).toBe(0);
    expect(after.rows[0]).toEqual({ concepts: '0', briefs: '0', recipes: '0' });
  });
});


d('production provider calibrations', () => {
  it('accepts and reads one capability without unlocking another', async () => {
    const ids = await stageCreativeVariantRecord(pool, input());
    await acceptProductionCalibration(pool, {
      productId: 'pkgtest',
      provider: 'higgsfield',
      capability: 'generated_broll',
      sourceRecipeId: ids.productionRecipeId,
      notes: 'Human reviewed the actual asset.',
    });
    const accepted = await acceptedProductionCalibrations(pool, 'pkgtest');
    expect(accepted).toEqual([
      expect.objectContaining({
        provider: 'higgsfield',
        capability: 'generated_broll',
        recipeKey: 'default',
        sourceRecipeId: ids.productionRecipeId,
      }),
    ]);
    expect(accepted.some((row) => row.capability === 'generated_presenter')).toBe(false);
  });

  it('a rejection removes the capability from the accepted routing set', async () => {
    const ids = await stageCreativeVariantRecord(pool, {
      ...input(),
      package: { ...input().package, originRef: 'calibration-reject-case' },
    });
    await acceptProductionCalibration(pool, {
      productId: 'pkgtest',
      provider: 'higgsfield',
      capability: 'generated_broll',
      sourceRecipeId: ids.productionRecipeId,
    });
    await rejectProductionCalibration(pool, {
      productId: 'pkgtest',
      provider: 'higgsfield',
      capability: 'generated_broll',
      sourceRecipeId: ids.productionRecipeId,
      notes: 'The finished result looked synthetic.',
    });
    expect(await acceptedProductionCalibrations(pool, 'pkgtest')).toEqual([]);
  });
});
