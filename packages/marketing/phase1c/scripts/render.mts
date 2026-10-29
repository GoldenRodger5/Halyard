import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync, existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve('packages/marketing/phase1c');
const out = '/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/renders';
const disk = execFileSync('diskutil', ['info', '/Volumes/T9'], {encoding: 'utf8'});
if (!/Volume UUID:\s+B1ADFFB0-BCCF-441A-8086-365120C88DB7/.test(disk) || !/FileVault:\s+Yes/.test(disk) || !/Mounted:\s+Yes/.test(disk)) throw Error('Expected encrypted T9 is required.');
mkdirSync(out, {recursive: true});
const browserExecutable = path.resolve('node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if (!existsSync(browserExecutable)) throw Error('Reuse installed renderer browser; no implicit download.');
process.env.TMPDIR='/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/scratch';
const id = process.argv[2] || 'BroilerStory';
const name = process.argv[3] || 'broiler-v1';
if (!/^[a-z0-9-]+$/.test(name)) throw Error('Simple output name required.');
const begin = Date.now();
const serveUrl = await bundle({entryPoint: path.join(root, 'entry.tsx'), publicDir: path.join(root, 'assets'), outDir: path.join(out, 'bundle'), webpackOverride: config => ({...config, resolve: {...config.resolve, extensionAlias: {'.js': ['.js', '.ts', '.tsx']}}})});
if(id==='Companions') {
  for(const [comp,file] of [...[1,2,3,4,5].map(i=>['Instagram'+i,name+'-ig-'+i]),['XGraphic',name+'-x']]) {
    const composition=await selectComposition({serveUrl,id:comp!,browserExecutable});
    const output=path.join(out,file+'.png');
    if(existsSync(output))throw Error('Preserve existing output: '+output);
    await renderStill({composition,serveUrl,frame:0,output,browserExecutable});
  }
} else {
const composition = await selectComposition({serveUrl, id, browserExecutable});
if (process.argv[4]) {
  await renderStill({composition, serveUrl, frame: Number(process.argv[4]), output: path.join(out, name + '.png'), browserExecutable});
} else {
  await renderMedia({composition, serveUrl, codec: 'h264', crf: 18, pixelFormat: 'yuv420p', audioCodec: 'aac', outputLocation: path.join(out, name + '.mp4'), concurrency: 2, browserExecutable, overwrite: false});
  writeFileSync(path.join(out, name + '.receipt.json'), JSON.stringify({id, durationFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height, wallSeconds: (Date.now() - begin) / 1000, providerCalls: 0, providerCostUsd: 0, publicationApproved: false}, null, 2) + '\n');
}
}
console.log('Rendered ' + name + ' in ' + ((Date.now() - begin) / 1000).toFixed(1) + 's');
