import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {balancedNativeLines,renderMomentCircuitOverlay} from './overlay';
import {shotDuration,shotLayoutAt,sourcePreservingFilter,
  validateProtectedFocus} from './geometry';
import {validateEditSegment,type EditSegment,type ShotPlan} from './edit-plan';
import {runV4Ffmpeg} from './v4-stage-worker';

async function concat(parts:string[],output:string,dir:string){
  if(parts.length===1){await fsp.copyFile(parts[0]!,output);return;}
  const list=path.join(dir,'render-concat.txt');
  await fsp.writeFile(list,parts.map(part=>
    `file '${part.replace(/'/g,"'\\''")}'`).join('\n')+'\n');
  try{
    await runV4Ffmpeg(['-y','-f','concat','-safe','0','-i',list,
      '-c','copy','-movflags','+faststart',output],false,90_000);
  }catch{
    await runV4Ffmpeg(['-y','-f','concat','-safe','0','-i',list,
      '-c:v','libx264','-crf','18','-preset','veryfast',
      '-c:a','aac','-b:a','192k','-movflags','+faststart',output],false,120_000);
  }
}

async function renderShot(source:string,output:string,shot:ShotPlan,
  plan:EditSegment){
  validateProtectedFocus(shot);
  await runV4Ffmpeg(['-y','-ss',String(plan.start+shot.start),
    '-t',String(shotDuration(shot)),'-i',source,
    '-filter_complex',sourcePreservingFilter(shot.layout,shot.focus_x,
      plan.source_layout),'-map','[v0]','-map','0:a?',
    '-c:v','libx264','-crf','18','-preset','veryfast',
    '-c:a','aac','-b:a','192k','-movflags','+faststart',
    '-shortest',output],false,120_000);
}

type Overlay={file:string;start:number;end:number};

const escapeFilterPath=(value:string)=>value.replace(/\\/g,'\\\\')
  .replace(/'/g,"\\'").replace(/:/g,'\\:').replace(/,/g,'\\,')
  .replace(/\[/g,'\\[').replace(/\]/g,'\\]');

function captionY(plan:EditSegment,atSeconds:number){
  return shotLayoutAt(plan.shots,atSeconds)==='SPLIT_SCREEN'?910:1360;
}

async function assertCaptionBurnIn(before:string,after:string,
  plan:EditSegment,dir:string){
  if(plan.captions_required!==true||plan.caption_cues.length===0) return;
  const cue=plan.caption_cues.find((item)=>item.end-item.start>=0.2)
    ?? plan.caption_cues[0]!;
  const at=Math.max(cue.start+0.05,Math.min(cue.end-0.05,
    (cue.start+cue.end)/2));
  const y=captionY(plan,at);
  const top=Math.max(0,Math.min(1560,Math.round(y-180)));
  const beforePng=path.join(dir,'caption-proof-before.png');
  const afterPng=path.join(dir,'caption-proof-after.png');
  const crop=`crop=920:360:80:${top}`;
  await runV4Ffmpeg(['-y','-i',before,'-ss',String(at),'-frames:v','1',
    '-vf',crop,beforePng],false,30_000);
  await runV4Ffmpeg(['-y','-i',after,'-ss',String(at),'-frames:v','1',
    '-vf',crop,afterPng],false,30_000);
  const [base,final]=await Promise.all([
    sharp(beforePng).removeAlpha().raw().toBuffer({resolveWithObject:true}),
    sharp(afterPng).removeAlpha().raw().toBuffer({resolveWithObject:true}),
  ]);
  if(base.info.width!==final.info.width||base.info.height!==final.info.height
     ||base.info.channels!==final.info.channels){
    throw new Error('V4_RENDER_CAPTION_PROOF_GEOMETRY_MISMATCH');
  }
  let brightAdded=0;
  const channels=final.info.channels;
  for(let offset=0;offset<final.data.length;offset+=channels){
    const ar=final.data[offset]!,ag=final.data[offset+1]!,ab=final.data[offset+2]!;
    const br=base.data[offset]!,bg=base.data[offset+1]!,bb=base.data[offset+2]!;
    if(ar>=205&&ag>=205&&ab>=205&&(br<180||bg<180||bb<180)) brightAdded++;
  }
  if(brightAdded<120) throw new Error('V4_RENDER_CAPTIONS_NOT_VISIBLE');
}

/** Execute only the sealed EditPlan against the exact staged local segment. */
export async function renderV4EditSegment(source:string,output:string,
  rawPlan:unknown,dir:string){
  const plan=validateEditSegment(rawPlan);
  if(plan.start!==0) throw new Error('V4_RENDER_SEGMENT_MUST_START_ZERO');
  const shots:string[]=[];
  for(const [index,shot] of plan.shots.entries()){
    const part=path.join(dir,`shot-${index}.mp4`);
    await renderShot(source,part,shot,plan);
    shots.push(part);
  }
  const visual=path.join(dir,'visual.mp4');
  await concat(shots,visual,dir);

  const overlays:Overlay[]=[];
  if(plan.headline||(plan.disclosure&&plan.disclosure_mode==='opening')){
    const file=path.join(dir,'opening.png');
    await fsp.writeFile(file,await renderMomentCircuitOverlay({
      hook_line1:plan.headline?.text,disclosure:plan.disclosure,
      disclosure_mode:plan.disclosure_mode},'hook'));
    overlays.push({file,start:plan.headline?.start??0,
      end:plan.headline?.end??Math.min(plan.duration,1.8)});
  }
  if(plan.disclosure&&plan.disclosure_mode==='persistent'){
    const file=path.join(dir,'persistent-disclosure.png');
    await fsp.writeFile(file,await renderMomentCircuitOverlay({
      disclosure:plan.disclosure,disclosure_mode:'persistent'},'persistent'));
    overlays.push({file,start:0,end:plan.duration});
  }
  // Use explicit font-file drawtext filters rather than relying on libass font
  // discovery inside a serverless bundle. This keeps one video input while
  // avoiding the old full-resolution PNG input per caption cue.
  const font=path.join(process.cwd(),'bin','fonts','static','DMSans-700.ttf');
  const captionFiles=await Promise.all(plan.caption_cues.map(async(cue,index)=>{
    const lines=balancedNativeLines(cue.text,2,28);
    const file=path.join(dir,`caption-${index}.txt`);
    await fsp.writeFile(file,lines.join('\n'));
    return {cue,file,size:lines.some(line=>line.length>24)?50:58,
      y:captionY(plan,(cue.start+cue.end)/2)};
  }));

  const args=['-y','-i',visual];
  for(const overlay of overlays) args.push('-loop','1','-i',overlay.file);
  let filter='[0:v]format=yuv420p[v0]';
  let current='[v0]';
  for(const [index,caption] of captionFiles.entries()){
    const next=`[c${index+1}]`;
    const start=caption.cue.start.toFixed(3);
    const end=caption.cue.end.toFixed(3);
    filter+=`;${current}drawtext=fontfile='${escapeFilterPath(font)}':`
      +`textfile='${escapeFilterPath(caption.file)}':fontcolor=white:`
      +`fontsize=${caption.size}:borderw=4:bordercolor=black:`
      +`x=(w-text_w)/2:y=${caption.y}-text_h/2:line_spacing=5:`
      +`enable='between(t,${start},${end})'${next}`;
    current=next;
  }
  for(const [index,overlay] of overlays.entries()){
    const next=`[v${index+1}]`;
    filter+=`;${current}[${index+1}:v]overlay=0:0:enable='between(t,${overlay.start.toFixed(3)},${overlay.end.toFixed(3)})'${next}`;
    current=next;
  }
  args.push('-filter_complex',filter,'-map',current,'-map','0:a?',
    '-c:v','libx264','-crf','18','-preset','veryfast',
    '-c:a','aac','-b:a','192k','-movflags','+faststart',
    '-t',String(plan.duration),'-shortest',output);
  await runV4Ffmpeg(args,false,180_000);
  await assertCaptionBurnIn(visual,output,plan,dir);
  return plan;
}
