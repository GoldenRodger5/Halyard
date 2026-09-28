import { expect, test } from '@playwright/test';
import { db } from './fixtures';

let itemId = '';
let recipeId = '';
let conceptId = '';

async function seedCalibrationCandidate(): Promise<void> {
  const account = await db().query<{ id: string }>(
    `select id from social_accounts
      where product_id='recipefix' and persona='brand' and platform='instagram'
      order by created_at limit 1`,
  );
  expect(account.rows[0]?.id).toBeTruthy();

  const concept = await db().query<{ id: string }>(
    `insert into concepts
       (product_id,title,premise,objective,status,origin_kind,origin_ref,family,
        why_care_before_product,quality_bar,production_requirements)
     values
       ('recipefix','E2E production calibration','Ingredient swaps can change the method.',
        'education','selected','manual','e2e-production-calibration','teach',
        'A useful cooking mistake is worth fixing before RecipeFix is mentioned.',
        '[]'::jsonb,'[]'::jsonb)
     returning id`,
  );
  conceptId = concept.rows[0]!.id;

  const brief = await db().query<{ id: string }>(
    `insert into creative_briefs
       (concept_id,product_id,account_id,platform,treatment,presentation_mode,
        format,visual_direction,audio_direction,caption_direction,
        production_requirements,quality_bar)
     values
       ($1,'recipefix',$2,'instagram','how_to','punch','video',
        '{"language":"creator_food"}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '[]'::jsonb,'[]'::jsonb)
     returning id`,
    [conceptId, account.rows[0]!.id],
  );

  const asset = await db().query<{ id: string }>(
    `insert into assets
       (product_id,kind,mime_type,storage_path,public_url,width,height,source)
     values
       ('recipefix','generated','video/mp4','e2e/calibration.mp4',
        null,1080,1920,'e2e')
     returning id`,
  );

  const item = await db().query<{ id: string }>(
    `insert into content_items
       (product_id,account_id,platform,persona,format,category,body,status,
        concept_id,brief_id,attached_asset_ids,generation_meta,qc_results)
     values
       ('recipefix',$1,'instagram','brand','video','education',
        'An ingredient swap can change the method, not just the ingredient list.',
        'pending_approval',$2,$3,array[$4::uuid],
        '{"production_v2":true,"production_media_required":true}'::jsonb,
        '{"passed":true,"gates":[{"gate":"visual","status":"passed","summary":"reviewed"},{"gate":"coherence","status":"passed","summary":"coherent"}]}'::jsonb)
     returning id`,
    [account.rows[0]!.id, conceptId, brief.rows[0]!.id, asset.rows[0]!.id],
  );
  itemId = item.rows[0]!.id;

  const variant = await db().query<{ id: string }>(
    `insert into platform_variants
       (concept_id,brief_id,content_item_id,platform,decision)
     values ($1,$2,$3,'instagram','produce') returning id`,
    [conceptId, brief.rows[0]!.id, itemId],
  );

  const recipe = await db().query<{ id: string }>(
    `insert into production_recipes
       (concept_id,brief_id,platform_variant_id,content_item_id,mode,status,
        requirements,steps,human_review_required)
     values
       ($1,$2,$3,$4,'calibration','review_required','[]'::jsonb,$5::jsonb,true)
     returning id`,
    [
      conceptId,
      brief.rows[0]!.id,
      variant.rows[0]!.id,
      itemId,
      JSON.stringify([
        {
          requirementId: 'broll',
          capability: 'generated_broll',
          provider: 'higgsfield',
          truthCritical: false,
          humanReviewRequired: true,
          reason: 'Calibration candidate.',
        },
        {
          requirementId: 'edit',
          capability: 'final_video_assembly',
          provider: 'halyard_render',
          truthCritical: false,
          humanReviewRequired: false,
          reason: 'Deterministic final assembly.',
        },
      ]),
    ],
  );
  recipeId = recipe.rows[0]!.id;
  await db().query(`update content_items set production_recipe_id=$2 where id=$1`, [itemId, recipeId]);
}

test.describe('production recipe calibration', () => {
  test.beforeEach(async () => {
    await seedCalibrationCandidate();
  });

  test.afterEach(async () => {
    if (itemId) {
      await db().query(`delete from production_provider_calibrations where source_recipe_id=$1`, [recipeId]);
      await db().query(`delete from content_items where id=$1`, [itemId]);
    }
    if (conceptId) await db().query(`delete from concepts where id=$1`, [conceptId]);
    itemId = '';
    recipeId = '';
    conceptId = '';
  });

  test('accepts only the reviewed generative provider/capability pair', async ({ page }) => {
    await page.goto(`/gallery/${itemId}`);

    await expect(page.getByText('Reuse this production recipe?')).toBeVisible();
    await expect(page.getByText(/generated_broll → higgsfield/i)).toBeVisible();
    await expect(page.getByText(/final_video_assembly → halyard_render/i)).toBeVisible();

    const accepted = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes(`/gallery/${itemId}`),
    );
    await page.getByRole('button', { name: 'Accept recipe for automation' }).click();
    await accepted;

    await expect(page.getByText('Production recipe accepted')).toBeVisible();

    const calibrations = await db().query<{
      provider: string;
      capability: string;
      status: string;
      source_recipe_id: string | null;
    }>(
      `select provider,capability,status,source_recipe_id
         from production_provider_calibrations
        where product_id='recipefix'
        order by provider,capability`,
    );
    expect(calibrations.rows).toEqual([
      {
        provider: 'higgsfield',
        capability: 'generated_broll',
        status: 'accepted',
        source_recipe_id: recipeId,
      },
    ]);

    const recipe = await db().query<{ status: string; human_review_required: boolean }>(
      `select status,human_review_required from production_recipes where id=$1`,
      [recipeId],
    );
    expect(recipe.rows[0]).toEqual({ status: 'accepted', human_review_required: false });
  });
});
