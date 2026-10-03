import {NextResponse,type NextRequest} from 'next/server';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  catalogAuthorizedSource,materializeAuthorizedWindow,probeAuthorizedSource,
  type SourceBridgeJob
} from '@/lib/momentcircuit/v4-source-resolver';

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

function bridgeUrl(){
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'');
  if(!base) throw new Error('SUPABASE_URL_MISSING');
  return `${base}/functions/v1/momentcircuit-source-bridge`;
}

async function bridge(payload:Record<string,unknown>,timeoutMs=60_000){
  const secret=process.env.MOMENTCIRCUIT_RENDER_SECRET??'';
  if(!secret) throw new Error('SOURCE_RESOLVER_SECRET_MISSING');
  const response=await fetch(bridgeUrl(),{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-momentcircuit-resolver-secret':secret
    },
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(timeoutMs)
  });
  const text=await response.text();
  let body:Record<string,unknown>;
  try{body=JSON.parse(text) as Record<string,unknown>;}
  catch{body={raw_response:text.slice(0,500)};}
  if(!response.ok){
    throw new Error(`SOURCE_BRIDGE_${response.status}:${String(body.error??'UNKNOWN')}`);
  }
  return body;
}

async function uploadPublic(jobId:string,file:string){
  const objectPath=`momentcircuit/sources/${jobId}/${Date.now()}.mp4`;
  const signed=await bridge({action:'signedUpload',objectPath},30_000);
  const signedUrl=String(signed.signedUrl??'');
  const publicUrl=String(signed.publicUrl??'');
  if(!signedUrl||!publicUrl) throw new Error('SOURCE_SIGNED_UPLOAD_MISSING');
  const bytes=await fsp.readFile(file);
  const response=await fetch(signedUrl,{
    method:'PUT',
    headers:{
      'content-type':'video/mp4',
      'cache-control':'max-age=31536000',
      'x-upsert':'false'
    },
    body:new Uint8Array(bytes),
    signal:AbortSignal.timeout(120_000)
  });
  if(!response.ok) throw new Error(`SOURCE_UPLOAD_HTTP_${response.status}`);
  return publicUrl;
}

async function claimOne(){
  const listing=await bridge({action:'listQueued',limit:1},30_000);
  const jobs=Array.isArray(listing.jobs)?listing.jobs:[];
  if(!jobs.length) return null;
  const id=String((jobs[0] as Record<string,unknown>).id??'');
  if(!id) return null;
  const claimed=await bridge({action:'claim',id},30_000);
  return claimed.job as SourceBridgeJob|null;
}

async function processJob(job:SourceBridgeJob){
  const heartbeat=async()=>{await bridge({action:'heartbeat',id:job.id},20_000);};
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),`mc-source-${job.id}-`));
  try{
    let result:Record<string,unknown>;
    if(job.mode==='probe'){
      result=await probeAuthorizedSource(job,heartbeat);
    }else if(job.mode==='catalog'){
      result=await catalogAuthorizedSource(job,heartbeat);
    }else if(job.mode==='source_window'||job.mode==='segment'){
      const materialized=await materializeAuthorizedWindow(job,temp,heartbeat);
      const mediaUrl=await uploadPublic(job.id,materialized.media);
      result={...materialized,media:undefined,media_url:mediaUrl};
      delete (result as {media?:unknown}).media;
    }else{
      throw new Error(`SOURCE_MODE_NOT_SUPPORTED_IN_VERCEL:${job.mode}`);
    }
    await bridge({action:'complete',id:job.id,result},30_000);
    return {job_id:job.id,status:'ready',mode:job.mode,provider:job.provider};
  }catch(error){
    const message=error instanceof Error?error.message:'SOURCE_RESOLVER_UNKNOWN';
    try{
      await bridge({action:'fail',id:job.id,error:message.slice(-3500),retryable:true},30_000);
    }catch(reportError){
      const reportMessage=reportError instanceof Error?reportError.message:'FAIL_REPORT_UNKNOWN';
      throw new Error(`${message};FAIL_REPORT:${reportMessage}`,{cause:reportError});
    }
    return {job_id:job.id,status:'retry_or_failed',mode:job.mode,
      provider:job.provider,error:message.slice(0,500)};
  }finally{
    await fsp.rm(temp,{recursive:true,force:true}).catch(()=>undefined);
  }
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
    const job=await claimOne();
    if(!job) return NextResponse.json({ok:true,processed:0});
    const result=await processJob(job);
    return NextResponse.json({ok:result.status==='ready',processed:1,result});
  }catch(error){
    const message=error instanceof Error?error.message:'SOURCE_RESOLVER_UNKNOWN';
    return NextResponse.json({error:message},{status:message==='UNAUTHORIZED'?401:503});
  }
}
