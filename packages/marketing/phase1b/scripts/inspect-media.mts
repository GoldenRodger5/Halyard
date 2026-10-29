import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, statSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('packages/marketing/phase1b');
const sha = (file:string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const reports = [];
for (const [name, frames] of [['egg',450],['popcorn',405]] as const) {
  const file = path.join(root,'review',name+'.mp4');
  const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
  const video = probe.streams.find((s:{codec_type:string})=>s.codec_type==='video');
  const audio = probe.streams.find((s:{codec_type:string})=>s.codec_type==='audio');
  if(video.width!==1080 || video.height!==1920 || video.nb_frames!==String(frames) || video.r_frame_rate!=='30/1' || video.codec_name!=='h264' || !['yuv420p','yuvj420p'].includes(video.pix_fmt) || audio.codec_name!=='aac' || audio.channels!==2) throw Error('Unexpected media format: '+name);
  const measured = spawnSync('ffmpeg',['-hide_banner','-i',file,'-af','loudnorm=I=-19:TP=-2:LRA=9:print_format=json','-f','null','-'],{encoding:'utf8'});
  if(measured.status!==0) throw Error('Audio inspection failed: '+name);
  const audioMeasurement=JSON.parse(measured.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)![0]);
  if(Number(audioMeasurement.input_tp)>=0) throw Error('Audio reaches clipping: '+name);
  const pcm=execFileSync('ffmpeg',['-v','error','-i',file,'-vn','-ar','48000','-ac','2','-f','s16le','-'],{maxBuffer:16*1024*1024});
  const rms=(a:number,b:number)=>{let sum=0,n=0;for(let i=Math.floor(a*48000)*4;i<Math.min(pcm.length,Math.floor(b*48000)*4);i+=2){sum+=(pcm.readInt16LE(i)/32768)**2;n++;}return 20*Math.log10(Math.sqrt(sum/n)+1e-12);};
  const windows=name==='egg'?[[4.35,4.8],[9.1,9.8],[11.4,11.9],[14.1,14.4]]:[[6.4,7],[8.02,8.27],[8.333333,8.6],[12.9,13.3]];
  const ebur=spawnSync('ffmpeg',['-hide_banner','-i',file,'-vn','-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8'});
  if(ebur.status!==0) throw Error('EBU R128 inspection failed.');
  const eburSummary=ebur.stderr.slice(ebur.stderr.lastIndexOf('Summary:')).split('[out#')[0]!.trim();
  reports.push({name,sha256:sha(file),bytes:statSync(file).size,probe,ebur128Summary:eburSummary,loudnormInputMeasurement:audioMeasurement,measurementNote:'EBU R128 is the canonical reporting meter. loudnorm input analysis retained separately; it uses a different analysis path.',encodedAudioRms:windows.map(([a,b])=>({from:a,to:b,dBFS:rms(a!,b!)}))});
}
// The common OCR readBack tokeniser ignores the two-letter 'OH.', returning no boxes.
// Retain that failed automatic result. Independently measure the actual encoded glyphs,
// under the SAME bounds, minimum height and WCAG threshold; do not weaken that gate.
const png = execFileSync('ffmpeg',['-v','error','-ss','14.1','-i',path.join(root,'review/egg.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{maxBuffer:32*1024*1024});
const crop = {left:90,top:280,width:830,height:240};
const {data,info} = await sharp(png).extract(crop).removeAlpha().raw().toBuffer({resolveWithObject:true});
const ink:Array<{x:number;y:number;rgb:number[]}> = [];
const bg:number[][] = [];
for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
  const i=(y*info.width+x)*info.channels;
  const rgb=[data[i]!,data[i+1]!,data[i+2]!];
  if(rgb[0]!>220 && rgb[1]!>210 && rgb[2]!>180) ink.push({x:x+crop.left,y:y+crop.top,rgb});
  else if(rgb[0]!<100 && rgb[1]!<130) bg.push(rgb);
}
if(!ink.length || !bg.length) throw Error('No independently measurable OH glyph/background pixels.');
const luminance=(rgb:number[])=>rgb.map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i]!,0);
const median=(a:number[])=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)]!;
const inkL=median(ink.map(p=>luminance(p.rgb))),bgL=median(bg.map(luminance));
const bounds={x0:Math.min(...ink.map(p=>p.x)),y0:Math.min(...ink.map(p=>p.y)),x1:Math.max(...ink.map(p=>p.x)),y1:Math.max(...ink.map(p=>p.y))};
const ratio=(inkL+.05)/(bgL+.05);
const measuredPassed=bounds.x0>=90&&bounds.y0>=240&&bounds.x1<=920&&bounds.y1<=1460&&bounds.y1-bounds.y0>=24&&ratio>=4.5;
if(!measuredPassed) throw Error('Independent OH pixel measurement fails original bounds/height/contrast.');
writeFileSync(path.join(root,'review/media-verification.json'),JSON.stringify({purpose:'Engineering support only, not a creative approval',exports:reports,ohSupplement:{automaticOcrResult:'Failed: zero boxes; retained in export-text-qa.json',scope:'Actual encoded14.1s frame, independent bright-ink region measurement and reviewer read-back; not a change to shared OCR gate',intended:'OH.',bounds,contrastRatio:ratio,minWordHeight:24,contrastThreshold:4.5,measuredPassed},providerCalls:0,providerSpendUsd:0,newSubscriptions:0,publicationApproved:false},null,2)+'\n');
console.log('Both actual media formats validated; OH independent encoded-pixel supplement:',bounds,ratio.toFixed(2)+':1');
