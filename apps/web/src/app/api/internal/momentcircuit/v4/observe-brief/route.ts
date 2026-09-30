import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {fetchPublicBrief} from '@/lib/momentcircuit/v4-public-brief';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=90;

const WORKER='halyard-v4-brief';

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

export async function POST(request:NextRequest){
  try{
    authorize(request);
    let body:unknown;
    try{body=await request.json();}catch{throw new Error('BRIEF_REQUEST_INVALID');}
    if(!body||typeof body!=='object'||Array.isArray(body)
      ||(body as Record<string,unknown>).claim_one!==true){
      throw new Error('BRIEF_REQUEST_INVALID');
    }
    const client=database();
    const {data:claimed,error:claimError}=await client.rpc(
      'momentcircuit_v4_claim_public_brief',{
        p_worker:WORKER,p_lease_seconds:120});
    if(claimError||!Array.isArray(claimed)) throw new Error('BRIEF_CLAIM_FAILED');
    if(claimed.length===0) return NextResponse.json({ok:true,processed:0});
    const claim=claimed[0] as {campaign_contract_id:string;
      document_id:string;baseline_sha256:string;lease_epoch:number};
    try{
      const observed=await fetchPublicBrief(claim.document_id);
      const {data:completed,error:completeError}=await client.rpc(
        'momentcircuit_v4_complete_public_brief',{
          p_campaign_contract_id:claim.campaign_contract_id,p_worker:WORKER,
          p_lease_epoch:Number(claim.lease_epoch),
          p_sha256:observed.sha256,p_size_bytes:observed.sizeBytes});
      if(completeError||!completed) throw new Error('BRIEF_COMPLETION_FAILED');
      return NextResponse.json({ok:true,processed:1,
        campaign_contract_id:claim.campaign_contract_id,
        sha256:observed.sha256,size_bytes:observed.sizeBytes,
        baseline_match:observed.sha256===claim.baseline_sha256,
        completed});
    }catch(error){
      const message=error instanceof Error?error.message:'BRIEF_UNKNOWN';
      try{await client.rpc('momentcircuit_v4_fail_public_brief',{
        p_campaign_contract_id:claim.campaign_contract_id,p_worker:WORKER,
        p_lease_epoch:Number(claim.lease_epoch),p_error:message});}
      catch{/* A completed or expired lease is reconciled by the next tick. */}
      throw error;
    }
  }catch(error){
    const message=error instanceof Error?error.message:'BRIEF_UNKNOWN';
    const status=message==='UNAUTHORIZED'?401:
      message==='BRIEF_REQUEST_INVALID'?400:503;
    return NextResponse.json({error:message},{status});
  }
}
