import {chromium} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
const out = '/Volumes/T9/Developer/Builds/recipefix-creative-breakthrough-20261029/review';
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => {if (r.status() >= 400) errors.push(r.status() + ' ' + r.url());});
await page.goto('http://127.0.0.1:4330/', {waitUntil:'networkidle'});
await page.screenshot({path:out+'/board-phone.png',fullPage:true});
const results = [];
await page.getByRole('button', {name:'Play both muted',exact:true}).click();
const times = [1,2,3.3,5,6.9,8.4,10,11.7,13];
for (const time of times) {
  await page.waitForFunction(t => [...document.querySelectorAll('video')].every(v => v.currentTime >= Math.min(t,v.duration-.1)), time, {timeout:22000});
  await page.screenshot({path:out+`/playback-${time}.png`,fullPage:true});
}
await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.ended), undefined, {timeout:22000});
const state = () => page.locator('video').evaluateAll(vs => vs.map(v => ({id:v.id,time:v.currentTime,duration:v.duration,ended:v.ended,muted:v.muted,videoWidth:v.videoWidth,videoHeight:v.videoHeight,error:v.error?.message || null,played:Array.from({length:v.played.length},(_,i)=>[v.played.start(i),v.played.end(i)])})));
results.push({mode:'both muted',players:await state()});
for (const name of ['Play game with sound', 'Play story with sound']) {
  await page.getByRole('button', {name,exact:true}).click();
  const id = name.includes('game') ? 'egg' : 'popcorn';
  await page.waitForFunction(id => document.getElementById(id).ended, id, {timeout:22000});
  results.push({mode:name,players:await state()});
}
const report = {viewport:[390,844],visualSampling:'actual continuously playing players; key-time screenshots, not seeked stills',auditoryTasteAssessed:false,results,errors};
writeFileSync(out+'/playback.json', JSON.stringify(report,null,2)+'\n');
await browser.close();
if (errors.length || results.some(r => r.players.some(p => p.error))) throw Error('Playback errors; inspect report.');
console.log('Actual comparison and both unmuted films reached ended; no HTTP/page/media errors.');
