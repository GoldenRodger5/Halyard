/**
 * Render all four Remotion compositions from a real adaptation, then run the
 * visual QC gate against the actual files. Milestone 25's definition of done.
 *
 * Records per-composition render time, because that number decides whether the
 * three-to-five-videos-a-week cadence in milestone 27 is achievable at all.
 *
 *   pnpm exec tsx scripts/render-demo-videos.ts
 *
 * Runs inside the worker container, where Chromium and FFmpeg live:
 *   docker run --rm -v "$PWD/.render-output:/app/.render-output" halyard-worker \
 *     pnpm exec tsx scripts/render-demo-videos.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeVideo, renderConcurrency, renderVideo } from '../apps/worker/src/video.js';
import { runVisualQC } from '../packages/core/src/qc/visualQC.js';
import { toArtifact, type RecipeFixAdaptation } from '../packages/core/src/connectors/recipefix.js';
import { DEFAULT_BRAND } from '../packages/render/src/brand.js';
import fixture from '../packages/core/src/connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.render-output/video');
const artifact = toArtifact(fixture as unknown as RecipeFixAdaptation);

const swaps = artifact.highlights
  .filter((h) => h.type === 'swap')
  .map((h) => ({ before: h.before ?? 'nothing', after: h.after ?? '', reason: h.reason ?? '' }));

const JOBS: Array<{
  id: string;
  seconds: number;
  platform: string;
  props: Record<string, unknown>;
}> = [
  {
    id: 'TransformationDiff',
    seconds: 28,
    platform: 'tiktok',
    props: { brand: DEFAULT_BRAND, headline: artifact.headline, swaps: swaps.slice(0, 2), wordmark: 'recipefix' },
  },
  {
    id: 'SubstitutionExplainer',
    seconds: 32,
    platform: 'instagram',
    props: {
      brand: DEFAULT_BRAND,
      ingredient: 'bread flour',
      substitute: 'gluten-free blend',
      ratio: 'Same volume, more water',
      failureMode: 'Skip the extra water and the crumb reads dry before the centre finishes setting.',
      wordmark: 'recipefix',
    },
  },
  {
    id: 'ScalingMath',
    seconds: 24,
    platform: 'youtube',
    props: {
      brand: DEFAULT_BRAND,
      fromServings: 8,
      toServings: 2,
      rows: [
        { label: 'Salt', linear: '1/2 tsp', actual: '3/4 tsp' },
        { label: 'Yeast', linear: '1/2 tsp', actual: '3/4 tsp' },
        { label: 'Water', linear: '3/8 cup', actual: '1/2 cup' },
      ],
      note: 'Salt and yeast scale to roughly 85 percent of linear.',
      wordmark: 'recipefix',
    },
  },
  {
    id: 'ChefNoteCard',
    seconds: 16,
    platform: 'tiktok',
    props: {
      brand: DEFAULT_BRAND,
      quote: 'The vinegar is doing structural work, not flavour work.',
      attribution: artifact.headline,
      wordmark: 'recipefix',
    },
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.log(`concurrency ${renderConcurrency()}\n`);

  const report: string[] = [
    '# Render timings',
    '',
    'Measured on the worker container. These decide whether the three-to-five',
    'videos-per-week cadence is achievable, so they are recorded rather than',
    'estimated.',
    '',
    '| Composition | Seconds | Render time | Size | Visual QC |',
    '|---|---|---|---|---|',
  ];

  for (const job of JOBS) {
    const outputPath = path.join(OUT, `${job.id}.mp4`);
    process.stdout.write(`${job.id.padEnd(24)} `);

    const result = await renderVideo({
      compositionId: job.id,
      props: job.props,
      outputPath,
      durationInFrames: job.seconds * 30,
    });

    const probe = await probeVideo(outputPath);
    const qc = runVisualQC(
      {
        kind: 'video',
        width: probe.width,
        height: probe.height,
        durationSeconds: probe.durationSeconds,
        frameLuminance: probe.frameLuminance,
        ...(probe.loudnessLufs !== undefined ? { loudnessLufs: probe.loudnessLufs } : {}),
        ...(probe.truePeakDbtp !== undefined ? { truePeakDbtp: probe.truePeakDbtp } : {}),
      },
      { aspectRatio: '9:16', platform: job.platform, format: 'video' },
    );

    const seconds = (result.durationMs / 1000).toFixed(1);
    const mb = (result.bytes / 1_048_576).toFixed(1);
    console.log(
      `${probe.width}x${probe.height} ${probe.durationSeconds.toFixed(1)}s  rendered in ${seconds}s  ${mb}MB  ${
        qc.passed ? 'QC pass' : `QC FAIL: ${qc.summary}`
      }`,
    );

    report.push(
      `| \`${job.id}\` | ${job.seconds} | ${seconds}s | ${mb} MB | ${qc.passed ? 'pass' : `**fail** — ${qc.summary}`} |`,
    );

    if (!qc.passed) {
      for (const finding of qc.findings) console.log(`    ${finding.severity}: ${finding.message}`);
    }
  }

  report.push('', `Rendered ${JOBS.length} compositions at concurrency ${renderConcurrency()}.`);
  writeFileSync(path.join(OUT, 'TIMINGS.md'), report.join('\n') + '\n');
  console.log(`\nwrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
