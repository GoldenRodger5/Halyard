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

/*
 * Arguments rather than environment variables. `envDocumented.test.ts` requires
 * every variable shipped code reads to be named in `.env.example`, and these are
 * knobs for a preview script — putting them there would suggest a deployment
 * needs them set, which is the opposite of true.
 *
 *   pnpm exec tsx scripts/render-quiz-preview.ts [background.png] [luminance] \
 *     [--composition Narrative] [--props narrative.json]
 */
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const composition = flag('composition') ?? 'Quiz';
const props: Record<string, unknown> = JSON.parse(
  readFileSync(path.join(OUT, flag('props') ?? 'props.json'), 'utf8'),
);

const positional = argv.filter((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--'));
const background = positional[0];
if (background) {
  props.backgroundDataUri = `data:image/png;base64,${readFileSync(background).toString('base64')}`;
  props.backgroundLuminance = Number(positional[1] ?? 0.5);
}

/* Wrapped: tsx transpiles these to CJS, which has no top-level await. */
async function main() {
  const started = Date.now();
  const output = path.join(
    OUT,
    `${composition.toLowerCase()}-${background ? 'photo' : 'flat'}.mp4`,
  );
  await renderVideo({ compositionId: composition, props, outputPath: output });
  console.log(`${output} — ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
