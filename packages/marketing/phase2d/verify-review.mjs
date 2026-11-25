import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const require = createRequire(process.cwd() + '/package.json');
const {chromium} = require('playwright');
const width = Number(process.argv[2] ?? 390);
if (![360,390,1080].includes(width)) throw Error('Unsupported comparison width');
const origin = 'http://127.0.0.1:4390';
const out = `/Volumes/T9/Developer/Builds/recipefix-phase2d-20261029/evidence/gallery-${width}`;
fs.mkdirSync(out, {recursive: true});
const catalog = await fetch(origin + '/catalog.json').then(r => r.json());
const browser = await chromium.launch({headless: true,
  executablePath: path.resolve('node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  args: ['--autoplay-policy=no-user-gesture-required']});
const failures = [], playback = [];
try {
  const page = await browser.newPage({viewport: {width, height: Math.max(844,Math.ceil(width*16/9))}});
  const errors = []; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin); await page.locator('#videos video').first().waitFor();
  const layout = await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  if(layout.width!==layout.scrollWidth) failures.push({layout});
  for (const [i,asset] of catalog.referenceAssets.entries()) {
    if(createHash('sha256').update(fs.readFileSync(asset.path)).digest('hex')!==asset.sha256) throw Error('Review media drift');
    const video=page.locator('#videos video').nth(i);
    await video.scrollIntoViewIfNeeded();
    // Native source review uses 720 for the new source and 1080 for prior exports.
    if(width===1080) await video.evaluate((v,w)=>{v.style.width=w+'px';v.style.maxHeight='none';v.style.maxWidth='none';},i===0?720:1080);
    const receipt=await video.evaluate(async v=>{
      v.currentTime=0;v.muted=true;await v.play();
      await new Promise((ok,fail)=>{v.addEventListener('ended',ok,{once:true});setTimeout(()=>fail(Error('Incomplete playback')),22000)});
      const q=v.getVideoPlaybackQuality();return{ended:v.ended,duration:v.duration,currentTime:v.currentTime,videoWidth:v.videoWidth,videoHeight:v.videoHeight,displayWidth:v.getBoundingClientRect().width,decodedFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames};
    });
    playback.push({label:asset.label,sha256:asset.sha256,...receipt});
    if(!receipt.ended||receipt.droppedFrames)failures.push({asset:asset.label,receipt});
    for(const t of (i===0?[1.25,2,3.5,4.5,5.5]:[0.5,4.5,receipt.duration-0.4])){
      await video.evaluate(async(v,t)=>{if(v.currentTime===t)return;await new Promise(ok=>{v.addEventListener('seeked',ok,{once:true});v.currentTime=t;});},t);
      await video.screenshot({path:`${out}/${i}-${t}.png`});
    }
    console.log(JSON.stringify({width,label:asset.label,ended:receipt.ended,frames:receipt.decodedFrames,dropped:receipt.droppedFrames}));
    const range=await fetch(origin+'/media/'+asset.sha256+'.mp4',{headers:{range:'bytes=0-63'}});
    if(range.status!==206||(await range.arrayBuffer()).byteLength!==64)failures.push('Range delivery failed');
  }
  if((await fetch(origin+'/media/not-in-catalog.mp4')).status!==404)failures.push('Uncatalogued media exposed');
  if(errors.length)failures.push({errors});
  fs.writeFileSync(`${out}/receipt.json`,JSON.stringify({checkedAtUTC:new Date().toISOString(),width,layout,playback,failures,sensoryLimit:'Actual complete muted transport and frame evidence. No agent hearing or founder approval. Source test is not a new complete film.'},null,2)+'\n');
  if(failures.length)throw Error(JSON.stringify(failures));
}finally{await browser.close();}
