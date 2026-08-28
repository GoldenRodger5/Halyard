/**
 * Did the authorised capture actually unblock the creative pipeline? §219.
 *
 * Read-only. Three questions, in the order the pipeline asks them:
 *   1. Can `captureFootage` find the recording?
 *   2. Does `scoreConcepts` now consider footage-dependent directions buildable?
 *   3. Does a planner actually produce a footage beat from it?
 *
 * A capture that lands in the database and never reaches a frame has unblocked
 * nothing, which is the distinction this checks.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { captureFootage } from '../src/capture/footage.js';
import {
  planFeatureDemo,
  scoreConcepts,
  type Concept,
  type ConceptCapabilities,
} from '@halyard/core';

const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 20_000 });
const ctx = { pool, log: () => undefined, enqueue: async () => undefined } as never;

console.log('\nDid the capture unblock the pipeline?\n');

// 1 ────────────────────────────────────────────────────────────────────────
const footage = await captureFootage(ctx, 'recipefix');
console.log('  1. captureFootage()');
if (!footage) {
  console.log('     ✗ no usable footage found');
} else {
  console.log(`     ✓ ${footage.file}`);
  console.log(`       ${(footage.durationMs / 1000).toFixed(2)}s of usable cut, ${footage.ageDays} days old`);
  if (footage.label) console.log(`       label: ${footage.label}`);
}

// 2 ────────────────────────────────────────────────────────────────────────
const captures = await pool.query<{ n: string }>(
  `select count(*)::text as n from capture_runs
    where product_id='recipefix' and ok and video_asset_id is not null
      and started_at > now() - interval '30 days'`,
);
const facts = await pool.query<{ n: string }>(
  `select count(*)::text as n from product_facts
    where product_id='recipefix' and status='verified' and superseded_by is null`,
);

const capabilities: ConceptCapabilities = {
  hasProductCapture: Number(captures.rows[0]!.n) > 0,
  verifiedFactCount: Number(facts.rows[0]!.n),
  hasOwnedImagery: false,
  hasMeasuredHistory: false,
};

const demoConcept: Concept = {
  title: 'Watch it rewrite the whole ingredient list',
  premise: 'The app swaps every wheat ingredient in one pass and shows what changed.',
  objective: 'product_promotion',
  treatment: 'feature_demo',
  platformIntent: ['tiktok', 'instagram'],
  evidenceRequirements: [
    { kind: 'product_capture', detail: 'Needs real footage of the adaptation happening.' },
  ],
};

const [scored] = scoreConcepts({ concepts: [demoConcept], capabilities });
console.log('\n  2. scoreConcepts() on a footage-dependent direction');
console.log(`     buildable: ${scored!.buildable}   score: ${scored!.score}`);
console.log(`     ${scored!.reason}`);

// 3 ────────────────────────────────────────────────────────────────────────
console.log('\n  3. planFeatureDemo() with that footage');
const artifact = {
  kind: 'recipe_adaptation',
  raw: {},
  headline: 'Gluten-free artisan bread',
  highlights: [
    {
      type: 'swap' as const,
      sourcePath: 'ingredients[0].changeReason',
      before: 'bread flour',
      after: '1-to-1 gluten-free blend',
      reason: 'A 1:1 blend with xanthan gum is the only swap that keeps the dough workable.',
      alternative: null,
    },
  ],
  visualHints: [],
};

const plan = footage
  ? planFeatureDemo(artifact, {
      platform: 'tiktok',
      format: 'video',
      targetSeconds: 24,
      footage: { file: footage.file, ...(footage.label ? { label: footage.label } : {}), durationMs: footage.durationMs },
    })
  : null;

if (!plan) {
  console.log('     ✗ no plan (no footage, so the treatment correctly refuses)');
} else {
  const media = plan.beats.filter((b) => b.media);
  console.log(`     ✓ ${plan.creativeType}: ${plan.beats.length} beats, ${media.length} carrying real footage`);
  console.log(`       ${plan.rationale}`);
}

console.log(
  `\n  Verdict: ${footage && scored!.buildable && plan ? 'the capture reached the frames.' : 'still blocked.'}\n`,
);
await pool.end();
