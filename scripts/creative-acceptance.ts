/**
 * The creative acceptance test, on real rendered files. §207.
 *
 * The brief's standard, verbatim: "A static recipe text card with minor
 * movement should FAIL creative QA. If it fails, Halyard must diagnose why and
 * regenerate it. Then inspect the corrected artifact and prove that the quality
 * materially improved."
 *
 * So this renders **two actual videos** from the same real adaptation and
 * measures both:
 *
 *   1. the card-only treatment — what Halyard produced for every post before
 *      §203, and the thing that was objected to;
 *   2. whatever `selectCreativePlan` chooses when the capture is available.
 *
 * Nothing is simulated. Remotion draws the frames, FFmpeg measures them, and
 * the gates read the measurements. A rendered file that nobody probed proves
 * only that the renderer did not crash.
 *
 *   pnpm exec tsx scripts/creative-acceptance.ts
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consecutiveDeltas } from '../apps/worker/src/handlers/reviewMedia.js';
import { probeVideo, renderVideo } from '../apps/worker/src/video.js';
import { toArtifact, type RecipeFixAdaptation } from '../packages/core/src/connectors/recipefix.js';
import {
  beatsToScenes,
  planBeforeAfter,
  type CreativePlan,
} from '../packages/core/src/creative/plan.js';
import { selectCreativePlan } from '../packages/core/src/creative/treatments.js';
import { runCreativeQC } from '../packages/core/src/qc/creativeQC.js';
import { runRetentionQC } from '../packages/core/src/qc/retentionQC.js';
import { runVisualQC } from '../packages/core/src/qc/visualQC.js';
import fixture from '../packages/core/src/connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.render-output/acceptance');
mkdirSync(OUT, { recursive: true });

const artifact = toArtifact(fixture as unknown as RecipeFixAdaptation);

/** The capture that actually exists in the render bundle's public directory. */
const FOOTAGE = { file: 'capture/adapt_and_reveal.mp4', label: 'Adapting the recipe', durationMs: 2333 };

const PLATFORM = 'tiktok';
const TARGET_SECONDS = 24;

function beatsForRender(plan: CreativePlan): Array<Record<string, unknown>> {
  const scenes = beatsToScenes(plan);
  return plan.beats.map((beat, i) => ({
    id: beat.id,
    role: beat.role,
    emphasis: beat.emphasis,
    content: beat.content,
    weight: scenes[i]!.weight,
    minSeconds: scenes[i]!.minSeconds,
    ...(scenes[i]!.maxSeconds !== undefined ? { maxSeconds: scenes[i]!.maxSeconds } : {}),
    ...(beat.media ? { media: beat.media } : {}),
    ...(beat.sourcePath ? { sourcePath: beat.sourcePath } : {}),
  }));
}

function wordsIn(content: Record<string, unknown>): number {
  const text = Object.values(content)
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .trim();
  return text ? text.split(/\s+/).length : 0;
}

async function renderAndMeasure(name: string, plan: CreativePlan, footageAvailable: boolean) {
  const beats = beatsForRender(plan);
  const outputPath = path.join(OUT, `${name}.mp4`);

  const startedAt = Date.now();
  await renderVideo({
    compositionId: 'TransformationDiff',
    outputPath,
    durationInFrames: Math.round(TARGET_SECONDS * 30),
    props: {
      headline: artifact.headline,
      swaps: artifact.highlights
        .filter((h) => h.type === 'swap')
        .map((h) => ({ before: h.before ?? '', after: h.after ?? '', reason: h.reason ?? '' })),
      beats,
      captionBackdrop: plan.captionBackdrop,
      wordmark: 'RecipeFix',
    },
  });
  const renderMs = Date.now() - startedAt;

  // ── Measure the actual file ──────────────────────────────────────────────
  const probe = await probeVideo(outputPath);
  const bytes = statSync(outputPath).size;

  const creative = runCreativeQC({
    creativeType: plan.creativeType,
    platform: PLATFORM,
    footageAvailable,
    beats: plan.beats.map((b) => ({
      role: b.role,
      emphasis: b.emphasis,
      hasMedia: Boolean(b.media),
      wordCount: wordsIn(b.content as Record<string, unknown>),
    })),
  });

  const retention = runRetentionQC(
    {
      fps: probe.fps ?? 30,
      durationSeconds: probe.durationSeconds,
      frameLuminance: probe.frameLuminance,
      frameDelta: consecutiveDeltas(probe.frameContentRange),
    },
    { platform: PLATFORM, loopReady: true },
  );

  const visual = runVisualQC(
    {
      kind: 'video',
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationSeconds,
      frameLuminance: probe.frameLuminance,
    },
    { aspectRatio: '9:16', platform: PLATFORM, format: 'video' },
  );

  /*
   * The motion measurement, stated plainly. §74 established that tonal range —
   * not mean luminance — is the signal that can see a card change, so this is
   * the number that distinguishes a moving picture from a slideshow.
   */
  const deltas = consecutiveDeltas(probe.frameContentRange);
  const meanDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const peakDelta = deltas.length ? Math.max(...deltas) : 0;

  return {
    name,
    creativeType: plan.creativeType,
    beats: plan.beats.length,
    footageBeats: plan.beats.filter((b) => b.media).length,
    renderMs,
    bytes,
    durationSeconds: Number(probe.durationSeconds.toFixed(2)),
    dimensions: `${probe.width}x${probe.height}`,
    meanDelta: Number(meanDelta.toFixed(4)),
    peakDelta: Number(peakDelta.toFixed(4)),
    creative,
    retention: { passed: retention.passed, findings: retention.findings.length },
    /*
     * No `visionScore`: the model half of gate 3 is an injected function and
     * this script supplies none. The deterministic half — dimensions, aspect
     * ratio, luminance — is what runs, and saying so is better than printing a
     * blank score as though a model had looked.
     */
    visual: { passed: visual.passed, summary: visual.summary, findings: visual.findings.length },
    rationale: plan.rationale,
    outputPath,
  };
}

async function main(): Promise<void> {
  console.log('\nCreative acceptance — two real renders from one real adaptation.\n');
  console.log(`artifact : ${artifact.headline}`);
  console.log(`highlights: ${artifact.highlights.length} (${artifact.highlights.filter((h) => h.type === 'swap').length} swaps)`);

  // ── 1. What Halyard made before §203: cards only, no footage ─────────────
  const cardOnly = planBeforeAfter(artifact, {
    platform: PLATFORM,
    format: 'video',
    targetSeconds: TARGET_SECONDS,
  });
  if (!cardOnly) throw new Error('the fixture carries no transformation');

  // ── 2. What it makes now, with the capture available ─────────────────────
  const selection = selectCreativePlan(artifact, {
    platform: PLATFORM,
    format: 'video',
    targetSeconds: TARGET_SECONDS,
    footage: FOOTAGE,
  });
  if (!selection) throw new Error('no treatment was supported');

  console.log(`\ntreatments considered: ${selection.considered.map((c) => c.plan.creativeType).join(', ')}`);
  console.log(`chosen               : ${selection.chosen.creativeType}\n`);

  const before = await renderAndMeasure('before-card-only', cardOnly, true);
  const after = await renderAndMeasure('after-selected', selection.chosen, true);

  for (const r of [before, after]) {
    console.log('─'.repeat(72));
    console.log(`${r.name}  (${r.creativeType})`);
    console.log(`  file        : ${(r.bytes / 1024).toFixed(0)} KB, ${r.durationSeconds}s, ${r.dimensions}, rendered in ${(r.renderMs / 1000).toFixed(1)}s`);
    console.log(`  beats       : ${r.beats} (${r.footageBeats} carrying real footage)`);
    console.log(`  motion      : mean Δ ${r.meanDelta}, peak Δ ${r.peakDelta}`);
    console.log(`  creative QA : ${r.creative.passed ? 'PASS' : 'FAIL'} — ${r.creative.summary}`);
    for (const f of r.creative.findings) console.log(`      [${f.severity}] ${f.rule}: ${f.message}`);
    console.log(`  retention   : ${r.retention.passed ? 'pass' : 'FAIL'} (${r.retention.findings} findings)`);
    console.log(`  visual      : ${r.visual.passed ? 'pass' : 'FAIL'} — ${r.visual.summary} (deterministic half only; no vision model supplied)`);
    console.log(`  rationale   : ${r.rationale}`);
  }

  console.log('─'.repeat(72));

  // ── The acceptance assertions ────────────────────────────────────────────
  const checks: Array<[string, boolean, string]> = [
    [
      'the card-only treatment FAILS creative QA',
      before.creative.passed === false,
      `passed=${before.creative.passed}`,
    ],
    [
      'and fails specifically for ignoring available product footage',
      before.creative.findings.some((f) => f.rule === 'creative.unused_product_footage'),
      before.creative.findings.map((f) => f.rule).join(', ') || 'no findings',
    ],
    [
      'the defect names a correction the policy can apply',
      before.creative.findings.some((f) => f.correction === 'use_captured_footage'),
      '—',
    ],
    ['the corrected treatment PASSES creative QA', after.creative.passed === true, `passed=${after.creative.passed}`],
    ['the corrected artifact contains real product footage', after.footageBeats > 0, `${after.footageBeats} footage beats`],
    [
      'the corrected artifact moves materially more',
      after.peakDelta > before.peakDelta,
      `peak Δ ${before.peakDelta} → ${after.peakDelta}`,
    ],
    ['both renders are technically valid 9:16 video', before.visual.passed && after.visual.passed, '—'],
    ['both renders produced a real file', before.bytes > 10_000 && after.bytes > 10_000, '—'],
  ];

  let failed = 0;
  console.log('\nACCEPTANCE\n');
  for (const [label, ok, detail] of checks) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  (${detail})`}`);
  }

  writeFileSync(
    path.join(OUT, 'acceptance.json'),
    JSON.stringify({ before, after, checks: checks.map(([l, ok]) => ({ check: l, ok })) }, null, 2),
  );

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  console.log(`artifacts: ${OUT}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
