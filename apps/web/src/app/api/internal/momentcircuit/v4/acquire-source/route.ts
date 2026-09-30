import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {uploadPrivateContentAddressed} from '@/lib/momentcircuit/v4-private-upload';
import {
  assertSourceLease,fetchAuthorizedSourceBytes,parseV4SourceRequest,
  parseSourceProbe,v4SourceObjectPath
} from '@/lib/momentcircuit/v4-source-acquisition';
import {V4_PRIVATE_BUCKET} from '@/lib/momentcircuit/v4-segment-stage';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

type CurrentSource={source_url:string;provider_fingerprint:string;
  campaign_contract_id:string;source_manifest_id:string;rights_state:string;
  brief_snapshot_id:string;brief_hash:string;rights_valid_until:string;
  market_snapshot_id:string};

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
  return {url,key,client:createClient(url,key,{auth:{persistSession:false}})};
}

function ffmpegBinary(){
  const candidates=[path.join(process.cwd(),'bin','ffmpeg'),
    path.join(process.cwd(),'apps','web','bin','ffmpeg'),
    '/var/task/apps/web/bin/ffmpeg','/var/task/bin/ffmpeg'];
  const found=candidates.find((candidate)=>fs.existsSync(candidate));
  if(!found) throw new Error('FFMPEG_BINARY_MISSING');
  return found;
}

async function probeSourceVideo(bytes:Buffer){
  const temporary=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-v4-source-'));
  try{
    const file=path.join(temporary,'source.mp4');
    await fsp.writeFile(file,bytes);
    const stderr=await new Promise<string>((resolve,reject)=>{
      const child=spawn(ffmpegBinary(),['-hide_banner','-i',file],
        {stdio:['ignore','ignore','pipe']});
      let output='';
      let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},20_000);
      child.stderr.on('data',(chunk)=>{
        output+=chunk.toString();
        if(output.length>16000) output=output.slice(-16000);
      });
      child.on('error',()=>{clearTimeout(timer);reject(new Error('SOURCE_PROBE_LAUNCH_FAILED'));});
      child.on('exit',()=>{
        clearTimeout(timer);
        if(timedOut) reject(new Error('SOURCE_PROBE_TIMEOUT'));
        else resolve(output);
      });
    });
    return parseSourceProbe(stderr);
  }finally{await fsp.rm(temporary,{recursive:true,force:true}).catch(()=>undefined);}
}

async function execute(body:unknown){
  const {jobId,worker,leaseEpoch}=parseV4SourceRequest(body);
  const {client,url,key}=database();
  try{
    const {data:job,error:jobError}=await client.from('momentcircuit_v4_jobs')
      .select('*').eq('id',jobId).maybeSingle();
    if(jobError||!job) throw new Error('SOURCE_JOB_MISSING');
    const {data:work,error:workError}=await client.from('momentcircuit_v4_work')
      .select('*').eq('id',String(job.work_id)).maybeSingle();
    const {data:sourceRequest,error:requestError}=await client
      .from('momentcircuit_v4_source_requests').select('*')
      .eq('source_work_id',String(job.work_id)).maybeSingle();
    if(workError||!work||requestError||!sourceRequest){
      throw new Error('SOURCE_WORK_OR_REQUEST_MISSING');
    }
    const readCurrent=async()=>{
      const {data,error}=await client.rpc('momentcircuit_v4_current_source_request',{
        p_source_work_id:work.id}).single();
      if(error||!data) throw new Error('SOURCE_RIGHTS_OR_BUDGET_NOT_CURRENT');
      return data as CurrentSource;
    };
    const current=await readCurrent();
    assertSourceLease({job,work,request:sourceRequest,current,
      worker,leaseEpoch,now:Date.now()});
    let source;
    try{source=await fetchAuthorizedSourceBytes(current.source_url);}
    catch(error){
      if(!(error instanceof Error)||error.message!=='SOURCE_URL_EXPIRED_OR_DENIED') throw error;
      const refreshed=await readCurrent();
      assertSourceLease({job,work,request:sourceRequest,current:refreshed,
        worker,leaseEpoch,now:Date.now()});
      if(refreshed.source_url===current.source_url) throw error;
      source=await fetchAuthorizedSourceBytes(refreshed.source_url);
    }
    const durationSeconds=await probeSourceVideo(source.bytes);
    const stillCurrent=await readCurrent();
    assertSourceLease({job,work,request:sourceRequest,current:stillCurrent,
      worker,leaseEpoch,now:Date.now()});
    const {data:bucket,error:bucketError}=await client.storage.getBucket(V4_PRIVATE_BUCKET);
    if(bucketError||!bucket||bucket.public) throw new Error('PRIVATE_SOURCE_BUCKET_REQUIRED');
    const objectPath=v4SourceObjectPath(work.id,source.sha256,source.contentType);
    const storage=client.storage.from(V4_PRIVATE_BUCKET);
    try{
      await uploadPrivateContentAddressed(source.bytes,objectPath,key,url,source.contentType);
    }catch{
      // An unknown TUS completion can be adopted only after exact byte readback.
      const {data:existing,error:existingError}=await storage.download(objectPath);
      if(existingError||!existing) throw new Error('SOURCE_UPLOAD_UNKNOWN');
      const known=Buffer.from(await existing.arrayBuffer());
      if(known.length!==source.bytes.length
        ||crypto.createHash('sha256').update(known).digest('hex')!==source.sha256){
        throw new Error('SOURCE_OBJECT_CONFLICT');
      }
    }
    const {data:stored,error:storedError}=await storage.download(objectPath);
    if(storedError||!stored) throw new Error('SOURCE_READBACK_UNAVAILABLE');
    const storedBytes=Buffer.from(await stored.arrayBuffer());
    if(storedBytes.length!==source.bytes.length
      ||crypto.createHash('sha256').update(storedBytes).digest('hex')!==source.sha256){
      throw new Error('SOURCE_READBACK_SHA_MISMATCH');
    }
    const latest=await readCurrent();
    assertSourceLease({job,work,request:sourceRequest,current:latest,
      worker,leaseEpoch,now:Date.now()});
    const rightsEvidence={authorization_ref:`legacy-manifest:${latest.source_manifest_id}`,
      source_manifest_id:latest.source_manifest_id,
      campaign_contract_id:latest.campaign_contract_id,
      brief_snapshot_id:latest.brief_snapshot_id,brief_hash:latest.brief_hash,
      rights_state:latest.rights_state,market_snapshot_id:latest.market_snapshot_id};
    const {data:registered,error:registerError}=await client.rpc(
      'momentcircuit_v4_register_source_asset',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_source_fingerprint:latest.provider_fingerprint,
        p_storage_bucket:V4_PRIVATE_BUCKET,p_storage_path:objectPath,
        p_content_type:source.contentType,p_size_bytes:source.bytes.length,
        p_full_source_sha256:source.sha256,p_rights_evidence:rightsEvidence,
        p_rights_valid_until:latest.rights_valid_until
      });
    if(registerError||!registered) throw new Error('SOURCE_REGISTRATION_REJECTED');
    const {data:completed,error:completeError}=await client.rpc(
      'momentcircuit_v4_complete_job',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_event:'SOURCE_READY',p_evidence:{
          source_fingerprint:latest.provider_fingerprint,source_sha256:source.sha256,
          storage_bucket:V4_PRIVATE_BUCKET,storage_path:objectPath,
          market_snapshot_id:latest.market_snapshot_id
        }
      });
    if(completeError||!completed) throw new Error('SOURCE_READY_NOT_CONFIRMED');
    return {work_id:work.id,source_sha256:source.sha256,
      duration_seconds:durationSeconds,
      size_bytes:source.bytes.length,storage_bucket:V4_PRIVATE_BUCKET,
      storage_path:objectPath,registered,completed};
  }catch(error){
    const message=error instanceof Error?error.message:'SOURCE_WORKER_UNKNOWN';
    const failureClass=/SOURCE_EXCEEDS_BOUNDED_ADAPTER|PRIVATE_SOURCE_BUCKET|FFMPEG_BINARY|SOURCE_OBJECT_CONFLICT|SOURCE_READBACK_SHA_MISMATCH/.test(message)
      ?'SYSTEMIC':/RIGHTS|BUDGET|IDENTITY|ORIGIN/.test(message)
        ?'COMPLIANCE':/SOURCE_MEDIA|SOURCE_BYTES_TOO_SMALL|SOURCE_VIDEO_DURATION/.test(message)
          ?'SOURCE_BAD':'TRANSIENT';
    try{
      await client.rpc('momentcircuit_v4_fail_job',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_failure_class:failureClass,p_error:message
      });
    }catch{/* A stale or completed lease is reconciled by the queue owner. */}
    throw error;
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    return NextResponse.json({ok:true,...await execute(await request.json())});
  }catch(error){
    const message=error instanceof Error?error.message:'SOURCE_WORKER_UNKNOWN';
    const status=message==='UNAUTHORIZED'?401:message==='SOURCE_REQUEST_INVALID'?400:503;
    return NextResponse.json({error:message},{status});
  }
}
