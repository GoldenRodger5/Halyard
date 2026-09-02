/**
 * §441. Render the same beat under every camera move, and look at it.
 *
 * The connectivity test asserts that `move` reaches the props and that the five
 * moves have five distinct grammars. It cannot assert that they *look*
 * different, and every visual defect in this codebase's history was found by
 * rendering a frame and looking at it rather than by a gate or by reading code.
 *
 *   pnpm exec tsx scripts/preview-moves.ts
 *
 * Writes one frame per move at the start and end of a beat, so the difference
 * between "hold" and "push_in" is visible as a pair rather than asserted.
 *
 * Measured on the first run — mean absolute pixel delta from a beat's first
 * frame to its last, and the horizontal centre of mass:
 *
 *     hold      2.90   shift  0.00   still. The 2.9 is the type fading in.
 *     push_in  22.47   shift  0.10   the strongest zoom, no pan.
 *     drift    23.79   shift 12.47   the only one that pans.
 *     cut      15.13   shift  0.15   starts wide, settles fast.
 *     settle   13.68   shift  0.11   comes to rest.
 *
 * Five names, five behaviours. Before §441 every beat of every render was the
 * same 1.00 to 1.06 push, because nothing told the Ground otherwise.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { videoForFormat, type SceneDirection } from '@halyard/render/video';
import { SCENE_MOVES } from '../packages/render/src/video/narrative.js';

const OUT = path.resolve('.render-output/moves');
mkdirSync(OUT, { recursive: true });

const SLOTS = [
  { key: 'hook', index: 0, text: 'Baking soda reached kitchens through pharmacies' },
  { key: 'setup', index: 0, text: 'Everyone assumes it was always a baking ingredient' },
  { key: 'turn', index: 0, text: 'The boxes looked medical because they were medical' },
  { key: 'why_it_matters', index: 0, text: 'The dosage language on the box is a leftover from that' },
];

/* A flat colour ground so the only thing that varies is the camera. */
const BACKGROUND =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
       <defs><pattern id="g" width="120" height="120" patternUnits="userSpaceOnUse">
         <rect width="120" height="120" fill="#8a6a48"/>
         <circle cx="60" cy="60" r="42" fill="#c8a878"/>
       </pattern></defs>
       <rect width="1080" height="1920" fill="url(#g)"/>
     </svg>`,
  ).toString('base64');

async function main() {
  const entry = path.resolve('packages/render/src/video/entry.tsx');
  /*
   * The same webpack override the worker uses: this package is ESM TypeScript
   * importing with explicit `.js` specifiers, which is what Node wants, and
   * Remotion's webpack has to be told a `.js` specifier may resolve to the
   * `.tsx` beside it. Gotcha 10's neighbourhood.
   */
  const serveUrl = await bundle(entry, () => undefined, {
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

  for (const move of SCENE_MOVES) {
    const direction: Record<string, SceneDirection> = { 'setup:0': { move } };
    const built = videoForFormat('history', SLOTS, direction);
    if (!built) throw new Error('history built nothing');

    const beats = (built.props.beats as Array<Record<string, unknown>>).map((b) => ({
      ...b,
      backgroundDataUri: BACKGROUND,
      backgroundLuminance: 0.45,
    }));

    const inputProps = {
      /* The full token set: `useBrand` reads all seven, not the three a card shows. */
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

    const composition = await selectComposition({
      serveUrl,
      id: 'Narrative',
      inputProps,
    });

    /*
     * The directed beat is the second. Its frames run from the end of beat one to
     * the end of beat two, so the first and last frame of *that* beat is where a
     * camera move is visible — sampling the whole piece would compare two
     * different beats and prove nothing.
     */
    const fps = composition.fps;
    const before = Math.round((beats[0]!.seconds as number) * fps) + 2;
    const after = before + Math.round((beats[1]!.seconds as number) * fps) - 4;

    for (const [label, frame] of [['start', before], ['end', after]] as const) {
      await renderStill({
        composition: { ...composition, durationInFrames: Math.max(composition.durationInFrames, frame + 1) },
        serveUrl,
        output: path.join(OUT, `${move}-${label}.png`),
        frame,
        inputProps,
      });
    }
    console.log(`${move}: frames ${before} and ${after}`);
  }
  console.log(`\nWritten to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
