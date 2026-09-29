import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {candidateSegmentObjectPath,sourceSegmentHostAllowed,validateSourceSegment} from '@/lib/momentcircuit/source-segment';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
const BUCKET='halyard-assets';

function db(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url,key,{auth:{persistSession:false}});
}
function secureEqual(a:string,b:string){
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
function authorize(req:NextRequest){
  const expected=process.env.MOMENTCIRCUIT_RENDER_SECRET??'',actual=req.headers.get('x-momentcircuit-render-secret')??'';
  if(!expected||!actual||!secureEqual(expected,actual)) throw new Error('UNAUTHORIZED');
}
function ffmpeg(){
  const candidates=[path.join(process.cwd(),'bin','ffmpeg'),path.join(process.cwd(),'apps','web','bin','ffmpeg'),'/var/task/apps/web/bin/ffmpeg','/var/task/bin/ffmpeg'];
  const found=candidates.find((x)=>fs.existsSync(x));
  if(!found) throw new Error('FFMPEG_BINARY_MISSING');
  return found;
}
function run(args:string[]){
  return new Promise<void>((resolve,reject)=>{
    const child=spawn(ffmpeg(),args,{stdio:['ignore','ignore','pipe']});let err='';
    child.stderr.on('data',(d)=>{err+=d.toString();if(err.length>12000)err=err.slice(-12000);});
    child.on('error',reject);
    child.on('exit',(code)=>code===0?resolve():reject(new Error(`FFMPEG_FAILED_${code}: ${err.slice(-4000)}`)));
  });
}

async function execute(candidateId:string){
  const client=db();
  const {data:ctl,error:ctlErr}=await client.from('momentcircuit_pipeline_control').select('generation,active_run_id,lease_expires_at').eq('singleton',true).maybeSingle();
  if(ctlErr||!ctl?.active_run_id) throw new Error('NO_ACTIVE_RUN');

  const {data:cm,error:cmErr}=await client.from('momentcircuit_candidate_moments')
    .select('id,generation,run_id,campaign_contract_id,source_manifest_id,story_family,start_seconds,end_seconds,status,semantic_state')
    .eq('id',candidateId).maybeSingle();
  if(cmErr||!cm) throw new Error('CANDIDATE_NOT_FOUND');
  if(Number(cm.generation)!==Number(ctl.generation)) throw new Error('STALE_GENERATION');
  if(!['verified','selected'].includes(String(cm.status))||!String(cm.semantic_state??'').toUpperCase().startsWith('VERIFIED')) throw new Error('CANDIDATE_NOT_VERIFIED');

  const {data:manifest,error:mErr}=await client.from('momentcircuit_source_manifests')
    .select('id,generation,campaign_contract_id,source_url,rights_state,access_state,metadata')
    .eq('id',cm.source_manifest_id).maybeSingle();
  if(mErr||!manifest) throw new Error('SOURCE_MANIFEST_NOT_FOUND');
  if(!String(manifest.rights_state??'').startsWith('AUTHORIZED')) throw new Error('SOURCE_RIGHTS_NOT_AUTHORIZED');
  if(!sourceSegmentHostAllowed(String(manifest.source_url))) throw new Error('SOURCE_ORIGIN_NOT_ALLOWED');

  const {data:cc,error:ccErr}=await client.from('momentcircuit_campaign_contracts')
    .select('id,campaign_id,campaign_name,source_work_allowed,publish_allowed,valid_until')
    .eq('id',cm.campaign_contract_id).eq('generation',ctl.generation).maybeSingle();
  if(ccErr||!cc||!cc.source_work_allowed||!cc.publish_allowed) throw new Error('CAMPAIGN_CONTRACT_NOT_EXECUTABLE');

  const {data:spec}=await client.rpc('momentcircuit_candidate_campaign_spec_gate',{p_candidate_moment_id:candidateId});
  if(!spec?.pass) throw new Error('CANDIDATE_CAMPAIGN_SPEC_NOT_PASS');

  const {data:budget}=await client.rpc('momentcircuit_campaign_budget_health',{p_campaign_id:cc.campaign_id,p_scheduled_at:new Date(Date.now()+30*60*1000).toISOString()});
  if(!budget?.allow) throw new Error(`CAMPAIGN_BUDGET_BLOCKED:${budget?.reason??'UNKNOWN'}`);

  const window=validateSourceSegment(cm.start_seconds,cm.end_seconds);
  const work=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-source-segment-'));
  try{
    const out=path.join(work,'segment.mp4');
    const args=['-y','-ss',String(window.start),'-t',String(window.duration),
      '-user_agent','MomentCircuitSourceSegment/1.0','-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','5','-rw_timeout','30000000',
      '-i',String(manifest.source_url),'-map','0:v:0','-map','0:a?','-c:v','libx264','-crf','18','-preset','veryfast','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',out];
    await run(args);
    const bytes=await fsp.readFile(out);
    if(bytes.byteLength<1000) throw new Error('SOURCE_SEGMENT_EMPTY');
    const sha=crypto.createHash('sha256').update(bytes).digest('hex');
    const objectPath=candidateSegmentObjectPath(String(cc.campaign_id),candidateId,sha);
    const {error:upErr}=await client.storage.from(BUCKET).upload(objectPath,bytes,{contentType:'video/mp4',cacheControl:'604800',upsert:false});
    if(upErr&&!String(upErr.message??'').toLowerCase().includes('already exists')) throw new Error(`SOURCE_SEGMENT_UPLOAD_FAILED:${upErr.message}`);
    const publicUrl=client.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
    const release=process.env.VERCEL_GIT_COMMIT_SHA??process.env.HALYARD_RELEASE??'unknown';
    const {data:attached,error:aErr}=await client.rpc('momentcircuit_attach_durable_candidate_segment',{
      p_candidate_id:candidateId,p_media_url:publicUrl,p_sha256:sha,p_size_bytes:bytes.byteLength,p_content_type:'video/mp4',p_worker_release:release
    });
    if(aErr) throw new Error(`ATTACH_DURABLE_SEGMENT_FAILED:${aErr.message}`);
    return {candidate_id:candidateId,story_family:cm.story_family,duration_seconds:window.duration,size_bytes:bytes.byteLength,sha256:sha,media_url:publicUrl,attachment:attached};
  }finally{
    await fsp.rm(work,{recursive:true,force:true}).catch(()=>undefined);
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    const body=await request.json() as {candidate_id?:string};
    if(!body.candidate_id) return NextResponse.json({error:'candidate_id_required'},{status:400});
    return NextResponse.json({ok:true,...await execute(body.candidate_id)});
  }catch(error){
    const message=String(error instanceof Error?error.message:error);
    return NextResponse.json({error:message},{status:message==='UNAUTHORIZED'?401:500});
  }
}
