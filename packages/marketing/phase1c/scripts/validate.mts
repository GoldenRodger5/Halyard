import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {loadStoredOutput} from '../../src/assets.js';
import {qaStill} from '../../src/qa/image.js';

const root=path.resolve('packages/marketing/phase1c');
const record=loadStoredOutput({repo:'/Users/isaacmineo/PROJECT_2025/recipe-fix',commit:'3f32680f091d06ad9046bb95e4dfb55489d2c264'},'src/data/landingRealResult.ts','LANDING_REAL_RESULT');
const local=JSON.parse(readFileSync(root+'/assets/real-result.json','utf8'));
if(JSON.stringify(record.data)!==JSON.stringify(local))throw Error('Local result differs from pinned verbatim production record.');
if(local.originalServings!==4||local.servings!==6||!local.ingredients[0].original.includes('1 1/2 lb')||!local.ingredients[0].adapted.includes('2¼ lb'))throw Error('Wrong source quantity example.');
for(const text of ['two foil-lined baking sheets','broil one sheet at a time','8 to 10 minutes','transfer each batch to the simmering sauce to finish cooking','165°F (74°C)'])if(!local.steps[4].instruction.includes(text))throw Error('Missing essential method context: '+text);
const file=root+'/review/broiler.mp4';
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
const v=probe.streams.find((s:{codec_type:string})=>s.codec_type==='video'),a=probe.streams.find((s:{codec_type:string})=>s.codec_type==='audio');
if(v.width!==1080||v.height!==1920||v.r_frame_rate!=='30/1'||v.nb_frames!=='543'||v.codec_name!=='h264'||!['yuv420p','yuvj420p'].includes(v.pix_fmt)||a.codec_name!=='aac'||a.channels!==2)throw Error('Unexpected exported media format.');
const ebur=spawnSync('ffmpeg',['-hide_banner','-i',file,'-vn','-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8'});
if(ebur.status!==0)throw Error('Audio measurement failed.');
const checks:Array<{name:string;at?:number;intended:string[];canvas:{width:number;height:number};safeBox:{x0:number;y0:number;x1:number;y1:number}}>=[];
const videoChecks:Array<[number,string[]]>= [
 [1.2,['More dinner.','Same broiler.','Chicken Tikka Masala','4','6 servings','Illustrated plan','recorded result','Oct 21, 2026']],
 [5.4,['Make it fit','the actual dinner.','Request: Dairy-Free · 6 servings','Current UI','recorded result','Oct 21, 2026']],
 [7.5,['The actual revised step:','Two sheets.','Broil one at a time.','Current UI','recorded result','Oct 21, 2026']],
 [10.5,['Two sheets.','One at a time.','RecipeFix rewrote the broiler step.','Illustrated plan','recorded result','Oct 21, 2026']],
 [14.6,['Then finish','in the sauce.','Follow the full recipe for doneness.','Illustrated plan','recorded result','Oct 21, 2026']],
 [17,['Cooking for more?','Try this recipe.','recipefix.app','Chicken Tikka Masala','Make it fit','Original recipe photo','Illustrated plan','recorded result','Oct 21, 2026']],
];
for(const [at,intended] of videoChecks)checks.push({name:'broiler',at,intended,canvas:{width:1080,height:1920},safeBox:{x0:90,y0:240,x1:920,y1:1460}});
const cards=[['6 PEOPLE.','SAME BROILER.','A real RecipeFix example:'],['The numbers','are half the job.','The quantity grows.','Your broiler space stays the same.'],['The new plan:','two sheets.','One sheet at a time.','Then finish each batch in the sauce.'],['It rewrote the','broiler step, too.','broil one sheet at a time','The full recipe then finishes the chicken'],['Your dinner.','Your headcount.','Tap','Make it fit','recipefix.app']];
cards.forEach((intended,i)=>checks.push({name:'ig-'+(i+1),intended,canvas:{width:1080,height:1350},safeBox:{x0:60,y0:110,x1:1020,y1:1305}}));
checks.push({name:'x',intended:['More chicken.','A different batch plan.','Two uncrowded sheets.','Broil one at a time.','Finish each batch in the sauce.'],canvas:{width:1200,height:675},safeBox:{x0:60,y0:95,x1:1140,y1:650}});
const results=[];
for(const check of checks){const png=check.at===undefined?readFileSync(root+'/review/'+check.name+'.png'):execFileSync('ffmpeg',['-v','error','-ss',String(check.at),'-i',file,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{maxBuffer:32*1024*1024});const report=await qaStill({png,intended:check.intended,canvas:check.canvas,safeBox:check.safeBox,minWordHeight:24,label:check.name+'@'+(check.at??'static')});results.push({...check,...report});console.log(JSON.stringify({name:check.name,at:check.at,passed:report.passed,failed:report.checks.filter(c=>!c.passed)}));}
const hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
const raw=execFileSync('ffmpeg',['-v','error','-ss','5.4','-i',file,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{maxBuffer:32*1024*1024});
const captionCrop=await sharp(raw).extract({left:90,top:1350,width:830,height:110}).png().toBuffer();
writeFileSync(root+'/review/annotation-proof.png',captionCrop);
const supplement=await qaStill({png:captionCrop,intended:['Request: Dairy-Free · 6 servings'],canvas:{width:830,height:110},safeBox:{x0:0,y0:0,x1:830,y1:110},minWordHeight:24,label:'Actual encoded annotation, isolated from duplicate source-UI words'});
writeFileSync(root+'/review/verification.json',JSON.stringify({scope:'Actual exported media and source/readability verification, not creative approval',sourceMatchesPinnedProductionRecord:true,sourceRecord:record.record,video:{sha256:hash(file),bytes:statSync(file).size,probe,ebur128:ebur.stderr.slice(ebur.stderr.lastIndexOf('Summary:')).split('[out#')[0]!.trim()},thresholds:{minWordHeight:24,contrast:4.5},results,sourceUiLimitation:'At5.4s full-frame OCR attributes repeated words to the unchanged captured UI: Dairy-Free4.09:1 and muted servings3.44:1. This failure remains recorded. Core numeric control is dark; high-contrast editorial request annotation is independently checked below. No claim that every source-UI word meets4.5:1.',primaryAnnotationSupplement:{actualEncodedFrame:5.4,crop:{left:90,top:1350,width:830,height:110},exportPixelsUnchanged:true,...supplement},providerCalls:0,providerCostUsd:0,publicationApproved:false},null,2)+'\n');
console.log('Isolated actual primary annotation passes:',supplement.passed,'; full-frame source UI finding is retained.');
if(results.some(r=>!r.passed))process.exitCode=1;
