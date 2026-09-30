import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateEditSegment} from '@/lib/momentcircuit/edit-plan';
import {renderV4EditSegment} from '@/lib/momentcircuit/v4-render-engine';
import {parseFfmpegDuration,parseV4StageRequest,V4_PRIVATE_BUCKET}
  from '@/lib/momentcircuit/v4-segment-stage';
import {runV4Ffmpeg} from '@/lib/momentcircuit/v4-stage-worker';
import {uploadPrivateContentAddressed}
  from '@/lib/momentcircuit/v4-private-upload';
import {V4_RENDER_HEADROOM_SECONDS} from '@/lib/momentcircuit/v4-duration-policy';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

const WORKER='halyard-v4-render';
const MAX_BYTES=300_000_000;

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

function release(){
  return process.env.VERCEL_GIT_COMMIT_SHA??process.env.HALYARD_RELEASE??
    'v4-render-local';
}

function classifyFailure(message:string){
  if(/CONTRACT|RIGHTS|BUDGET|CAMPAIGN|SPEC|DISCLOSURE/.test(message)){
    return 'COMPLIANCE';
  }
  if(/FFMPEG|SEGMENT_SHA|OUTPUT_METADATA|RENDER_DURATION|RENDER_SIZE/.test(message)){
    return 'SYSTEMIC';
  }
  return 'TRANSIENT';
}

async function processJob(body:unknown){
  const {jobId,worker,leaseEpoch}=parseV4StageRequest(body);
  const {url,key,client}=database();
  const {data:job,error:je}=await client.from('momentcircuit_v4_jobs')
    .select('id,work_id,kind,status,idempotency_key,lease_owner,lease_epoch,lease_until')
    .eq('id',jobId).maybeSingle();
  if(je||!job||job.kind!=='renderer') throw new Error('RENDER_JOB_MISSING');
  if(job.status==='DONE'){
    const {data:receipt,error:re}=await client.from('momentcircuit_v4_rendered_media')
      .select('id,artifact_id,media_sha256').eq('rendered_by_job_id',jobId)
      .maybeSingle();
    if(re) throw new Error('RENDER_DONE_RECEIPT_MISSING');
    if(!receipt){
      const {data:retired,error:ee}=await client.from('momentcircuit_v4_events')
        .select('event,evidence').eq('job_id',jobId).maybeSingle();
      if(ee||retired?.event!=='REPAIR_NO_CHANGE'){
        throw new Error('RENDER_DONE_RECEIPT_MISSING');
      }
      return {work_id:job.work_id,duplicate:true,retired:true,
        reason:'REPAIR_NO_CHANGE',evidence:retired.evidence};
    }
    return {work_id:job.work_id,duplicate:true,receipt};
  }
  if(job.status!=='LEASED'||job.lease_owner!==worker
    ||Number(job.lease_epoch)!==leaseEpoch
    ||Date.parse(String(job.lease_until))<=Date.now()){
    throw new Error('RENDER_LEASE_INVALID');
  }
  try{
    const recoveryRelease=String(job.idempotency_key).split(':render-recovery:')[1]
      ?.split(':').at(-1);
    if(recoveryRelease&&recoveryRelease!==release()){
      throw new Error('RENDER_RECOVERY_RELEASE_MISMATCH');
    }
    const {data:work,error:we}=await client.from('momentcircuit_v4_work')
      .select('id,work_kind,state,platform,campaign_contract_id,candidate_moment_id,source_sha256,media_sha256,current_artifact_id')
      .eq('id',String(job.work_id)).maybeSingle();
    if(we||!work||work.work_kind!=='clip'||work.state!=='RENDERING'){
      throw new Error('RENDER_WORK_NOT_RENDERING');
    }
    const {error:liveError}=await client.rpc('momentcircuit_v4_assert_clip_live',{
      p_work_id:work.id});
    if(liveError) throw new Error('RENDER_CURRENT_CONTRACT_HOLD');
    const [segmentResult,contractResult,eventResult]=await Promise.all([
      client.from('momentcircuit_v4_segment_assets').select('*')
        .eq('work_id',work.id).maybeSingle(),
      client.from('momentcircuit_v4_current_contract')
        .select('min_video_seconds,max_video_seconds').eq('work_id',work.id)
        .maybeSingle(),
      client.from('momentcircuit_v4_events').select('evidence')
        .eq('work_id',work.id).eq('event','RENDER_START')
        .order('state_version',{ascending:false}).limit(1).maybeSingle()
    ]);
    const segment=segmentResult.data;
    const contract=contractResult.data,startEvent=eventResult.data;
    if(segmentResult.error||contractResult.error
      ||eventResult.error||!segment||!contract||!startEvent){
      throw new Error('RENDER_INPUT_MISSING');
    }
    const startEvidence=startEvent.evidence as Record<string,unknown>;
    const {data:renderRequest,error:requestError}=await client
      .from('momentcircuit_v4_render_requests').select('*')
      .eq('id',String(startEvidence.render_request_id??''))
      .eq('work_id',work.id).maybeSingle();
    if(requestError||!renderRequest) throw new Error('RENDER_REQUEST_MISSING');
    const {data:plan,error:pe}=await client.from('momentcircuit_v4_edit_plans')
      .select('id,revision,plan_sha256,segment_sha256,edit_plan')
      .eq('id',String(renderRequest.plan_id)).maybeSingle();
    if(pe||!plan) throw new Error('RENDER_PLAN_MISSING');
    const requestBody=renderRequest.render_request as Record<string,unknown>;
    const requestSegment=requestBody?.segment as Record<string,unknown>|undefined;
    const requestPlan=requestBody?.plan as Record<string,unknown>|undefined;
    const evidence=startEvidence;
    if(requestBody?.schema!=='v4-render-request-1'
      ||requestBody?.work_id!==work.id
      ||requestBody?.platform!==work.platform
      ||requestSegment?.bucket!==segment.storage_bucket
      ||requestSegment?.path!==segment.storage_path
      ||requestSegment?.sha256!==segment.source_sha256
      ||Number(requestSegment?.duration_seconds)!==Number(segment.duration_seconds)
      ||requestPlan?.id!==plan.id
      ||requestPlan?.sha256!==plan.plan_sha256
      ||renderRequest.plan_sha256!==plan.plan_sha256
      ||renderRequest.segment_sha256!==segment.source_sha256
      ||segment.source_sha256!==work.source_sha256
      ||plan.segment_sha256!==segment.source_sha256
      ||evidence?.render_request_id!==renderRequest.id
      ||evidence?.request_sha256!==renderRequest.request_sha256){
      throw new Error('RENDER_REQUEST_IDENTITY_MISMATCH');
    }
    const editPlan=validateEditSegment(plan.edit_plan);
    if(editPlan.start!==0
      ||Math.abs(editPlan.duration-Number(segment.duration_seconds))>0.06
      ||editPlan.duration<Number(contract.min_video_seconds)+V4_RENDER_HEADROOM_SECONDS
      ||Number(segment.duration_seconds)<Number(contract.min_video_seconds)+V4_RENDER_HEADROOM_SECONDS
      ||(contract.max_video_seconds!==null
        &&editPlan.duration>Number(contract.max_video_seconds))){
      throw new Error('RENDER_PLAN_OUTSIDE_CAMPAIGN_SPEC');
    }
    if(segment.storage_bucket!==V4_PRIVATE_BUCKET){
      throw new Error('RENDER_PRIVATE_SEGMENT_REQUIRED');
    }
    const {data:bucket,error:be}=await client.storage.getBucket(V4_PRIVATE_BUCKET);
    if(be||!bucket||bucket.public) throw new Error('RENDER_PRIVATE_BUCKET_REQUIRED');
    const {data:stored,error:se}=await client.storage.from(V4_PRIVATE_BUCKET)
      .download(String(segment.storage_path));
    if(se||!stored) throw new Error('RENDER_SEGMENT_UNAVAILABLE');
    const bytes=Buffer.from(await stored.arrayBuffer());
    if(bytes.length!==Number(segment.size_bytes)
      ||crypto.createHash('sha256').update(bytes).digest('hex')
        !==segment.source_sha256){
      throw new Error('RENDER_SEGMENT_SHA_MISMATCH');
    }
    const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-v4-render-'));
    try{
      const input=path.join(dir,'exact-segment.mp4');
      const output=path.join(dir,'rendered.mp4');
      await fsp.writeFile(input,bytes);
      await renderV4EditSegment(input,output,editPlan,dir);
      const stat=await fsp.stat(output);
      if(stat.size<1000||stat.size>MAX_BYTES){
        throw new Error('RENDER_SIZE_INVALID');
      }
      const probe=await runV4Ffmpeg(['-i',output],true,20_000);
      const duration=parseFfmpegDuration(probe);
      const dimensions=probe.match(/Video:\s*h264[^\n]*?\b(\d{3,5})x(\d{3,5})\b/);
      const width=Number(dimensions?.[1]),height=Number(dimensions?.[2]);
      const audioPresent=/Audio:\s*[a-zA-Z0-9_.-]+/.test(probe);
      if(width!==1080||height!==1920){
        throw new Error('RENDER_OUTPUT_METADATA_INVALID');
      }
      if(duration<Number(contract.min_video_seconds)
        ||(contract.max_video_seconds!==null
          &&duration>Number(contract.max_video_seconds))
        ||Math.abs(duration-editPlan.duration)>0.25){
        throw new Error('RENDER_DURATION_OUTSIDE_CAMPAIGN_SPEC');
      }
      const outputBytes=await fsp.readFile(output);
      const mediaSha=crypto.createHash('sha256').update(outputBytes).digest('hex');
      if(Number(plan.revision)===2 && mediaSha===work.media_sha256){
        const {data:retired,error:retireError}=await client.rpc(
          'momentcircuit_v4_complete_job',{
            p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
            p_event:'REPAIR_NO_CHANGE',p_evidence:{
              render_request_id:renderRequest.id,
              request_sha256:renderRequest.request_sha256,
              plan_id:plan.id,media_sha256:mediaSha,
              prior_artifact_id:work.current_artifact_id}});
        if(retireError||!retired) throw new Error('REPAIR_NO_CHANGE_RETIRE_REJECTED');
        return {work_id:work.id,media_sha256:mediaSha,retired:true,
          reason:'REPAIR_NO_CHANGE'};
      }
      const objectPath=`momentcircuit/renders/${work.id}/${mediaSha}.mp4`;
      try{
        await uploadPrivateContentAddressed(outputBytes,objectPath,key,url);
      }catch{
        // A timed-out upload is UNKNOWN until the exact remote bytes are read.
        const {data:existing,error:downloadError}=await client.storage
          .from(V4_PRIVATE_BUCKET).download(objectPath);
        if(downloadError||!existing) throw new Error('RENDER_UPLOAD_UNKNOWN');
        const existingBytes=Buffer.from(await existing.arrayBuffer());
        if(existingBytes.length!==outputBytes.length
          ||crypto.createHash('sha256').update(existingBytes).digest('hex')!==mediaSha){
          throw new Error('RENDER_OBJECT_CONFLICT');
        }
      }
      const {data:readback,error:readbackError}=await client.storage
        .from(V4_PRIVATE_BUCKET).download(objectPath);
      if(readbackError||!readback) throw new Error('RENDER_READBACK_UNAVAILABLE');
      const readbackBytes=Buffer.from(await readback.arrayBuffer());
      if(readbackBytes.length!==outputBytes.length
        ||crypto.createHash('sha256').update(readbackBytes).digest('hex')!==mediaSha){
        throw new Error('RENDER_READBACK_SHA_MISMATCH');
      }
      const technical={probe_duration_seconds:duration,width,height,
        video_codec:'h264',audio_present:audioPresent,
        output_bytes:outputBytes.length,readback_sha256:mediaSha,
        source_segment_sha256:segment.source_sha256,
        plan_sha256:plan.plan_sha256,render_request_sha256:renderRequest.request_sha256};
      const {data:registered,error:re}=await client.rpc(
        'momentcircuit_v4_register_rendered_media',{
          p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
          p_request_sha256:renderRequest.request_sha256,
          p_media_sha256:mediaSha,p_size_bytes:outputBytes.length,
          p_duration_seconds:duration,p_width:width,p_height:height,
          p_video_codec:'h264',p_audio_present:audioPresent,
          p_storage_bucket:V4_PRIVATE_BUCKET,p_storage_path:objectPath,
          p_render_release:release(),p_technical_evidence:technical});
      if(re||!registered) throw new Error('RENDER_RECEIPT_REJECTED');
      return {work_id:work.id,media_sha256:mediaSha,
        rendered_media:registered};
    }finally{await fsp.rm(dir,{recursive:true,force:true}).catch(()=>undefined);}
  }catch(error){
    const message=error instanceof Error?error.message:'RENDER_UNKNOWN';
    const klass=classifyFailure(message);
    const failure=klass==='SYSTEMIC'
      ?await client.rpc('momentcircuit_v4_fail_systemic_job',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_lane:'renderer',p_release:release(),
        p_failure_scope:'RENDER_SYSTEMIC',p_error:message,
        p_evidence:{job_id:jobId,error:message}})
      :await client.rpc('momentcircuit_v4_fail_job',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_failure_class:klass,p_error:message});
    if(failure.error) throw new Error(`RENDER_FAILURE_RECORD_REJECTED:${message}`,
      {cause:error});
    throw error;
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    let body:unknown;
    try{body=await request.json();}catch{throw new Error('RENDER_REQUEST_INVALID');}
    if(body&&typeof body==='object'&&!Array.isArray(body)
      &&(body as Record<string,unknown>).claim_one===true){
      const {client}=database();
      const {data:claimed,error:ce}=await client.rpc('momentcircuit_v4_claim_jobs',{
        p_kind:'renderer',p_worker:WORKER,p_limit:1,p_lease_seconds:600});
      if(ce||!Array.isArray(claimed)) throw new Error('RENDER_CLAIM_FAILED');
      if(claimed.length===0) return NextResponse.json({ok:true,processed:0});
      const claim=claimed[0] as {job_id:string;lease_epoch:number};
      const result=await processJob({job_id:claim.job_id,worker:WORKER,
        lease_epoch:Number(claim.lease_epoch)});
      return NextResponse.json({ok:true,processed:1,...result});
    }
    const result=await processJob(body);
    return NextResponse.json({ok:true,processed:1,...result});
  }catch(error){
    const message=error instanceof Error?error.message:'RENDER_UNKNOWN';
    return NextResponse.json({error:message},{status:message==='UNAUTHORIZED'?401:
      message==='RENDER_REQUEST_INVALID'||message==='STAGE_REQUEST_INVALID'?400:503});
  }
}
