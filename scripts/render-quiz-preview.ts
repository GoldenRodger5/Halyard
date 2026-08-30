/**
 * §302. Render a quiz with every treatment in it, so somebody can look at it.
 *
 * Every visual defect found this session was found by rendering a frame and
 * looking at it — not by a gate, and not by reading the code. The countdown
 * burning 3-2-1 during the question, the answer landing in the eyebrow slot,
 * the fractions treated as viewBox units: all of them typecheck and all of them
 * pass their tests.
 *
 *   pnpm exec tsx scripts/render-quiz-preview.ts [background.png] [luminance]
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVideo } from '../apps/worker/src/video.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'media-review/2026-08-29-quiz-templates');
mkdirSync(OUT, { recursive: true });

const props: Record<string, unknown> = JSON.parse(
  readFileSync(path.join(OUT, 'props.json'), 'utf8'),
);

const background = process.argv[2];
if (background) {
  props.backgroundDataUri = `data:image/png;base64,${readFileSync(background).toString('base64')}`;
  props.backgroundLuminance = Number(process.argv[3] ?? 0.5);
}

/* Wrapped: tsx transpiles these to CJS, which has no top-level await. */
async function main() {
  const started = Date.now();
  const output = path.join(OUT, background ? 'quiz-photo.mp4' : 'quiz-flat.mp4');
  await renderVideo({ compositionId: 'Quiz', props, outputPath: output });
  console.log(`${output} — ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
