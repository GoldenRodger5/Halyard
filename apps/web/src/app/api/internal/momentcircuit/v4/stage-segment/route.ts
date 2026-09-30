import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {
  V4_PRIVATE_BUCKET,assertStageEligibility,parseFfmpegDuration,
  parseV4StageRequest,signedStorageUrlAllowed,v4SegmentObjectPath
} from '@/lib/momentcircuit/v4-segment-stage';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

function authorize(request:NextRequest){
  const expected=process.env.MOMENTCIRCUIT_RENDER_SECRET??'';
  const actual=request.headers.get('x-momentcircuit-render-secret')??'';
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(!actual||!expected||a.length!==b.length||!crypto.timingSafeEqual(a,b)){
    throw new Error('UNAUTHORIZED');
  }
}

function database(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return {url,client:createClient(url,key,{auth:{persistSession:false}})};
}

function ffmpegBinary(){
  const candidates=[path.join(process.cwd(),'bin','ffmpeg'),
    path.join(process.cwd(),'apps','web','bin','ffmpeg'),
    '/var/task/apps/web/bin/ffmpeg','/var/task/bin/ffmpeg'];
  const found=candidates.find((candidate)=>fs.existsSync(candidate));
  if(!found) throw new Error('FFMPEG_BINARY_MISSING');
  return found;
}

function runFfmpeg(args:string[],allowNonzero=false){
  return new Promise<string>((resolve,reject)=>{
    const child=spawn(ffmpegBinary(),args,{stdio:['ignore','ignore','pipe']});
    let stderr='';
    child.stderr.on('data',(chunk)=>{
      stderr+=chunk.toString();
      if(stderr.length>16000) stderr=stderr.slice(-16000);
    });
    child.on('error',()=>reject(new Error('FFMPEG_LAUNCH_FAILED')));
    child.on('exit',(code)=>{
      if(code===0||allowNonzero) resolve(stderr);
      else reject(new Error(`FFMPEG_SEGMENT_FAILED_${code??'UNKNOWN'}`));
    });
  });
}

async function execute(body:unknown){
  const {jobId,worker,leaseEpoch}=parseV4StageRequest(body);
  const {client,url}=database();
  const {data:job,error:jobError}=await client.from('momentcircuit_v4_jobs')
    .select('*').eq('id',jobId).maybeSingle();
  if(jobError||!job) throw new Error('VISUAL_JOB_MISSING');
  const {data:work,error:workError}=await client.from('momentcircuit_v4_work')
    .select('*').eq('id',String(job.work_id)).maybeSingle();
  if(workError||!work) throw new Error('CLIP_WORK_MISSING');
  const {data:source,error:sourceError}=await client.from('momentcircuit_v4_work')
    .select('*').eq('id',String(work.parent_source_work_id)).maybeSingle();
  if(sourceError||!source) throw new Error('SOURCE_WORK_MISSING');
  const {data:moment,error:momentError}=await client.from('momentcircuit_v4_moments')
    .select('*').eq('id',String(work.candidate_moment_id)).maybeSingle();
  if(momentError||!moment) throw new Error('REGISTERED_MOMENT_MISSING');
  const {data:contract,error:contractError}=await client.from('momentcircuit_v4_current_contract')
    .select('*').eq('work_id',work.id).maybeSingle();
  const {data:asset,error:assetError}=await client.from('momentcircuit_v4_source_assets')
    .select('*').eq('source_work_id',source.id).maybeSingle();
  if(contractError||!contract||assetError||!asset) throw new Error('STAGE_CONTRACT_OR_ASSET_MISSING');
  const window=assertStageEligibility({
    job,work,source,moment,contract,asset,worker,leaseEpoch,now:Date.now()
  });
  const {data:bucket,error:bucketError}=await client.storage.getBucket(V4_PRIVATE_BUCKET);
  if(bucketError||!bucket||bucket.public) throw new Error('PRIVATE_SOURCE_BUCKET_REQUIRED');
  const {data:signed,error:signedError}=await client.storage
    .from(V4_PRIVATE_BUCKET).createSignedUrl(String(asset.storage_path),900);
  if(signedError||!signed?.signedUrl||!signedStorageUrlAllowed(signed.signedUrl,url)){
    throw new Error('SOURCE_SIGNED_URL_UNAVAILABLE');
  }
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-v4-segment-'));
  try{
    const output=path.join(temp,'segment.mp4');
    await runFfmpeg(['-y','-ss',String(window.start),'-t',String(window.duration),
      '-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','5',
      '-rw_timeout','30000000','-i',signed.signedUrl,
      '-map','0:v:0','-map','0:a?','-c:v','libx264','-crf','18','-preset','veryfast',
      '-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',output]);
    const probe=await runFfmpeg(['-i',output],true);
    const duration=parseFfmpegDuration(probe);
    if(duration<Number(contract.min_video_seconds)
      ||(contract.max_video_seconds!==null&&duration>Number(contract.max_video_seconds))){
      throw new Error('ENCODED_SEGMENT_OUTSIDE_CAMPAIGN_SPEC');
    }
    const stat=await fsp.stat(output);
    if(stat.size<1000||stat.size>300_000_000) throw new Error('SEGMENT_SIZE_INVALID');
    const bytes=await fsp.readFile(output);
    const sha=crypto.createHash('sha256').update(bytes).digest('hex');
    const objectPath=v4SegmentObjectPath(String(work.id),sha);
    const storage=client.storage.from(V4_PRIVATE_BUCKET);
    const {error:uploadError}=await storage.upload(objectPath,bytes,{
      contentType:'video/mp4',cacheControl:'3600',upsert:false
    });
    if(uploadError){
      if(!/already exists|duplicate/i.test(uploadError.message)){
        throw new Error('SEGMENT_UPLOAD_FAILED');
      }
      const {data:existing,error:downloadError}=await storage.download(objectPath);
      if(downloadError||!existing) throw new Error('SEGMENT_REPLAY_READ_FAILED');
      const existingBytes=Buffer.from(await existing.arrayBuffer());
      if(existingBytes.length!==bytes.length
        ||crypto.createHash('sha256').update(existingBytes).digest('hex')!==sha){
        throw new Error('SEGMENT_OBJECT_CONFLICT');
      }
    }
    const {data:registered,error:registerError}=await client.rpc('momentcircuit_v4_stage_segment',{
      p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
      p_start:window.start,p_end:window.end,p_duration:duration,
      p_sha256:sha,p_size_bytes:bytes.length,
      p_storage_bucket:V4_PRIVATE_BUCKET,p_storage_path:objectPath
    });
    if(registerError||!registered) throw new Error('SEGMENT_REGISTRATION_REJECTED');
    return {work_id:work.id,job_id:jobId,segment_sha256:sha,
      duration_seconds:duration,size_bytes:bytes.length,
      storage_bucket:V4_PRIVATE_BUCKET,storage_path:objectPath,
      registered};
  }finally{
    await fsp.rm(temp,{recursive:true,force:true}).catch(()=>undefined);
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    const result=await execute(await request.json());
    return NextResponse.json({ok:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:'STAGE_FAILED';
    const failureClass=message==='UNAUTHORIZED'||message==='STAGE_REQUEST_INVALID'
      ?null
      :/CAMPAIGN_SPEC|SOURCE_NATIVE_WINDOW|ENCODED_SEGMENT/.test(message)
        ?'MOMENT_BAD'
        :/RIGHTS|CURRENT_CONTRACT/.test(message)
          ?'COMPLIANCE'
          :/PRIVATE_SOURCE_BUCKET|FFMPEG_BINARY|SEGMENT_OBJECT_CONFLICT/.test(message)
            ?'SYSTEMIC':'TRANSIENT';
    const status=message==='UNAUTHORIZED'?401
      :message==='STAGE_REQUEST_INVALID'?400
        :failureClass==='SYSTEMIC'||failureClass==='TRANSIENT'?503:409;
    return NextResponse.json({error:message,failure_class:failureClass},{status});
  }
}
