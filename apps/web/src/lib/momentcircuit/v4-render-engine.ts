import fsp from 'node:fs/promises';
import path from 'node:path';
import {renderMomentCircuitOverlay} from './overlay';
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
  for(const [index,cue] of plan.caption_cues.entries()){
    const file=path.join(dir,`caption-${index}.png`);
    const layout=shotLayoutAt(plan.shots,(cue.start+cue.end)/2);
    await fsp.writeFile(file,await renderMomentCircuitOverlay({
      caption_text:cue.text,
      caption_zone:layout==='SPLIT_SCREEN'?'CENTER_SEAM':'LOWER_MIDDLE'},
    'caption'));
    overlays.push({file,start:cue.start,end:cue.end});
  }

  const args=['-y','-i',visual];
  for(const overlay of overlays) args.push('-loop','1','-i',overlay.file);
  let filter='[0:v]format=yuv420p[v0]';
  let current='[v0]';
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
  return plan;
}
