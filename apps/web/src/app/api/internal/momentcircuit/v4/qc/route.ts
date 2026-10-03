import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sampleTimesWithCues} from '@/lib/momentcircuit/quality-repair';
import {parseFfmpegDuration,parseV4StageRequest,V4_PRIVATE_BUCKET}
  from '@/lib/momentcircuit/v4-segment-stage';
import {runV4Ffmpeg} from '@/lib/momentcircuit/v4-stage-worker';
import {critiqueV4Final,evaluateV4Final,type FinalFrame}
  from '@/lib/momentcircuit/v4-exact-final-qc';
import {reserveHalyardSpend,settleHalyardSpend} from '@/lib/halyard-spend-guard';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

const WORKER='halyard-v4-qc';
const MAX_BYTES=300_000_000;

function release(){
  return process.env.VERCEL_GIT_COMMIT_SHA??process.env.HALYARD_RELEASE??
    'v4-qc-local';
}

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
  return createClient(url,key,{auth:{persistSession:false}});
}

function failureClass(message:string){
  if(/CONTRACT|RIGHTS|BUDGET|CAMPAIGN|POLICY/.test(message)) return 'COMPLIANCE';
  if(/SHA|METADATA|TECHNICAL|GENERATION|FRAME_INSPECTION|FFMPEG/.test(message)){
    return 'SYSTEMIC';
  }
  return 'TRANSIENT';
}

async function transcribeFinalAudio(file:string){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new Error('OPENAI_API_KEY_MISSING_FOR_QC');
  const bytes=await fsp.readFile(file);
  if(bytes.length<1000) throw new Error('QC_AUDIO_EMPTY');
  const form=new FormData();
  form.set('model','gpt-transcribe');
  form.set('response_format','json');
  form.set('file',new Blob([new Uint8Array(bytes)],{type:'audio/mpeg'}),
    'exact-final-audio.mp3');
  const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
    method:'POST',headers:{authorization:`Bearer ${key}`},body:form,
    signal:AbortSignal.timeout(90_000)});
  const body=await response.json() as {text?:string;error?:{message?:string}};
  if(!response.ok) throw new Error(`AUDIO_QC_${response.status}:${body.error?.message??'unknown'}`);
  return String(body.text??'').trim();
}

async function inspectMedia(video:string,dir:string,duration:number,
  cues:Array<{start:number;end:number;text:string}>){
  const audio=path.join(dir,'final-audio.mp3');
  await runV4Ffmpeg(['-y','-i',video,'-vn','-ac','1','-ar','16000',
    '-c:a','libmp3lame','-b:a','64k',audio],false,30_000);
  const transcript=await transcribeFinalAudio(audio);
  const frames:FinalFrame[]=[];
  for(const [index,at] of sampleTimesWithCues(duration,cues).entries()){
    const file=path.join(dir,`frame-${index}.jpg`);
    await runV4Ffmpeg(['-y','-ss',String(at),'-i',video,'-frames:v','1',
      '-vf','scale=720:-2','-q:v','3',file],false,20_000);
    const bytes=await fsp.readFile(file);
    if(bytes.length<1000) throw new Error('QC_FRAME_DECODE_FAILED');
    frames.push({at_seconds:at,bytes});
  }
  return {transcript,frames};
}

async function processJob(body:unknown){
  const {jobId,worker,leaseEpoch}=parseV4StageRequest(body);
  const client=database();
  const {data:job,error:je}=await client.from('momentcircuit_v4_jobs')
    .select('id,work_id,kind,status,lease_owner,lease_epoch,lease_until')
    .eq('id',jobId).maybeSingle();
  if(je||!job||job.kind!=='qc_worker') throw new Error('QC_JOB_MISSING');
  if(job.status==='DONE'){
    const {data:receipt,error:re}=await client.from('momentcircuit_v4_exact_final_qc')
      .select('id,qc_verdict_id,media_sha256').eq('qc_job_id',jobId).maybeSingle();
    if(re||!receipt) throw new Error('QC_DONE_RECEIPT_MISSING');
    return {work_id:job.work_id,duplicate:true,receipt};
  }
  if(job.status!=='LEASED'||job.lease_owner!==worker
    ||Number(job.lease_epoch)!==leaseEpoch
    ||Date.parse(String(job.lease_until))<=Date.now()){
    throw new Error('QC_LEASE_INVALID');
  }
  try{
    const {data:work,error:we}=await client.from('momentcircuit_v4_work')
      .select('id,work_kind,state,platform,campaign_contract_id,candidate_moment_id,source_sha256,media_sha256,current_artifact_id')
      .eq('id',String(job.work_id)).maybeSingle();
    if(we||!work||work.work_kind!=='clip'||work.state!=='QC'){
      throw new Error('QC_WORK_NOT_READY');
    }
    const {error:liveError}=await client.rpc('momentcircuit_v4_assert_clip_live',{
      p_work_id:work.id});
    if(liveError) throw new Error('QC_CURRENT_CONTRACT_HOLD');
    const [mediaResult,contractResult,visualResult]=await Promise.all([
      client.from('momentcircuit_v4_rendered_media').select('*')
        .eq('work_id',work.id).eq('artifact_id',work.current_artifact_id).maybeSingle(),
      client.from('momentcircuit_v4_current_contract')
        .select('qc_policy_version,min_video_seconds,max_video_seconds')
        .eq('work_id',work.id).maybeSingle(),
      client.from('momentcircuit_v4_events').select('evidence')
        .eq('work_id',work.id).eq('event','CANDIDATE_VERIFIED')
        .order('state_version',{ascending:false}).limit(1).maybeSingle()
    ]);
    const media=mediaResult.data,contract=contractResult.data,
      visual=visualResult.data;
    if(mediaResult.error||contractResult.error||visualResult.error
      ||!media||!contract||!visual||media.media_sha256!==work.media_sha256
      ||media.artifact_id!==work.current_artifact_id
      ||media.storage_bucket!==V4_PRIVATE_BUCKET){
      throw new Error('QC_EXACT_RENDER_RECEIPT_MISSING');
    }
    const {data:request,error:requestError}=await client
      .from('momentcircuit_v4_render_requests').select('*')
      .eq('id',String(media.render_request_id)).maybeSingle();
    if(requestError||!request||request.request_sha256!==media.request_sha256){
      throw new Error('QC_RENDER_REQUEST_CHANGED');
    }
    const {data:plan,error:planError}=await client
      .from('momentcircuit_v4_edit_plans')
      .select('id,plan_sha256,segment_sha256,edit_plan,post_caption')
      .eq('id',String(request.plan_id)).maybeSingle();
    if(planError||!plan||plan.plan_sha256!==request.plan_sha256
      ||plan.segment_sha256!==request.segment_sha256){
      throw new Error('QC_EDIT_PLAN_CHANGED');
    }
    const editPlan=plan.edit_plan as Record<string,unknown>;
    const cues=(Array.isArray(editPlan.caption_cues)?editPlan.caption_cues:[])
      .flatMap((value:unknown)=>{
        if(!value||typeof value!=='object') return [];
        const cue=value as Record<string,unknown>;
        const start=Number(cue.start),end=Number(cue.end),text=String(cue.text??'').trim();
        return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&text
          ?[{start,end,text}]:[];
      });
    if(editPlan.captions_required===true&&cues.length===0){
      throw new Error('QC_REQUIRED_CAPTIONS_MISSING');
    }
    const {data:bucket,error:be}=await client.storage.getBucket(V4_PRIVATE_BUCKET);
    if(be||!bucket||bucket.public) throw new Error('QC_PRIVATE_BUCKET_REQUIRED');
    const {data:stored,error:se}=await client.storage.from(V4_PRIVATE_BUCKET)
      .download(String(media.storage_path));
    if(se||!stored) throw new Error('QC_MEDIA_UNAVAILABLE');
    const bytes=Buffer.from(await stored.arrayBuffer());
    const sha=crypto.createHash('sha256').update(bytes).digest('hex');
    if(bytes.length!==Number(media.size_bytes)||bytes.length>MAX_BYTES
      ||sha!==media.media_sha256){
      throw new Error('QC_MEDIA_SHA_MISMATCH');
    }
    const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-v4-qc-'));
    try{
      const video=path.join(dir,'exact-final.mp4');
      await fsp.writeFile(video,bytes);
      const probe=await runV4Ffmpeg(['-i',video],true,20_000);
      const duration=parseFfmpegDuration(probe);
      const dimensions=probe.match(/Video:\s*h264[^\n]*?\b(\d{3,5})x(\d{3,5})\b/);
      const width=Number(dimensions?.[1]),height=Number(dimensions?.[2]);
      const audioPresent=/Audio:\s*[a-zA-Z0-9_.-]+/.test(probe);
      const technicalPass=width===1080&&height===1920&&audioPresent
        &&Math.abs(duration-Number(media.duration_seconds))<=0.03
        &&duration>=Number(contract.min_video_seconds)
        &&(contract.max_video_seconds===null
          ||duration<=Number(contract.max_video_seconds));
      if(!technicalPass) throw new Error('QC_TECHNICAL_METADATA_MISMATCH');
      const spendReservation=await reserveHalyardSpend(client,{
        provider:'openai',purpose:'momentcircuit_v4_exact_final_qc',maxUsd:3.00,
        metadata:{critic_model:'gpt-5.5',transcriber:'gpt-transcribe',job_id:jobId,work_id:work.id},
      });
      const {transcript,frames}=await inspectMedia(video,dir,duration,cues);
      const review=await critiqueV4Final({frames,platform:String(work.platform),
        story_claim:String(visual.evidence?.story_claim??''),
        payoff:String(visual.evidence?.payoff??''),
        expected_captions:cues.map((cue:{text:string})=>cue.text),
        presentation_mode:String(editPlan.presentation_mode??'')});
      await settleHalyardSpend(client,spendReservation,{result:'v4_exact_final_paid_stages_completed'});
      const evaluated=evaluateV4Final({review,
        captions:cues.map((cue:{text:string})=>cue.text),transcript,
        technicalPass});
      const evidence={rendered_media_id:media.id,artifact_id:media.artifact_id,
        media_sha256:media.media_sha256,plan_id:plan.id,
        qc_worker_release:release(),
        plan_sha256:plan.plan_sha256,segment_sha256:plan.segment_sha256,
        render_request_sha256:request.request_sha256,
        technical:{pass:true,readback_sha256:sha,width,height,codec:'h264',
          duration_seconds:duration,size_bytes:bytes.length,audio_present:audioPresent},
        audio:{alignment_pass:evaluated.alignment.pass,
          transcript_sha256:evaluated.transcript_sha256,
          transcript_model:'gpt-transcribe',alignment:evaluated.alignment},
        visual:{pass:review.pass,story_match:review.story_match,
          caption_visual_quality:review.caption_visual_quality,
          professional_quality:review.professional_quality,
          text_bounds_pass:review.text_bounds_pass,
          cold_viewer_clarity:review.cold_viewer_clarity,
          first_second_hook:review.first_second_hook,
          payoff_complete:review.payoff_complete,
          ending_complete:review.ending_complete,
          artifact_scan_pass:review.artifact_scan_pass,
          summary:review.summary,repair_plan:review.repair_plan},
        frames:review.frames,defects:evaluated.defects};
      const {data:result,error:re}=await client.rpc(
        'momentcircuit_v4_register_exact_final_qc',{
          p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
          p_rendered_media_id:media.id,p_media_sha256:sha,
          p_qc_policy_version:contract.qc_policy_version,
          p_verdict:evaluated.verdict,p_critic_model:'gpt-5.5',
          p_analysis_id:crypto.randomUUID(),p_evidence:evidence});
      if(re||!result) throw new Error('QC_RECEIPT_REJECTED');
      return {work_id:work.id,media_sha256:sha,verdict:evaluated.verdict,
        exact_final_qc:result};
    }finally{await fsp.rm(dir,{recursive:true,force:true}).catch(()=>undefined);}
  }catch(error){
    const message=error instanceof Error?error.message:'QC_UNKNOWN';
    const klass=failureClass(message);
    const failure=klass==='SYSTEMIC'
      ?await client.rpc('momentcircuit_v4_fail_systemic_job',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_lane:'qc',p_release:release(),p_failure_scope:'QC_SYSTEMIC',
        p_error:message,p_evidence:{job_id:jobId,error:message}})
      :await client.rpc('momentcircuit_v4_fail_job',{
        p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
        p_failure_class:klass,p_error:message});
    if(failure.error) throw new Error(`QC_FAILURE_RECORD_REJECTED:${message}`,
      {cause:error});
    throw error;
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    let body:unknown;
    try{body=await request.json();}catch{throw new Error('QC_REQUEST_INVALID');}
    if(body&&typeof body==='object'&&!Array.isArray(body)
      &&(body as Record<string,unknown>).claim_one===true){
      const client=database();
      const {data:claimed,error:ce}=await client.rpc('momentcircuit_v4_claim_jobs',{
        p_kind:'qc_worker',p_worker:WORKER,p_limit:1,p_lease_seconds:600});
      if(ce||!Array.isArray(claimed)) throw new Error('QC_CLAIM_FAILED');
      if(claimed.length===0) return NextResponse.json({ok:true,processed:0});
      const claim=claimed[0] as {job_id:string;lease_epoch:number};
      const result=await processJob({job_id:claim.job_id,worker:WORKER,
        lease_epoch:Number(claim.lease_epoch)});
      return NextResponse.json({ok:true,processed:1,...result});
    }
    const result=await processJob(body);
    return NextResponse.json({ok:true,processed:1,...result});
  }catch(error){
    const message=error instanceof Error?error.message:'QC_UNKNOWN';
    return NextResponse.json({error:message},{status:message==='UNAUTHORIZED'?401:
      message==='QC_REQUEST_INVALID'||message==='STAGE_REQUEST_INVALID'?400:503});
  }
}
