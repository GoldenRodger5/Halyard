import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {parseV4StageRequest} from '@/lib/momentcircuit/v4-segment-stage';
import {applyV4RepairPlan} from '@/lib/momentcircuit/v4-repair-plan';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=120;

const WORKER='halyard-v4-repair';

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

function release(){
  return process.env.VERCEL_GIT_COMMIT_SHA??process.env.HALYARD_RELEASE??
    'v4-repair-local';
}

async function processJob(body:unknown){
  const {jobId,worker,leaseEpoch}=parseV4StageRequest(body);
  const client=database();
  const {data:job,error:je}=await client.from('momentcircuit_v4_jobs')
    .select('id,work_id,kind,status,lease_owner,lease_epoch,lease_until')
    .eq('id',jobId).maybeSingle();
  if(je||!job||job.kind!=='repair_planner') throw new Error('REPAIR_JOB_MISSING');
  if(job.status==='DONE'){
    const {data:event,error:ee}=await client.from('momentcircuit_v4_events')
      .select('event,evidence').eq('job_id',jobId).maybeSingle();
    if(ee||!event||!['REVISION_READY','REPAIR_UNAVAILABLE'].includes(event.event)){
      throw new Error('REPAIR_DONE_EVENT_MISSING');
    }
    return {work_id:job.work_id,duplicate:true,event};
  }
  if(job.status!=='LEASED'||job.lease_owner!==worker
    ||Number(job.lease_epoch)!==leaseEpoch
    ||Date.parse(String(job.lease_until))<=Date.now()){
    throw new Error('REPAIR_LEASE_INVALID');
  }
  try{
    const {data:work,error:we}=await client.from('momentcircuit_v4_work')
      .select('id,work_kind,state,current_artifact_id,latest_qc_id')
      .eq('id',String(job.work_id)).maybeSingle();
    if(we||!work||work.work_kind!=='clip'||work.state!=='REPAIR_REQUIRED'){
      throw new Error('REPAIR_WORK_NOT_READY');
    }
    const [qcResult,planResult,revisionResult]=await Promise.all([
      client.from('momentcircuit_v4_exact_final_qc').select('*')
        .eq('work_id',work.id).eq('qc_verdict_id',work.latest_qc_id)
        .maybeSingle(),
      client.from('momentcircuit_v4_edit_plans').select('*')
        .eq('work_id',work.id).eq('revision',1).maybeSingle(),
      client.from('momentcircuit_v4_edit_plans')
        .select('id,registered_by_job_id,segment_sha256,plan_sha256,planner_release')
        .eq('work_id',work.id).eq('revision',2).maybeSingle()
    ]);
    const qc=qcResult.data,first=planResult.data,
      existing=revisionResult.data;
    if(qcResult.error||planResult.error||revisionResult.error||!qc||!first
      ||qc.verdict!=='LOCAL_FAIL'||qc.artifact_id!==work.current_artifact_id){
      throw new Error('REPAIR_LOCAL_QC_EVIDENCE_MISSING');
    }
    const {error:liveError}=await client.rpc('momentcircuit_v4_assert_clip_live',{
      p_work_id:work.id});
    if(liveError) throw new Error('REPAIR_CURRENT_CONTRACT_HOLD');
    if(existing&&(existing.registered_by_job_id!==jobId
      ||existing.segment_sha256!==first.segment_sha256)){
      throw new Error('REPAIR_EXISTING_REVISION_CONFLICT');
    }
    let registered:{plan_id:string;plan_sha256:string};
    let plannerRelease:string;
    if(existing){
      // Registration may have committed before an HTTP timeout or worker
      // restart. The sealed revision and its original release are authority.
      registered={plan_id:String(existing.id),
        plan_sha256:String(existing.plan_sha256)};
      plannerRelease=String(existing.planner_release);
    }else{
      const evidence=qc.evidence as Record<string,unknown>;
      const visual=evidence.visual as Record<string,unknown>|undefined;
      const suggestion=visual?.repair_plan;
      const repair=applyV4RepairPlan(first.edit_plan,suggestion);
      if(!repair){
        const {data:retired,error:re}=await client.rpc(
          'momentcircuit_v4_complete_job',{
            p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
            p_event:'REPAIR_UNAVAILABLE',p_evidence:{
              prior_qc_id:qc.qc_verdict_id,
              reason:'No safe bounded crop or existing-headline revision fixes this defect'}});
        if(re||!retired) throw new Error('REPAIR_RETIRE_REJECTED');
        return {work_id:work.id,retired:true,reason:'NO_SAFE_LOCAL_REPAIR'};
      }
      plannerRelease=release();
      const {data:sealed,error:registerError}=await client.rpc(
        'momentcircuit_v4_register_repair_plan',{
          p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
          p_plan:repair.plan,p_planner_model:String(qc.critic_model),
          p_planner_release:plannerRelease,p_reason:repair.reason});
      if(registerError||!sealed){
        throw new Error('REPAIR_PLAN_REGISTRATION_REJECTED');
      }
      registered={plan_id:String(sealed.plan_id),
        plan_sha256:String(sealed.plan_sha256)};
    }
    const {data:completed,error:ce}=await client.rpc('momentcircuit_v4_complete_job',{
      p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
      p_event:'REVISION_READY',p_evidence:{
        plan_id:registered.plan_id,plan_sha256:registered.plan_sha256,
        segment_sha256:first.segment_sha256,
        planner_release:plannerRelease,prior_qc_id:qc.qc_verdict_id}});
    if(ce||!completed) throw new Error('REPAIR_REVISION_COMPLETION_REJECTED');
    return {work_id:work.id,plan_id:registered.plan_id,
      plan_sha256:registered.plan_sha256,completed};
  }catch(error){
    const message=error instanceof Error?error.message:'REPAIR_UNKNOWN';
    const klass=/CONTRACT|RIGHTS|BUDGET|CAMPAIGN/.test(message)
      ?'COMPLIANCE':/REGISTRATION|COMPLETION/.test(message)?'TRANSIENT':'SYSTEMIC';
    const {error:failureError}=await client.rpc('momentcircuit_v4_fail_job',{
      p_job_id:jobId,p_worker:worker,p_lease_epoch:leaseEpoch,
      p_failure_class:klass,p_error:message});
    if(failureError) throw new Error(`REPAIR_FAILURE_RECORD_REJECTED:${message}`,
      {cause:error});
    throw error;
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    let body:unknown;
    try{body=await request.json();}catch{throw new Error('REPAIR_REQUEST_INVALID');}
    if(body&&typeof body==='object'&&!Array.isArray(body)
      &&(body as Record<string,unknown>).claim_one===true){
      const client=database();
      const {data:claimed,error:ce}=await client.rpc('momentcircuit_v4_claim_jobs',{
        p_kind:'repair_planner',p_worker:WORKER,p_limit:1,p_lease_seconds:600});
      if(ce||!Array.isArray(claimed)) throw new Error('REPAIR_CLAIM_FAILED');
      if(claimed.length===0) return NextResponse.json({ok:true,processed:0});
      const claim=claimed[0] as {job_id:string;lease_epoch:number};
      const result=await processJob({job_id:claim.job_id,worker:WORKER,
        lease_epoch:Number(claim.lease_epoch)});
      return NextResponse.json({ok:true,processed:1,...result});
    }
    const result=await processJob(body);
    return NextResponse.json({ok:true,processed:1,...result});
  }catch(error){
    const message=error instanceof Error?error.message:'REPAIR_UNKNOWN';
    return NextResponse.json({error:message},{status:message==='UNAUTHORIZED'?401:
      message==='REPAIR_REQUEST_INVALID'||message==='STAGE_REQUEST_INVALID'?400:503});
  }
}
