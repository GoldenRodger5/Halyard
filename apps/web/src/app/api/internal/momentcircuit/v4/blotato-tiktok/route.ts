import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  buildSponsoredTikTokPost,
  chooseTikTokAccount,
  normalizeBlotatoStatus,
  parseBlotatoAccounts
} from './logic';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const API='https://backend.blotato.com/v2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256=/^[0-9a-f]{64}$/i;

function authorize(request:NextRequest){
  const expected=process.env.MOMENTCIRCUIT_RENDER_SECRET??'';
  const actual=request.headers.get('x-momentcircuit-render-secret')??'';
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(!actual||!expected||a.length!==b.length||!crypto.timingSafeEqual(a,b)){
    throw new Error('UNAUTHORIZED');
  }
}

function apiKey(){
  const key=process.env.BLOTATO_API_KEY??'';
  if(!key) throw new Error('BLOTATO_API_KEY_MISSING');
  return key;
}

function database(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url,key,{auth:{persistSession:false}});
}

async function existingStageReceipt(actionId:string){
  const {data,error}=await database()
    .from('momentcircuit_runtime_receipts')
    .select('payload')
    .eq('key','blotato_tiktok_stage:'+actionId)
    .maybeSingle();
  if(error) throw new Error('BLOTATO_STAGE_RECEIPT_LOOKUP_FAILED:'+error.message);
  return data?.payload&&typeof data.payload==='object'
    ?data.payload as Record<string,unknown>
    :null;
}

function definiteNoMutation(error:string){
  return /^BLOTATO_HTTP_(400|401|403|404|409|422|429):/.test(error);
}

async function persistStageReceipt(args:{
  actionId:string;
  readyId:string;
  sha:string;
  submissionId:string;
  accountId:string;
  scheduledAt:string;
  target:Record<string,unknown>;
}){
  let lastError:string|null=null;
  for(let attempt=1;attempt<=3;attempt++){
    const {error}=await database()
      .from('momentcircuit_runtime_receipts')
      .upsert({
        key:'blotato_tiktok_stage:'+args.actionId,
        payload:{
          state:'PROVIDER_SUBMITTED',
          provider:'blotato',
          platform:'tiktok',
          action_id:args.actionId,
          v4_ready_asset_id:args.readyId,
          media_sha256:args.sha,
          post_submission_id:args.submissionId,
          account_id:args.accountId,
          scheduled_at:args.scheduledAt,
          target:args.target,
          provider_mutation_occurred:true,
          completed_at:new Date().toISOString()
        },
        updated_at:new Date().toISOString()
      },{onConflict:'key'});
    if(!error) return {ok:true,attempts:attempt};
    lastError=error.message;
    await new Promise((resolve)=>setTimeout(resolve,attempt*250));
  }
  return {ok:false,attempts:3,error:lastError};
}

async function blotato(path:string,init:RequestInit={}){
  const response=await fetch(API+path,{
    ...init,
    headers:{
      'blotato-api-key':apiKey(),
      'content-type':'application/json',
      ...(init.headers??{})
    }
  });
  const text=await response.text();
  let body:unknown;
  try{body=text?JSON.parse(text):null}catch{body=text}
  if(!response.ok){
    const detail=typeof body==='string'
      ?body
      :JSON.stringify(body??{}).slice(0,500);
    throw new Error('BLOTATO_HTTP_'+response.status+':'+detail);
  }
  return body;
}

async function accounts(){
  return parseBlotatoAccounts(await blotato('/users/me/accounts'));
}

async function account(requestedId?:string|null){
  const all=await accounts();
  return chooseTikTokAccount(
    all,
    requestedId||(process.env.MOMENTCIRCUIT_BLOTATO_TIKTOK_ACCOUNT_ID??null)
  );
}

export async function POST(request:NextRequest){
  try{authorize(request)}catch{
    return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  }

  let body:Record<string,unknown>;
  try{
    const raw=await request.json();
    if(!raw||typeof raw!=='object') throw new Error();
    body=raw as Record<string,unknown>;
  }catch{
    return NextResponse.json({error:'BLOTATO_REQUEST_INVALID'},{status:400});
  }

  const action=String(body.action??'');
  try{
    if(action==='accounts'){
      const connected=(await accounts())
        .filter((acct)=>acct.platform==='tiktok')
        .map((acct)=>({
          id:acct.id,
          username:acct.username??null,
          fullname:acct.fullname??null
        }));
      return NextResponse.json({
        ok:true,
        provider:'blotato',
        platform:'tiktok',
        accounts:connected
      });
    }

    if(action==='health'){
      const requestedId=String(body.account_id??'').trim()||null;
      const acct=await account(requestedId);
      return NextResponse.json({
        ok:true,
        provider:'blotato',
        platform:'tiktok',
        account:{id:acct.id,username:acct.username??null,fullname:acct.fullname??null}
      });
    }

    if(action==='status'){
      const submissionId=String(body.submission_id??'').trim();
      if(!submissionId||submissionId.length>200){
        return NextResponse.json({error:'BLOTATO_SUBMISSION_ID_INVALID'},{status:400});
      }
      const result=normalizeBlotatoStatus(
        await blotato('/posts/'+encodeURIComponent(submissionId))
      );
      return NextResponse.json({ok:true,submission_id:submissionId,...result});
    }

    if(action==='cancel_schedule'){
      const scheduleId=String(body.schedule_id??'').trim();
      if(!scheduleId||scheduleId.length>200){
        return NextResponse.json({error:'BLOTATO_SCHEDULE_ID_INVALID'},{status:400});
      }
      await blotato('/schedules/'+encodeURIComponent(scheduleId),{method:'DELETE'});
      return NextResponse.json({
        ok:true,
        provider:'blotato',
        platform:'tiktok',
        schedule_id:scheduleId,
        cancelled:true
      });
    }

    if(action==='publish'){
      const actionId=String(body.action_id??'').toLowerCase();
      const readyId=String(body.v4_ready_asset_id??'').toLowerCase();
      const sha=String(body.media_sha256??'').toLowerCase();
      const mediaUrl=String(body.media_url??'');
      const caption=String(body.caption??'');
      const scheduledAt=String(body.scheduled_at??'');
      const scheduledMs=Date.parse(scheduledAt);
      const sponsored=body.is_branded_content===true;
      const ownBrand=body.is_your_brand===true;
      const requestedAccountId=String(body.account_id??'').trim()||null;
      if(!UUID.test(actionId)||!UUID.test(readyId)||!SHA256.test(sha)
         ||!/^https:\/\//i.test(mediaUrl)||!caption.trim()
         ||!Number.isFinite(scheduledMs)
         ||scheduledMs<=Date.now()+60_000
         ||scheduledMs>Date.now()+24*60*60_000
         ||!sponsored||ownBrand){
        return NextResponse.json({error:'BLOTATO_PUBLISH_REQUEST_INVALID'},{status:400});
      }

      const acct=await account(requestedAccountId);
      const prior=await existingStageReceipt(actionId);
      if(prior){
        const priorSubmission=String(prior.post_submission_id??'').trim();
        const priorReady=String(prior.v4_ready_asset_id??'').toLowerCase();
        const priorSha=String(prior.media_sha256??'').toLowerCase();
        const priorAccount=String(prior.account_id??'').trim();
        const priorScheduled=String(prior.scheduled_at??'');
        const priorScheduledMs=Date.parse(priorScheduled);
        if(!priorSubmission
           ||priorReady!==readyId
           ||priorSha!==sha
           ||priorAccount!==acct.id
           ||!Number.isFinite(priorScheduledMs)
           ||Math.abs(priorScheduledMs-scheduledMs)>120_000){
          return NextResponse.json({
            error:'BLOTATO_STAGE_IDENTITY_CONFLICT'
          },{status:409});
        }
        return NextResponse.json({
          ok:true,
          duplicate:true,
          provider:'blotato',
          platform:'tiktok',
          action_id:actionId,
          v4_ready_asset_id:readyId,
          media_sha256:sha,
          account_id:acct.id,
          post_submission_id:priorSubmission,
          scheduled_at:new Date(priorScheduledMs).toISOString(),
          provider_mutation_occurred:true,
          stage_receipt_persisted:true,
          target:prior.target??null
        });
      }

      const post=buildSponsoredTikTokPost({
        accountId:acct.id,
        caption,
        mediaUrl,
        scheduledAt,
        isAiGenerated:body.is_ai_generated===true
      });

      let response:Record<string,unknown>;
      try{
        response=await blotato('/posts',{
          method:'POST',
          body:JSON.stringify(post)
        }) as Record<string,unknown>;
      }catch(error){
        const message=String(error instanceof Error?error.message:error);
        const noMutation=definiteNoMutation(message);
        return NextResponse.json({
          error:'BLOTATO_CREATE_FAILED',
          detail:message.slice(0,500),
          provider_mutation_occurred:noMutation?false:null,
          provider_mutation_unknown:!noMutation
        },{status:noMutation?409:502});
      }

      const submissionId=String(response?.postSubmissionId??'').trim();
      if(!submissionId){
        return NextResponse.json({
          error:'BLOTATO_MALFORMED_SUCCESS',
          provider_mutation_unknown:true
        },{status:502});
      }

      const target=post.post.target;
      const receipt=await persistStageReceipt({
        actionId,
        readyId,
        sha,
        submissionId,
        accountId:acct.id,
        scheduledAt:new Date(scheduledMs).toISOString(),
        target
      });

      return NextResponse.json({
        ok:true,
        provider:'blotato',
        platform:'tiktok',
        action_id:actionId,
        v4_ready_asset_id:readyId,
        media_sha256:sha,
        account_id:acct.id,
        post_submission_id:submissionId,
        scheduled_at:new Date(scheduledMs).toISOString(),
        provider_mutation_occurred:true,
        stage_receipt_persisted:receipt.ok,
        stage_receipt_attempts:receipt.attempts,
        target
      });
    }

    return NextResponse.json({error:'BLOTATO_ACTION_UNSUPPORTED'},{status:400});
  }catch(error){
    const message=String(error instanceof Error?error.message:error);
    const auth=/401|403|API_KEY|UNAUTHORIZED/i.test(message);
    console.error('MomentCircuit Blotato TikTok error',{
      action,
      error:message.slice(0,800)
    });
    return NextResponse.json({
      error:auth?'BLOTATO_AUTH_FAILED':'BLOTATO_PROVIDER_ERROR',
      detail:message.slice(0,500)
    },{status:auth?401:502});
  }
}
