/**
 * §478. Render a beat over a clip, and look at it.
 *
 * `screenplayDirects.test.ts` proves a footage scene reaches the beat and
 * `beatFootage.test.ts` proves the worker resolves it to an asset. Neither can
 * prove that `<OffthreadVideo>` inside the Narrative ground draws frames — the
 * one thing gotcha 10 says only a render can prove.
 *
 *   ffmpeg -f lavfi -i "mandelbrot=size=1080x1920:rate=30" -t 6 -pix_fmt yuv420p \
 *     packages/render/public/stock/preview.mp4
 *   pnpm exec tsx scripts/preview-footage.ts
 *
 * Writes the first and last frame of a beat grounded on the clip, and the same
 * beat on a still, to `.render-output/footage/`. The clip frames must differ
 * from each other by more than the still frames do — a clip that is playing
 * changes between two frames a beat apart; a still under a `hold` does not.
 *
 * Not `testsrc2`: it is a colour chart with one small moving bar, and measured
 * 3.13 against the still's 2.25 while visibly playing (the frame counter read
 * 8, then 120). A mean over the whole frame needs a clip that moves everywhere.
 * Measured with the Mandelbrot zoom: still 2.25, footage 35.15.
 */
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { videoForFormat, type SceneDirection } from '@halyard/render/video';

const execFileAsync = promisify(execFile);

const OUT = path.resolve('.render-output/footage');
mkdirSync(OUT, { recursive: true });

const SLOTS = [
  { key: 'hook', index: 0, text: 'Baking soda reached kitchens through pharmacies' },
  { key: 'setup', index: 0, text: 'Everyone assumes it was always a baking ingredient' },
  { key: 'turn', index: 0, text: 'The boxes looked medical because they were medical' },
  { key: 'why_it_matters', index: 0, text: 'The dosage language on the box is a leftover from that' },
];

const STILL =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
       <rect width="1080" height="1920" fill="#8a6a48"/>
       <circle cx="540" cy="960" r="300" fill="#c8a878"/>
     </svg>`,
  ).toString('base64');

/**
 * Mean luma difference between two frames, 0-255, the way the worker measures
 * a ground (`measureLowerLuminance` reads the same `signalstats` filter).
 */
async function meanDelta(a: string, b: string): Promise<number> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i', a, '-i', b,
    '-filter_complex', '[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
    '-f', 'null', '-',
  ]);
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(stderr);
  if (!m) throw new Error(`no YAVG in ffmpeg output:\n${stderr.slice(-400)}`);
  return Number(m[1]);
}

async function main() {
  const entry = path.resolve('packages/render/src/video/entry.tsx');
  const serveUrl = await bundle(entry, () => undefined, {
    publicDir: path.resolve('packages/render/public'),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          ...(config.resolve?.extensionAlias ?? {}),
          '.js': ['.ts', '.tsx', '.js'],
          '.jsx': ['.tsx', '.jsx'],
        },
      },
    }),
  });

  const results: Record<string, number> = {};
  for (const ground of ['still', 'footage'] as const) {
    /* `hold` on both, so the only thing that can move is the clip itself. */
    const direction: Record<string, SceneDirection> = {
      'setup:0': ground === 'footage'
        ? { move: 'hold', ground: 'footage', groundSubject: 'test pattern' }
        : { move: 'hold' },
    };
    const built = videoForFormat('history', SLOTS, direction);
    if (!built) throw new Error('history built nothing');

    const beats = (built.props.beats as Array<Record<string, unknown>>).map((b) => ({
      ...b,
      backgroundDataUri: STILL,
      backgroundLuminance: 0.45,
      ...(b.wantsFootage ? { backgroundVideoFile: 'stock/preview.mp4', backgroundVideoSeconds: 6 } : {}),
    }));
    if (ground === 'footage' && !beats.some((b) => b.backgroundVideoFile)) {
      throw new Error('the footage direction never reached a beat');
    }

    const inputProps = {
      brand: {
        primary: '#C4714A',
        background: '#FAF8F3',
        ink: '#2A2320',
        muted: '#7A6E66',
        accent: '#5C7A5E',
        headingFont: 'Instrument Serif',
        bodyFont: 'Inter',
      },
      beats,
    };
    const composition = await selectComposition({ serveUrl, id: 'Narrative', inputProps });
    const fps = composition.fps;
    const start = Math.round((beats[0]!.seconds as number) * fps) + 8;
    const end = start + Math.round((beats[1]!.seconds as number) * fps) - 12;

    const files: string[] = [];
    for (const [label, frame] of [['start', start], ['end', end]] as const) {
      const output = path.join(OUT, `${ground}-${label}.png`);
      await renderStill({
        composition: { ...composition, durationInFrames: Math.max(composition.durationInFrames, frame + 1) },
        serveUrl,
        output,
        frame,
        inputProps,
      });
      files.push(output);
    }
    results[ground] = await meanDelta(files[0]!, files[1]!);
    console.log(`${ground}: frames ${start} and ${end}, mean delta ${results[ground].toFixed(2)}`);
  }

  if (results.footage! <= results.still! * 3) {
    throw new Error(`the clip is not playing: footage delta ${results.footage} vs still ${results.still}`);
  }
  console.log(`\nThe clip plays. Written to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
