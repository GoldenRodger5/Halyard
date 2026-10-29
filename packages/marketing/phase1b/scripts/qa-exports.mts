import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {qaStill} from '../../src/qa/image.js';

const root = path.resolve('packages/marketing/phase1b');
const checks = [
  {film:'egg', at:1.2, intended:['FOLLOW', 'THE YOLK.']},
  {film:'egg', at:6.95, intended:['NICE', 'TRY.']},
  {film:'egg', at:9.5, intended:['WHICH', 'SHELL?']},
  {film:'egg', at:12.2, intended:['THERE', 'YOU ARE.']},
  {film:'egg', at:14.1, intended:['OH.']},
  {film:'popcorn', at:.5, intended:['An explosion.', 'In a snack.']},
  {film:'popcorn', at:3, intended:['Inside a kernel.', 'A little water.']},
  {film:'popcorn', at:6, intended:['Water', 'steam.', 'Pressure builds.']},
  {film:'popcorn', at:12.7, intended:['The starch becomes', 'the fluffy part.']},
];
const results = [];
for (const check of checks) {
  const png = execFileSync('ffmpeg', ['-v','error','-ss',String(check.at),'-i',path.join(root,'review',check.film+'.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'], {maxBuffer:32*1024*1024});
  const report = await qaStill({png, intended:check.intended, safeBox:{x0:90,y0:240,x1:920,y1:1460},canvas:{width:1080,height:1920},minWordHeight:24,label:check.film+'@'+check.at});
  results.push({...check,...report});
  console.log(JSON.stringify({film:check.film,at:check.at,passed:report.passed,failed:report.checks.filter(c=>!c.passed)}));
}
writeFileSync(path.join(root,'review/export-text-qa.json'),JSON.stringify({purpose:'Critical-copy readability and safe zones on actual encoded frames; not creative approval',minWordHeight:24,contrastThreshold:4.5,safeBox:{x0:90,y0:240,x1:920,y1:1460},results},null,2)+'\n');
if(results.some(r=>!r.passed)) process.exitCode=1;
