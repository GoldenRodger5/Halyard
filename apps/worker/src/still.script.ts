/* Scratch: render one frame so it can be looked at. Not shipped. */
import { renderStill, selectComposition } from '@remotion/renderer';
import { getBundle } from './video.js';

const [, , compId, outPath, frameStr, propsJson] = process.argv;
const serveUrl = await getBundle();
const inputProps = propsJson ? JSON.parse(propsJson) : {};
const composition = await selectComposition({ serveUrl, id: compId!, inputProps });
await renderStill({
  serveUrl, composition, output: outPath!, frame: Number(frameStr ?? 30),
  inputProps, chromiumOptions: { gl: 'swangle' }, logLevel: 'error',
});
console.log(`${outPath} ${composition.width}x${composition.height}`);
