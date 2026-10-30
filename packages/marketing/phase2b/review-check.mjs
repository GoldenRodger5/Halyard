import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(process.cwd()+'/package.json');
const {chromium}=require('@playwright/test');
const output=process.env.RECIPEFIX_REVIEW_EVIDENCE??'/Volumes/T9/Developer/Builds/recipefix-phase2b-20261029/integration/evidence';
fs.mkdirSync(output,{recursive:true});
const origin='http://127.0.0.1:4370';
const catalog=await fetch(origin+'/catalog.json').then(r=>r.json());
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const failures=[];const playback=[];const screenshots=[];
try{
 for(const width of [360,390]){
  const page=await browser.newPage({viewport:{width,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('.idea').first().waitFor();
  await page.evaluate(async()=>{
   document.querySelectorAll('img').forEach(i=>{i.loading='eager';});
   await Promise.race([
    Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),
    new Promise(resolve=>setTimeout(resolve,10000))
   ]);
  });
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}));
  if(dims.scroll>width||dims.broken.length||errors.length)failures.push({width,dims,errors});
  for(const idea of catalog.ideas){
   await page.locator('#'+idea.id).scrollIntoViewIfNeeded();
   const screenshot=path.join(output,`${idea.id}-${width}.png`);await page.screenshot({path:screenshot});screenshots.push(screenshot);
   for(const variant of idea.variants.filter(v=>v.format==='carousel')){
    const strip=page.locator('#'+variant.id);const next=page.locator(`[data-next="${variant.id}"]`);
    for(let n=1;n<variant.media.length;n++){
     await next.click();await page.waitForTimeout(450);
     const index=await strip.evaluate(s=>Math.round(s.scrollLeft/s.clientWidth));
     if(index!==n)failures.push({variant:variant.id,width,expectedSlide:n,actual:index});
    }
   }
  }
  if(process.env.RECIPEFIX_SKIP_PLAYBACK!=='1'){
   // Each unique movie is played from start to end with and without sound.
   // This verifies transport/visual samples, not human auditory perception.
   const seen=new Set();
   const movies=[...catalog.ideas.flatMap(i=>i.variants).filter(v=>v.media[0]?.kind==='video'),...(catalog.beforeFilm?[{media:[catalog.beforeFilm]}]:[]),...(catalog.productProof?[{media:[catalog.productProof]}]:[]),...(catalog.finishedFilms??[]).map(a=>({media:[a]}))];
   for(const variant of movies){
    if(seen.has(variant.media[0].sha256))continue;seen.add(variant.media[0].sha256);
    const asset=variant.media[0];
    if(process.env.RECIPEFIX_ONLY_PLAYBACK_SHA&&asset.sha256!==process.env.RECIPEFIX_ONLY_PLAYBACK_SHA)continue;
    const src='/media/'+asset.sha256+path.extname(asset.path);
    const video=page.locator(`video[src="${src}"]`).first();await video.scrollIntoViewIfNeeded();
    for(const muted of [true,false]){
     await video.evaluate(async(v,muted)=>{v.currentTime=0;v.muted=muted;v.volume=1;await v.play();},muted);
     for(const time of [0.5,2.5,4.5,6.5,8.5,10.5,12.5,14.5,16.5,18.5,19.3,21.5].filter(t=>t<(asset.durationSeconds??Infinity))){
      await page.waitForFunction(({src,time})=>{const v=[...document.querySelectorAll('video')].find(v=>v.getAttribute('src')===src);return v.ended||v.currentTime>=time},{src,time},{timeout:15000});
      if(muted){const screenshot=path.join(output,`film-${asset.sha256.slice(0,8)}-${time}-${width}.png`);await page.screenshot({path:screenshot});screenshots.push(screenshot);}
     }
     await page.waitForFunction(src=>[...document.querySelectorAll('video')].find(v=>v.getAttribute('src')===src).ended,src,{timeout:18000});
     playback.push({sha256:asset.sha256,viewport:{width,height:844},...await video.evaluate(v=>({muted:v.muted,duration:v.duration,ended:v.ended,played:Array.from({length:v.played.length},(_,i)=>[v.played.start(i),v.played.end(i)]),quality:v.getVideoPlaybackQuality?{total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}:null,perception:'Continuous playback and sampled exported-frame inspection; audio quality not directly heard.'}))});
    }
   }
  }
  await page.close();
 }
 const media=catalog.ideas.flatMap(i=>i.variants).flatMap(v=>v.media);
 const first=media[0];const u=origin+'/media/'+first.sha256+path.extname(first.path);
 const range=await fetch(u,{headers:{range:'bytes=0-63'}});
 if(range.status!==206||(await range.arrayBuffer()).byteLength!==64)failures.push({rangeStatus:range.status});
 const denied=await fetch(origin+'/media/not-in-catalog.mp4');if(denied.status!==404)failures.push('Noncatalog media exposed');
 fs.writeFileSync(path.join(output,'gallery-check.json'),JSON.stringify({checkedAt:new Date().toISOString(),parents:catalog.ideas.length,variants:catalog.ideas.flatMap(i=>i.variants).length,viewports:[360,390],failures,playback,screenshots},null,2));
 console.log(JSON.stringify({parents:catalog.ideas.length,failures,playback}));
 if(failures.length)process.exitCode=1;
}finally{await browser.close();}
