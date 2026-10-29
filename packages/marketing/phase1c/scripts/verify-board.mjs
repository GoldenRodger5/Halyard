import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
process.env.TMPDIR='/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/scratch';
const out='/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/review';mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
await p.goto('http://127.0.0.1:4340/',{waitUntil:'networkidle'});
await p.waitForFunction(()=>document.getElementById('ig-caption').textContent.includes('More dinner'));
await p.screenshot({path:out+'/board-final-phone.png',fullPage:true});
const media=[];
await p.getByRole('button',{name:'Play muted',exact:true}).click();
for(const t of [.5,1.7,4.8,5.7,7.5,10.5,13,15,17]){await p.waitForFunction(t=>document.querySelector('video').currentTime>=t,t,{timeout:24000});await p.locator('video').screenshot({path:out+'/playing-'+t+'.png'});}
await p.waitForFunction(()=>document.querySelector('video').ended,undefined,{timeout:24000});
const state=()=>p.locator('video').evaluate(v=>({duration:v.duration,time:v.currentTime,ended:v.ended,muted:v.muted,error:v.error?.message||null,width:v.videoWidth,height:v.videoHeight,played:Array.from({length:v.played.length},(_,i)=>[v.played.start(i),v.played.end(i)])}));
media.push({mode:'muted',...await state()});
await p.getByRole('button',{name:'Play with sound',exact:true}).click();await p.waitForFunction(()=>document.querySelector('video').ended,undefined,{timeout:24000});media.push({mode:'unmuted',...await state()});
const slides=[];
for(let i=1;i<=5;i++){
 await p.locator('#ig').evaluate(img=>img.decode());await p.locator('#ig').screenshot({path:out+'/ig-phone-'+i+'.png'});
 const current=await p.locator('#ig').evaluate(img=>({src:img.getAttribute('src'),alt:img.alt,width:img.naturalWidth,height:img.naturalHeight}));
 if(current.src!==`ig-${i}.png`||current.width!==1080||current.height!==1350||!current.alt)throw Error('Gallery order/alt/dimensions failed.');
 slides.push(current);await p.getByRole('button',{name:'Next Instagram card',exact:true}).click();
}
await p.locator('#ig').focus();await p.keyboard.press('ArrowLeft');if(await p.locator('#slide-count').textContent()!=='5 / 5')throw Error('Keyboard previous navigation failed.');
const copy=await p.locator('#x-caption').textContent();if(!copy.includes('What part of cooking'))throw Error('X native copy failed to load.');
writeFileSync(out+'/board-playback.json',JSON.stringify({viewport:[390,844],media,slides,keyboardGalleryVerified:true,draftCopyLoaded:true,errors,auditoryTasteAssessed:false},null,2)+'\n');await b.close();if(errors.length||media.some(m=>m.error))throw Error('Actual board errors.');console.log('Full muted/unmuted playback, five native carousel cards, keyboard navigation and caption loading verified.');
