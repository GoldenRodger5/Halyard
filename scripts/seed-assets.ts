/**
 * Render real PNGs for the seeded content, so the queue shows actual artwork
 * rather than grey placeholders.
 *
 * A queue full of placeholders cannot be evaluated: the whole point of the
 * screen is that you approve the thing itself, not a description of it. This
 * makes the local environment honest about that.
 *
 *   DATABASE_URL=postgres://... pnpm exec tsx scripts/seed-assets.ts
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  carouselProps,
  chefNoteProps,
  renderTemplate,
  substitutionRatioProps,
  transformationDiffProps,
  type TemplateId,
} from '../packages/render/src/index.js';
import { toArtifact, type RecipeFixAdaptation } from '../packages/core/src/connectors/recipefix.js';
import fixture from '../packages/core/src/connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'apps/web/public/dev-assets');
const artifact = toArtifact(fixture as unknown as RecipeFixAdaptation);

interface Plan {
  /** Which content item to attach to, matched on platform + format. */
  platform: string;
  format: string;
  templateId: TemplateId;
  aspectRatio: string;
  props: () => Array<Record<string, unknown>>;
}

const PLANS: Plan[] = [
  {
    platform: 'instagram',
    format: 'carousel',
    templateId: 'carousel_6',
    aspectRatio: '4:5',
    props: () => carouselProps(artifact) as unknown as Array<Record<string, unknown>>,
  },
  {
    platform: 'pinterest',
    format: 'pin',
    templateId: 'pinterest_tall',
    aspectRatio: '2:3',
    props: () => [
      {
        title: 'Gluten-free sandwich loaf that holds its shape',
        subtitle: 'Vinegar in the dough, lower oven, longer bake.',
        bullets: [
          'Acid firms the protein network',
          'Drop the oven twenty five degrees',
          'Cool completely before slicing',
        ],
      },
    ],
  },
  {
    platform: 'x',
    format: 'image',
    templateId: 'transformation_diff_1x1',
    aspectRatio: '1:1',
    props: () => [transformationDiffProps(artifact) as unknown as Record<string, unknown>],
  },
  {
    platform: 'threads',
    format: 'image',
    templateId: 'chef_note_quote',
    aspectRatio: '1:1',
    props: () => [chefNoteProps(artifact) as unknown as Record<string, unknown>],
  },
  {
    platform: 'youtube',
    format: 'image',
    templateId: 'substitution_ratio',
    aspectRatio: '1:1',
    props: () => [substitutionRatioProps(artifact) as unknown as Record<string, unknown>],
  },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new pg.Pool({ connectionString });
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // Files and rows are cleared together. Clearing only the files leaves rows
  // pointing at 404s; clearing only the rows leaves orphaned PNGs. Doing both
  // makes this safe to run repeatedly.
  for (const file of readdirSync(PUBLIC_DIR)) {
    if (file.endsWith('.png')) rmSync(path.join(PUBLIC_DIR, file));
  }
  await pool.query(`delete from renders where output_asset_id in
                      (select id from assets where storage_path like 'dev-assets/%')`);
  await pool.query(`delete from assets where storage_path like 'dev-assets/%'`);
  await pool.query(`update content_items set render_ids = '{}'
                     where render_ids <> '{}'`);

  const brandRow = await pool.query<{ brand_tokens: Record<string, unknown>; name: string }>(
    'select brand_tokens, name from products order by created_at limit 1',
  );
  const brand = brandRow.rows[0];

  let rendered = 0;

  for (const plan of PLANS) {
    const items = await pool.query<{ id: string; alt_text: string | null }>(
      `select ci.id, ci.alt_text
         from content_items ci
        where ci.platform = $1 and ci.format = $2
          and not exists (select 1 from renders r where r.content_item_id = ci.id)`,
      [plan.platform, plan.format],
    );

    for (const item of items.rows) {
      const slides = plan.props().filter(Boolean);
      const renderIds: string[] = [];

      for (const [index, props] of slides.entries()) {
        const result = await renderTemplate({
          templateId: plan.templateId,
          props,
          brandTokens: brand?.brand_tokens ?? null,
          aspectRatio: plan.aspectRatio,
          wordmark: brand?.name?.toLowerCase(),
        });

        const fileName = `${plan.templateId}-${item.id.slice(0, 8)}-${index + 1}.png`;
        writeFileSync(path.join(PUBLIC_DIR, fileName), result.png);

        const asset = await pool.query<{ id: string }>(
          `insert into assets (product_id, kind, storage_path, mime_type, width, height,
                               bytes, caption, source, public_url)
           values ((select product_id from content_items where id = $1), 'generated', $2,
                   'image/png', $3, $4, $5, $6, 'render', $7)
           returning id`,
          [
            item.id,
            `dev-assets/${fileName}`,
            result.width,
            result.height,
            result.png.byteLength,
            item.alt_text,
            `/dev-assets/${fileName}`,
          ],
        );

        const render = await pool.query<{ id: string }>(
          `insert into renders (content_item_id, template_id, renderer, input_props,
                                output_asset_id, slide_index, quality, status, duration_ms)
           values ($1, $2, 'satori', $3, $4, $5, 'final', 'done', $6)
           returning id`,
          [item.id, plan.templateId, props, asset.rows[0]!.id, index, result.durationMs],
        );

        renderIds.push(render.rows[0]!.id);
        rendered++;
      }

      await pool.query('update content_items set render_ids = $2 where id = $1', [
        item.id,
        renderIds,
      ]);
    }
  }

  // One deliberately failed render, so the queue's failure state is reachable
  // in local development without waiting for a real failure.
  const failTarget = await pool.query<{ id: string }>(
    `select id from content_items where status = 'failed' limit 1`,
  );
  if (failTarget.rows[0]) {
    await pool.query(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality, status, error)
       values ($1, 'transformation_diff_4x5', 'satori', '{}'::jsonb, 'final', 'failed',
               'Template props failed validation: reason exceeded 220 characters')
       on conflict do nothing`,
      [failTarget.rows[0].id],
    );
  }

  await pool.end();
  console.log(`rendered ${rendered} assets into ${PUBLIC_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
