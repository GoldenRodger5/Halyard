/**
 * §336. Write a screenplay for a product and print it as a script.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/write-screenplay.ts kinolog quiz "..."
 *
 * Reads the product's Brain and brand, writes the screenplay, checks it against
 * what the machinery can execute, and prints it in the form a person reviews.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  CHANNEL_CATALOG,
  POST_FORMAT_CATALOG,
  checkScreenplay,
  createLlmClient,
  fitScreenplay,
  printScreenplay,
  writeScreenplay,
  type PostFormatId,
} from '../packages/core/src/index.js';
import { motifFor } from '../packages/render/src/video/motif.js';
import { resolveBrand } from '../packages/render/src/brand.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const at = line.indexOf('=');
  if (at <= 0 || line.trimStart().startsWith('#')) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim();
}
/*
 * Production runs on OpenAI (agent_runs records gpt-5.5), so a local preview
 * uses the same provider — a screenplay judged against a different model than
 * the one that will write it is a preview of something else.
 *
 * An argument rather than an environment variable: `envDocumented.test.ts`
 * requires every variable shipped code reads to appear in `.env.example`, and
 * naming a preview switch there would imply a deployment needs it set.
 */
if (process.argv.includes('--openai')) {
  delete process.env.ANTHROPIC_API_KEY;
}

async function main(): Promise<void> {
  const productId = process.argv[2] ?? 'kinolog';
  const formatId = (process.argv[3] ?? 'quiz') as PostFormatId;
  const subject = process.argv[4] ?? '';

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: products } = await pool.query<{
    name: string;
    brand_tokens: Record<string, unknown> | null;
  }>('select name, brand_tokens from products where id = $1', [productId]);
  const product = products[0];
  if (!product) throw new Error(`no product ${productId}`);

  const { rows: facts } = await pool.query<{ category: string; key: string; value: string }>(
    `select category, key, value from product_facts
      where product_id = $1 and superseded_by is null
      order by confidence desc limit 40`,
    [productId],
  );
  await pool.end();

  const format = POST_FORMAT_CATALOG[formatId];
  const channel = CHANNEL_CATALOG[format.channels[0]!];
  const motif = motifFor(resolveBrand(product.brand_tokens));

  console.log(`# ${product.name} · ${formatId}`);
  console.log(`# motif: ${motif.register} — ${motif.reason}`);
  console.log(`# ${facts.length} facts from the Brain\n`);

  const { screenplay, costUsd } = await writeScreenplay(
    {
      subject: subject || format.intent,
      format: formatId,
      channel: channel.id,
      seconds: channel.targetSeconds ?? { min: 15, max: 45 },
      productFacts: facts,
      marks: motif.marks,
      /* No capture for this product, so nothing is locatable and no gestures. */
      locatable: [],
      hasFootage: false,
    },
    createLlmClient(),
  );

  /* §338. Repair the arithmetic before judging the writing. */
  const fitted = fitScreenplay(screenplay);
  for (const adjustment of fitted.adjustments) {
    console.log(
      `# fit: ${adjustment.scene} ${adjustment.from}s → ${adjustment.to}s — ${adjustment.because}`,
    );
  }
  if (fitted.adjustments.length > 0) console.log('');

  console.log(printScreenplay(fitted.screenplay));

  const check = checkScreenplay(fitted.screenplay, {
    marks: motif.marks,
    locatable: [],
    seconds: channel.targetSeconds ?? { min: 15, max: 45 },
    hasFootage: false,
  });

  console.log(`\n${'—'.repeat(74)}`);
  console.log(
    check.ok
      ? `PRODUCIBLE · ${check.totalSeconds.toFixed(1)}s · $${costUsd.toFixed(4)}`
      : `REFUSED · ${check.totalSeconds.toFixed(1)}s · $${costUsd.toFixed(4)}`,
  );
  for (const problem of check.problems) {
    console.log(`  ${problem.scene} — ${problem.rule}: ${problem.detail}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
