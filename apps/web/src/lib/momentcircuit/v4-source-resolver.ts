import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runV4Ffmpeg,v4FfmpegBinaryPath} from './v4-stage-worker';

export type SourceBridgeJob={
  id:string;
  provider:'youtube'|'twitch_vod';
  source_url:string;
  mode:'probe'|'catalog'|'transcript'|'segment'|'source_window';
  start_seconds:number|null;
  end_seconds:number|null;
};

const EVENT_TITLE_WEIGHTS:Record<string,number>={
  'passed out':10,
  'kicked out':9,
  'broke down':8,
  'escaped':8,
  'fight':8,
  'challenge':6,
  'tattoo':4.5,
  'blindfold':3,
  'crush':1.5,
  'water park':3,
  'first':2,
  'lock in':2,
};

export function sourceTitlePriority(title:string|undefined,index:number,viewCount?:number|null){
  const normalized=(title??'').toLowerCase();
  let score=Math.max(0,3-index*0.22);
  for(const [term,weight] of Object.entries(EVENT_TITLE_WEIGHTS)){
    if(normalized.includes(term)) score+=weight;
  }
  if(typeof viewCount==='number'&&Number.isFinite(viewCount)&&viewCount>0){
    score+=Math.min(3,Math.max(0,Math.log10(viewCount+1)-2));
  }
  return Number(score.toFixed(4));
}

export type CatalogEntry={
  id:string|null;title:string|null;url:string;
  timestamp:unknown;upload_date:unknown;duration:unknown;view_count:unknown;
  catalog_index:number;source_priority_score:number;
};

export function sortSourceCatalogEntries(entries:CatalogEntry[]){
  return [...entries].sort((a,b)=>
    b.source_priority_score-a.source_priority_score
    ||a.catalog_index-b.catalog_index);
}

export function v4YtDlpBinaryPath(){
  const candidates=[
    path.join(process.cwd(),'bin','yt-dlp'),
    path.join(process.cwd(),'apps','web','bin','yt-dlp'),
    '/var/task/apps/web/bin/yt-dlp',
    '/var/task/bin/yt-dlp',
  ];
  const found=candidates.find(candidate=>fs.existsSync(candidate));
  if(!found) throw new Error('YTDLP_BINARY_MISSING');
  return found;
}

export async function runYtDlp(args:string[],heartbeat?:()=>Promise<void>,
  timeoutMs=220_000){
  return await new Promise<{stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(v4YtDlpBinaryPath(),args,{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timedOut=false,settled=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    const heartbeatTimer=heartbeat?setInterval(()=>{
      void heartbeat().catch(()=>undefined);
    },45_000):null;
    const cleanup=()=>{
      clearTimeout(timer);
      if(heartbeatTimer) clearInterval(heartbeatTimer);
    };
    child.stdout.on('data',chunk=>{
      stdout+=chunk.toString();
      if(stdout.length>4_000_000) stdout=stdout.slice(-4_000_000);
    });
    child.stderr.on('data',chunk=>{
      stderr+=chunk.toString();
      if(stderr.length>32_000) stderr=stderr.slice(-32_000);
    });
    child.on('error',()=>{
      if(settled) return; settled=true; cleanup();
      reject(new Error('YTDLP_LAUNCH_FAILED'));
    });
    child.on('exit',code=>{
      if(settled) return; settled=true; cleanup();
      if(timedOut) reject(new Error('YTDLP_TIMEOUT'));
      else if(code!==0) reject(new Error(`YTDLP_FAILED_${code??'UNKNOWN'}:${stderr.slice(-1200)}`));
      else resolve({stdout,stderr});
    });
  });
}

function compactMetadata(raw:Record<string,unknown>){
  const keep=['id','title','description','uploader','uploader_id','channel','channel_id',
    'duration','timestamp','upload_date','release_timestamp','webpage_url','original_url',
    'extractor','extractor_key','live_status','view_count','like_count','comment_count',
    'categories','tags'];
  const result:Record<string,unknown>={};
  for(const key of keep) if(raw[key]!==undefined&&raw[key]!==null) result[key]=raw[key];
  result.subtitle_languages=Object.keys((raw.subtitles??{}) as Record<string,unknown>).sort().slice(0,50);
  result.automatic_caption_languages=Object.keys(
    (raw.automatic_captions??{}) as Record<string,unknown>).sort().slice(0,50);
  return result;
}

export async function probeAuthorizedSource(job:SourceBridgeJob,
  heartbeat?:()=>Promise<void>){
  const {stdout}=await runYtDlp([
    '--dump-single-json','--skip-download','--no-warnings','--no-playlist',
    '--js-runtimes','node',job.source_url
  ],heartbeat,120_000);
  const raw=JSON.parse(stdout) as Record<string,unknown>;
  const webpage=String(raw.webpage_url??job.source_url);
  const fingerprint=crypto.createHash('sha256')
    .update(`${job.provider}:${String(raw.id??'')}:${webpage}`).digest('hex');
  return {provider:job.provider,mode:'probe',source_fingerprint:fingerprint,
    metadata:compactMetadata(raw),canonical_source_url:webpage,
    media_url:null,transcript_url:null};
}

export async function catalogAuthorizedSource(job:SourceBridgeJob,
  heartbeat?:()=>Promise<void>){
  if(job.provider!=='youtube') throw new Error('CATALOG_PROVIDER_UNSUPPORTED');
  const {stdout}=await runYtDlp([
    '--flat-playlist','--playlist-end','12','--dump-single-json','--no-warnings',
    '--js-runtimes','node',job.source_url
  ],heartbeat,120_000);
  const raw=JSON.parse(stdout) as Record<string,unknown>;
  const rawEntries=Array.isArray(raw.entries)?raw.entries:[];
  const entries:CatalogEntry[]=[];
  rawEntries.forEach((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)) return;
    const item=value as Record<string,unknown>;
    const id=String(item.id??'').trim();
    let url=typeof item.webpage_url==='string'?item.webpage_url:
      typeof item.url==='string'?item.url:'';
    if(url&&!url.startsWith('http')&&id) url=`https://www.youtube.com/watch?v=${id}`;
    if(!url&&id) url=`https://www.youtube.com/watch?v=${id}`;
    if(!url) return;
    const viewCount=Number(item.view_count);
    entries.push({
      id:id||null,title:typeof item.title==='string'?item.title:null,url,
      timestamp:item.timestamp??null,upload_date:item.upload_date??null,
      duration:item.duration??null,view_count:Number.isFinite(viewCount)?viewCount:null,
      catalog_index:index,
      source_priority_score:sourceTitlePriority(
        typeof item.title==='string'?item.title:undefined,index,
        Number.isFinite(viewCount)?viewCount:null),
    });
  });
  if(!entries.length) throw new Error('AUTHORIZED_CATALOG_EMPTY');
  const sorted=sortSourceCatalogEntries(entries);
  const webpage=String(raw.webpage_url??job.source_url);
  const fingerprint=crypto.createHash('sha256')
    .update(`${job.provider}:catalog:${job.source_url}`).digest('hex');
  return {provider:job.provider,mode:'catalog',source_fingerprint:fingerprint,
    canonical_source_url:webpage,media_url:null,transcript_url:null,
    entries:sorted.slice(0,12),
    metadata:{id:raw.id??null,title:raw.title??null,
      uploader:raw.uploader??raw.channel??null,channel_id:raw.channel_id??null,
      entry_count:sorted.length}};
}

async function findMedia(dir:string){
  const names=await fsp.readdir(dir);
  const candidates=names.filter(name=>/^segment\./.test(name)
    &&/\.(mp4|mkv|webm|mov)$/i.test(name));
  if(!candidates.length) throw new Error('SOURCE_WINDOW_OUTPUT_MISSING');
  const stats=await Promise.all(candidates.map(async name=>({
    file:path.join(dir,name),stat:await fsp.stat(path.join(dir,name))
  })));
  stats.sort((a,b)=>b.stat.size-a.stat.size);
  return stats[0]!.file;
}

export async function materializeAuthorizedWindow(job:SourceBridgeJob,dir:string,
  heartbeat?:()=>Promise<void>){
  const start=Number(job.start_seconds),end=Number(job.end_seconds);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>180){
    throw new Error('SOURCE_WINDOW_BOUNDS_INVALID');
  }
  const output=path.join(dir,'segment.%(ext)s');
  const ffmpegDir=path.dirname(v4FfmpegBinaryPath());
  const attempt=async(format:string)=>{
    await runYtDlp([
      '--no-warnings','--no-playlist','--js-runtimes','node',
      '--ffmpeg-location',ffmpegDir,
      '--download-sections',`*${start}-${end}`,
      '--force-keyframes-at-cuts','-f',format,
      '--merge-output-format','mp4','-o',output,job.source_url
    ],heartbeat,220_000);
  };
  try{
    await attempt(job.mode==='source_window'
      ?'bv*[height<=720]+ba/b[height<=720]/best'
      :'bv*[height<=1080]+ba/b[height<=1080]/best');
  }catch{
    await attempt('134+140/b[height<=360]/best');
  }
  let media=await findMedia(dir);
  if(path.extname(media).toLowerCase()!=='.mp4'){
    const converted=path.join(dir,'segment-normalized.mp4');
    await runV4Ffmpeg(['-y','-i',media,'-c:v','libx264','-preset','veryfast',
      '-crf','20','-c:a','aac','-b:a','160k','-movflags','+faststart',converted],
      false,90_000);
    media=converted;
  }
  const stat=await fsp.stat(media);
  if(stat.size<1000||stat.size>150_000_000) throw new Error('SOURCE_WINDOW_SIZE_INVALID');
  const fingerprint=crypto.createHash('sha256')
    .update(`${job.provider}:${job.source_url}:${start.toFixed(3)}:${end.toFixed(3)}`)
    .digest('hex');
  return {media,provider:job.provider,mode:'segment',
    source_fingerprint:fingerprint,canonical_source_url:job.source_url,
    transcript_url:null,segment:{start_seconds:start,end_seconds:end,
      duration_seconds:end-start},bytes:stat.size};
}
