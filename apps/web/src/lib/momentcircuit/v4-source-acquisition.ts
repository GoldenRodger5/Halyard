import {V4_PRIVATE_BUCKET} from './v4-segment-stage';
import crypto from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const SOURCE_HOSTS=['amazonaws.com','cloudfront.net','supabase.co'];
export const V4_SOURCE_MAX_BYTES=150_000_000;
export const V4_PRIVATE_STORAGE_PASSTHROUGH_BYTES=52_000_000;
export const V4_PRIVATE_STORAGE_TARGET_BYTES=44_000_000;
export const V4_NORMALIZED_AUDIO_KBPS=160;

export function v4SourceStoragePlan(sizeBytes:number,durationSeconds:number){
  if(!Number.isFinite(sizeBytes)||sizeBytes<1000
    ||!Number.isFinite(durationSeconds)||durationSeconds<=0){
    throw new Error('SOURCE_STORAGE_PLAN_INVALID');
  }
  if(sizeBytes<=V4_PRIVATE_STORAGE_PASSTHROUGH_BYTES){
    return {normalize:false,targetBytes:sizeBytes,videoKbps:null,
      audioKbps:null as number|null};
  }
  const totalKbps=Math.floor(
    (V4_PRIVATE_STORAGE_TARGET_BYTES*8)/(durationSeconds*1000)
  );
  const videoKbps=Math.min(12_000,Math.max(2_500,
    totalKbps-V4_NORMALIZED_AUDIO_KBPS));
  return {normalize:true,targetBytes:V4_PRIVATE_STORAGE_TARGET_BYTES,
    videoKbps,audioKbps:V4_NORMALIZED_AUDIO_KBPS};
}

export const V4_SOURCE_NORMALIZATION_VERSION='v1-private-storage-50mib';

export function v4SourceNormalizationArgs(input:{
  videoKbps:number;audioKbps:number;inputPath:string;outputPath:string;
}){
  if(!Number.isFinite(input.videoKbps)||input.videoKbps<2_500
    ||!Number.isFinite(input.audioKbps)||input.audioKbps<64
    ||!input.inputPath||!input.outputPath){
    throw new Error('SOURCE_NORMALIZATION_PLAN_INVALID');
  }
  return ['-hide_banner','-loglevel','error','-y','-i',input.inputPath,
    '-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','veryfast',
    '-profile:v','high','-pix_fmt','yuv420p',
    '-b:v',`${Math.round(input.videoKbps)}k`,
    '-maxrate',`${Math.round(input.videoKbps*1.12)}k`,
    '-bufsize',`${Math.round(input.videoKbps*2)}k`,
    '-c:a','aac','-b:a',`${Math.round(input.audioKbps)}k`,
    '-movflags','+faststart','-map_metadata','-1','-map_chapters','-1',
    input.outputPath];
}

export function assertNormalizedSourceFitsStorage(input:{
  sizeBytes:number;originalDurationSeconds:number;normalizedDurationSeconds:number;
}){
  if(!Number.isFinite(input.sizeBytes)
    ||input.sizeBytes<1000
    ||input.sizeBytes>V4_PRIVATE_STORAGE_PASSTHROUGH_BYTES){
    throw new Error('SOURCE_NORMALIZED_SIZE_INVALID');
  }
  if(!Number.isFinite(input.originalDurationSeconds)
    ||!Number.isFinite(input.normalizedDurationSeconds)
    ||Math.abs(input.originalDurationSeconds-input.normalizedDurationSeconds)>0.25){
    throw new Error('SOURCE_NORMALIZED_DURATION_DRIFT');
  }
}

export function parseV4SourceRequest(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('SOURCE_REQUEST_INVALID');
  const body=value as Record<string,unknown>;
  const jobId=body.job_id,worker=body.worker,leaseEpoch=body.lease_epoch;
  if(typeof jobId!=='string'||!UUID.test(jobId)
    ||typeof worker!=='string'||!/^[a-zA-Z0-9:_-]{3,120}$/.test(worker)
    ||!Number.isSafeInteger(leaseEpoch)||Number(leaseEpoch)<1){
    throw new Error('SOURCE_REQUEST_INVALID');
  }
  return {jobId,worker,leaseEpoch:Number(leaseEpoch)};
}

export function isClaimOneSourceRequest(value:unknown){
  return !!value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).length===1
    &&(value as Record<string,unknown>).claim_one===true;
}

export function sourceUrlAllowed(raw:string){
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password
      ||(url.port&&url.port!=='443')) return false;
    const host=url.hostname.toLowerCase();
    return SOURCE_HOSTS.some((suffix)=>host===suffix||host.endsWith(`.${suffix}`));
  }catch{return false;}
}

export async function fetchAuthorizedSourceBytes(rawUrl:string){
  let next=rawUrl;
  for(let redirects=0;redirects<=3;redirects++){
    if(!sourceUrlAllowed(next)) throw new Error('SOURCE_ORIGIN_NOT_ALLOWED');
    let response:Response;
    try{
      response=await fetch(next,{redirect:'manual',cache:'no-store',
        signal:AbortSignal.timeout(90_000)});
    }catch{throw new Error('SOURCE_FETCH_TRANSPORT_UNKNOWN');}
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location) throw new Error('SOURCE_REDIRECT_INVALID');
      try{next=new URL(location,next).toString();}
      catch{throw new Error('SOURCE_REDIRECT_INVALID');}
      continue;
    }
    if(!response.ok||!response.body){
      throw new Error(response.status===403||response.status===410
        ?'SOURCE_URL_EXPIRED_OR_DENIED':'SOURCE_FETCH_UNAVAILABLE');
    }
    const declared=Number(response.headers.get('content-length'));
    if(Number.isFinite(declared)&&declared>V4_SOURCE_MAX_BYTES){
      throw new Error('SOURCE_EXCEEDS_BOUNDED_ADAPTER');
    }
    const reader=response.body.getReader();
    const chunks:Buffer[]=[];
    let size=0;
    const hash=crypto.createHash('sha256');
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        size+=value.byteLength;
        if(size>V4_SOURCE_MAX_BYTES) throw new Error('SOURCE_EXCEEDS_BOUNDED_ADAPTER');
        const chunk=Buffer.from(value);
        hash.update(chunk);chunks.push(chunk);
      }
    }catch(error){
      await reader.cancel().catch(()=>undefined);
      throw error;
    }finally{reader.releaseLock();}
    if(size<1000) throw new Error('SOURCE_BYTES_TOO_SMALL');
    const bytes=Buffer.concat(chunks,size);
    return {bytes,sha256:hash.digest('hex'),contentType:sourceMediaType(bytes)};
  }
  throw new Error('SOURCE_REDIRECT_LIMIT');
}

export function v4SourceObjectPath(workId:string,sha256:string,
  contentType:'video/mp4'|'video/quicktime'){
  if(!UUID.test(workId)||!SHA.test(sha256)) throw new Error('SOURCE_IDENTITY_INVALID');
  return `momentcircuit/sources/${workId}/${sha256}.${contentType==='video/mp4'?'mp4':'mov'}`;
}

export function sourceMediaType(bytes:Buffer):'video/mp4'|'video/quicktime'{
  if(bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp'){
    throw new Error('SOURCE_MEDIA_NOT_MP4_OR_QUICKTIME');
  }
  return bytes.toString('ascii',8,12)==='qt  '?'video/quicktime':'video/mp4';
}

export function parseSourceProbe(stderr:string){
  const match=stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if(!match||!/: Video: /.test(stderr)) throw new Error('SOURCE_VIDEO_PROBE_FAILED');
  const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  if(!Number.isFinite(seconds)||seconds<10||seconds>4*3600){
    throw new Error('SOURCE_VIDEO_DURATION_INVALID');
  }
  return Number(seconds.toFixed(3));
}

export function assertSourceLease(input:{
  job:{id:string;work_id:string;kind:string;status:string;lease_owner:string|null;
    lease_epoch:number;lease_until:string};
  work:{id:string;work_kind:string;state:string;campaign_contract_id:string};
  request:{source_work_id:string;campaign_contract_id:string;
    expected_provider_fingerprint:string};
  current:{campaign_contract_id:string;provider_fingerprint:string;
    source_url:string;rights_valid_until:string;source_manifest_id:string};
  worker:string;leaseEpoch:number;now:number;
}){
  const {job,work,request,current,worker,leaseEpoch,now}=input;
  const leaseUntil=Date.parse(job.lease_until);
  const rightsUntil=Date.parse(current.rights_valid_until);
  if(job.kind!=='source_worker'||job.status!=='LEASED'
    ||job.lease_owner!==worker||Number(job.lease_epoch)!==leaseEpoch
    ||!Number.isFinite(leaseUntil)||leaseUntil<=now||job.work_id!==work.id){
    throw new Error('SOURCE_LEASE_INVALID');
  }
  if(work.work_kind!=='source'||work.state!=='CAMPAIGN_SELECTED'
    ||request.source_work_id!==work.id
    ||request.campaign_contract_id!==work.campaign_contract_id
    ||current.campaign_contract_id!==work.campaign_contract_id
    ||current.provider_fingerprint!==request.expected_provider_fingerprint
    ||!UUID.test(current.source_manifest_id)
    ||!sourceUrlAllowed(current.source_url)
    ||!Number.isFinite(rightsUntil)||rightsUntil<=now+600_000){
    throw new Error('SOURCE_CURRENT_IDENTITY_OR_RIGHTS_INVALID');
  }
  return {bucket:V4_PRIVATE_BUCKET,rightsUntil};
}
