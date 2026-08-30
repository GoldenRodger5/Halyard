/**
 * §310. A preview with the sound on, built from the real pipeline.
 *
 * Every preview rendered so far has been silent, because `renderVideo` produces
 * picture and the audio is muxed afterwards by the `tts` handler — so a preview
 * that only calls `renderVideo` can never demonstrate the thing §306 was for.
 * "There is no sound" was the correct reading of what those files contained.
 *
 * This runs the same steps the worker does, in the same order, using the same
 * functions: derive the timed lines from the format, synthesise each one,
 * assemble them at their beats, mix a bed under them, mux into the video. It is
 * a preview of the pipeline rather than a demonstration built beside it — if
 * this sounds wrong, production sounds wrong the same way.
 *
 *   pnpm exec tsx scripts/render-with-sound.ts --props props.json \
 *     [--composition Quiz] [--background bg.png] [--luminance 0.38] [--bed bed.mp3]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElevenLabsSpeechClient } from '../packages/core/src/generation/speech.js';
import {
  assembleTimedNarration,
  audioDuration,
  mixAudio,
  muxAudioIntoVideo,
  narrationOverlaps,
} from '../apps/worker/src/audio.js';
import { renderVideo } from '../apps/worker/src/video.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* The key lives in the repo-root .env (gotcha 2); tsx does not load it. */
for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const at = line.indexOf('=');
  if (at <= 0 || line.trimStart().startsWith('#')) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim();
}

const OUT = path.join(ROOT, 'media-review/2026-08-29-quiz-templates');
const WORK = path.join(OUT, '.work');
mkdirSync(WORK, { recursive: true });

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const composition = flag('composition') ?? 'Quiz';
const props: Record<string, unknown> = JSON.parse(
  readFileSync(path.join(OUT, flag('props') ?? 'props.json'), 'utf8'),
);

const background = flag('background');
if (background) {
  props.backgroundDataUri = `data:image/png;base64,${readFileSync(background).toString('base64')}`;
  props.backgroundLuminance = Number(flag('luminance') ?? 0.5);
}

/**
 * The lines, and when each is said.
 *
 * Read from the props file rather than re-derived, so what is previewed is
 * exactly what `videoForFormat` produced — re-deriving here would preview a
 * second implementation of the same idea, which is the thing most likely to
 * disagree with production.
 */
interface Line {
  atSeconds: number;
  text: string;
}
const narration = (props.narration as Line[] | undefined) ?? [];
delete props.narration;

async function main(): Promise<void> {
  if (narration.length === 0) {
    throw new Error(
      'The props file has no `narration` array, so there is nothing to say. ' +
        'Generate it with videoForFormat and write it in beside the props.',
    );
  }

  const silent = path.join(WORK, `${composition}-silent.mp4`);
  console.log(`rendering ${composition}…`);
  await renderVideo({ compositionId: composition, props, outputPath: silent });

  const speech = new ElevenLabsSpeechClient();
  const clips: Array<{ path: string; atSeconds: number }> = [];
  for (const [i, line] of narration.entries()) {
    const clipPath = path.join(WORK, `line-${i}.mp3`);
    process.stdout.write(`  line ${i + 1}/${narration.length} @${line.atSeconds}s\n`);
    writeFileSync(clipPath, await speech.synthesize(line.text, {}));
    clips.push({ path: clipPath, atSeconds: line.atSeconds });
  }

  /*
   * §312. Overruns are reported here as well as in the handler. A preview that
   * does not say a line ran into the next one is a preview that hides the exact
   * defect the timed read exists to prevent — and it is inaudible in a
   * waveform, so nothing else catches it.
   */
  const measured = await Promise.all(
    clips.map(async (clip, i) => ({
      atSeconds: clip.atSeconds,
      durationSeconds: await audioDuration(clip.path),
      text: narration[i]!.text,
    })),
  );
  const overlaps = narrationOverlaps(measured);
  if (overlaps.length > 0) {
    for (const o of overlaps) {
      console.warn(`  ! "${o.text.slice(0, 50)}" overruns by ${o.overlapSeconds}s`);
    }
  } else {
    console.log('  every line finishes before the next begins');
  }

  const narrationPath = path.join(WORK, 'narration.mp3');
  await assembleTimedNarration(clips, narrationPath);

  const bed = flag('bed');
  const mixPath = path.join(WORK, 'mix.mp3');
  const mix = await mixAudio({
    narrationPath,
    musicPath: bed ?? null,
    outputPath: mixPath,
  });
  console.log(
    `mix: ${mix.durationSeconds.toFixed(1)}s  ${mix.lufs.toFixed(1)} LUFS  ` +
      `peak ${mix.truePeakDb.toFixed(1)} dBTP  music=${mix.hadMusic}`,
  );

  const output = path.join(OUT, `${composition.toLowerCase()}-sound.mp4`);
  await muxAudioIntoVideo(silent, mixPath, output);
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
