import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const disk = execFileSync('diskutil', ['info', '/Volumes/T9'], {encoding: 'utf8'});
if (!disk.includes('B1ADFFB0-BCCF-441A-8086-365120C88DB7') || !/FileVault:\s+Yes/.test(disk)) {
  throw Error('Mounted encrypted T9 required');
}
const tag = process.argv[2] ?? 'animatic';
if (!/^[a-z0-9-]+$/.test(tag)) throw Error('Use a simple unique output tag');
const draft = process.argv.includes('--draft');
const base = '/Volumes/T9/Developer/Builds/recipefix-phase2c-20261029';
const out = path.join(base, tag);
if (existsSync(path.join(out, 'picture.mp4'))) throw Error('Preserve previous output');
mkdirSync(out, {recursive: true});
mkdirSync(path.join(base, 'scratch'), {recursive: true});
process.env.TMPDIR = path.join(base, 'scratch');
const root = path.resolve('packages/marketing/phase2c');
const browserExecutable = path.resolve('node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if (!existsSync(browserExecutable)) throw Error('Reuse the installed browser; no download');
const serveUrl = await bundle({entryPoint: path.join(root, 'entry.tsx'), publicDir: path.join(root, 'assets'), outDir: path.join(out, 'bundle')});
const composition = await selectComposition({serveUrl, id: 'SecondTray', browserExecutable});
await renderMedia({serveUrl, composition, browserExecutable, outputLocation: path.join(out, 'picture.mp4'),
  codec: 'h264', crf: draft ? 23 : 15, scale: draft ? 0.5 : 1, x264Preset: 'fast', concurrency: 2,
  imageFormat: 'png', colorSpace: 'bt709'});
// Reuse the existing continuous take and licensed sources; align the actual state cut.
// This is an immutable render-input lock, never founder creative/publication authority.
const picture = path.join(out, 'picture.mp4');
const lock = {pictureLocked: true, renderInputOnly: true,
  picturePath: picture, pictureSha256: createHash('sha256').update(readFileSync(picture)).digest('hex'),
  durationSeconds: 12.8, frames: 384, fps: 30, voiceAtSeconds: 0.35,
  musicSource: 'music-excerpt.wav', musicStartSeconds: 0,
  foleyCues: [{source: 'tray-handling.mp3', sourceStartSeconds: 0.32,
    durationSeconds: 0.95, atSeconds: 4.53, gainDb: -7}],
  authority: 'Phase2C render-input hash only; not picture acceptance, founder approval or new synthesis.'};
const lockPath = path.join(out, 'audio-cues.json');
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
const inheritedAudio = path.resolve('packages/marketing/phase2b/audio');
execFileSync('python3', [path.join(inheritedAudio, 'mix.py'), '--lock', lockPath,
  '--assets', path.join(inheritedAudio, 'assets'), '--out', path.join(out, 'mix'),
  '--voice', path.join(inheritedAudio, 'assets/narrator-chris-take-1.mp3')]);
copyFileSync(path.join(out, 'mix/recipefix-narration.mp4'), path.join(out, 'second-tray.mp4'));
writeFileSync(path.join(out, 'render-receipt.json'), JSON.stringify({tag, draft, frames: 384, fps: 30,
  durationSeconds: 12.8, width: draft ? 540 : 1080, height: draft ? 960 : 1920,
  newProviderCalls: 0, additionalCashUSD: 0, audio: 'Existing full Chris take, original speed and text; licensed sources remixed to the4.6s state cut. No new synthesis.'}, null, 2) + '\n');
console.log(path.join(out, 'second-tray.mp4'));
