import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  CAMPAIGN_DEEP_READ_SCHEMA,
  campaignDeepReadInput,
  campaignDeepReadInstructions,
  validateCampaignDeepRead
} from '@/lib/momentcircuit/v4-campaign-deep-read';
import {extractResponseTextAndCitations} from '@/lib/momentcircuit/v4-trend-research';
import {reserveHalyardSpend,settleHalyardSpend} from '@/lib/halyard-spend-guard';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

const MODEL='gpt-5.6-luna';
const MAX_CALL_RESERVATION_USD=0.35;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
function rpcMessage(error:unknown,fallback:string){
  if(error&&typeof error==='object'&&'message' in error){
    const message=String((error as {message?:unknown}).message??'').trim();
    if(message) return message;
  }
  return fallback;
}

async function research(client:ReturnType<typeof database>,args:{
  candidate:unknown;
  actionPayload:unknown;
  currentTrend:unknown;
  providerRegistry:unknown;
  providerKeys:string[];
}){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new Error('OPENAI_API_KEY_MISSING');

  const reservation=await reserveHalyardSpend(client,{
    provider:'openai',purpose:'momentcircuit_campaign_deep_read',
    maxUsd:MAX_CALL_RESERVATION_USD,
    metadata:{model:MODEL},
  });
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{
      authorization:`Bearer ${key}`,
      'content-type':'application/json'
    },
    body:JSON.stringify({
      model:MODEL,
      tools:[{type:'web_search',context_size:'low'}],
      max_tool_calls:2,
      reasoning:{effort:'low'},
      include:['web_search_call.action.sources'],
      instructions:campaignDeepReadInstructions(args.providerKeys),
      input:campaignDeepReadInput(args),
      text:{
        format:{
          type:'json_schema',
          name:'momentcircuit_campaign_deep_read',
          strict:true,
          schema:CAMPAIGN_DEEP_READ_SCHEMA
        }
      },
      max_output_tokens:2400,
      store:false
    }),
    signal:AbortSignal.timeout(210_000)
  });

  await settleHalyardSpend(client,reservation,{http_status:response.status});
  if(!response.ok) throw new Error(`CAMPAIGN_DEEP_READ_OPENAI_HTTP_${response.status}`);
  const body=await response.json() as unknown;
  const extracted=extractResponseTextAndCitations(body);
  let parsed:unknown;
  try{parsed=JSON.parse(extracted.text);}catch{
    throw new Error('CAMPAIGN_DEEP_READ_OPENAI_JSON_INVALID');
  }
  return {parsed,citations:extracted.citations};
}
async function completeExisting(args:{
  client:ReturnType<typeof database>;
  actionId:string;
  ctl:{generation:number;active_run_id:string};
  contract:Record<string,unknown>;
}){
  const sourceAllowed=args.contract.source_work_allowed===true;
  const publishAllowed=args.contract.publish_allowed===true;
  const decision=String(args.contract.decision??'');
  const outcome=sourceAllowed&&publishAllowed
    ?'EXECUTABLE'
    :decision.toUpperCase().startsWith('SKIP')?'SKIP':'BLOCKED';

  const {data,error}=await args.client.rpc('momentcircuit_complete_campaign_rotation_action',{
    p_run_id:args.ctl.active_run_id,
    p_generation:Number(args.ctl.generation),
    p_action_id:args.actionId,
    p_campaign_contract_id:String(args.contract.id),
    p_outcome:outcome,
    p_evidence:{
      reused_current_contract:true,
      decision,
      completed_by:'HALYARD_CAMPAIGN_DEEP_READ_CLOUD'
    }
  });
  if(error) throw new Error(rpcMessage(error,'CAMPAIGN_DEEP_READ_COMPLETE_EXISTING_FAILED'));
  return {outcome,contractId:String(args.contract.id),result:data};
}

export async function POST(request:NextRequest){
  try{authorize(request);}catch{
    return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  }

  let body:Record<string,unknown>;
  try{body=await request.json() as Record<string,unknown>;}catch{
    return NextResponse.json({error:'CAMPAIGN_DEEP_READ_REQUEST_INVALID'},{status:400});
  }

  const actionId=String(body.action_id??'').toLowerCase();
  if(!UUID.test(actionId)){
    return NextResponse.json({error:'CAMPAIGN_DEEP_READ_REQUEST_INVALID'},{status:400});
  }

  const client=database();
  try{
    const [{data:action,error:ae},{data:ctl,error:ce}]=await Promise.all([
      client.from('momentcircuit_horizon_actions').select('*').eq('id',actionId).maybeSingle(),
      client.from('momentcircuit_pipeline_control')
        .select('generation,active_run_id,lease_expires_at').eq('singleton',true).maybeSingle()
    ]);

    if(ae||!action||action.action_type!=='DEEP_READ_CAMPAIGN_CANDIDATE'){
      throw new Error('CAMPAIGN_DEEP_READ_ACTION_MISSING');
    }
    if(action.state==='DONE'){
      return NextResponse.json({ok:true,duplicate:true,action_id:actionId});
    }
    if(!['PENDING','IN_PROGRESS'].includes(String(action.state))){
      throw new Error('CAMPAIGN_DEEP_READ_ACTION_NOT_ACTIVE');
    }
    if(ce||!ctl||!ctl.active_run_id||Date.parse(ctl.lease_expires_at)<=Date.now()
       ||Number(action.generation)!==Number(ctl.generation)
       ||String(action.run_id)!==String(ctl.active_run_id)){
      throw new Error('CAMPAIGN_DEEP_READ_STALE_RUN');
    }

    const marketCandidateId=String(action.payload?.market_candidate_id??'');
    if(!UUID.test(marketCandidateId)){
      throw new Error('CAMPAIGN_DEEP_READ_MARKET_CANDIDATE_INVALID');
    }

    const [{data:candidate,error:candidateError},{data:registry,error:registryError}]=await Promise.all([
      client.from('momentcircuit_market_candidates').select('*')
        .eq('id',marketCandidateId).maybeSingle(),
      client.from('momentcircuit_source_provider_adapters')
        .select('provider_key,state,adapter_family,supports_catalog_discovery,supports_manifest_refresh,supports_private_auth,owner_action,capabilities')
        .order('provider_key')
    ]);

    if(candidateError||!candidate
       ||Number(candidate.generation)!==Number(ctl.generation)
       ||Date.parse(candidate.valid_until)<=Date.now()){
      await client.from('momentcircuit_horizon_actions').update({
        state:'SUPERSEDED',
        last_error:'CAMPAIGN_DEEP_READ_MARKET_CANDIDATE_STALE',
        updated_at:new Date().toISOString()
      }).eq('id',actionId);
      return NextResponse.json({
        ok:true,recorded:false,superseded:true,
        action_id:actionId,reason:'CAMPAIGN_DEEP_READ_MARKET_CANDIDATE_STALE'
      });
    }
    if(registryError||!Array.isArray(registry)){
      throw new Error('CAMPAIGN_DEEP_READ_PROVIDER_REGISTRY_UNAVAILABLE');
    }
    const campaignId=String(candidate.campaign_id??'').trim();
    if(!campaignId) throw new Error('CAMPAIGN_DEEP_READ_CAMPAIGN_ID_MISSING');
    const campaignName=String(candidate.campaign_name??'').trim();
    const campaignUrl=`https://contentrewards.com/discover/${campaignId}`;

    const {data:existing,error:existingError}=await client
      .from('momentcircuit_campaign_contracts').select('*')
      .eq('generation',ctl.generation).eq('campaign_id',campaignId)
      .gt('valid_until',new Date().toISOString())
      .order('observed_at',{ascending:false}).limit(1).maybeSingle();
    if(existingError) throw new Error('CAMPAIGN_DEEP_READ_EXISTING_CONTRACT_READ_FAILED');
    if(existing){
      const completed=await completeExisting({
        client,actionId,
        ctl:{generation:Number(ctl.generation),active_run_id:String(ctl.active_run_id)},
        contract:existing
      });
      return NextResponse.json({
        ok:true,reused_current_contract:true,action_id:actionId,
        outcome:completed.outcome,campaign_contract_id:completed.contractId
      });
    }

    const {data:trend}=await client.from('momentcircuit_trend_signals').select('*')
      .eq('generation',ctl.generation)
      .eq('topic_key',`market_candidate:${marketCandidateId}`)
      .gt('valid_until',new Date().toISOString())
      .order('observed_at',{ascending:false}).limit(1).maybeSingle();

    const providerStates:Record<string,string>={};
    for(const row of registry){
      providerStates[String(row.provider_key)]=String(row.state);
    }
    const providerKeys=Object.keys(providerStates);

    const currentCandidate={
      ...candidate,
      campaign_url:campaignUrl
    };

    const researched=await research(client,{
      candidate:currentCandidate,
      actionPayload:action.payload,
      currentTrend:trend??null,
      providerRegistry:registry,
      providerKeys
    });
    const result=validateCampaignDeepRead({
      raw:researched.parsed,
      citations:researched.citations,
      providerStates
    });
    const [{data:rereadAction},{data:rereadCtl}]=await Promise.all([
      client.from('momentcircuit_horizon_actions').select('*').eq('id',actionId).maybeSingle(),
      client.from('momentcircuit_pipeline_control')
        .select('generation,active_run_id,lease_expires_at').eq('singleton',true).maybeSingle()
    ]);
    if(rereadAction?.state==='DONE'){
      return NextResponse.json({ok:true,duplicate:true,action_id:actionId});
    }
    if(!rereadCtl||String(rereadCtl.active_run_id)!==String(ctl.active_run_id)
       ||Number(rereadCtl.generation)!==Number(ctl.generation)
       ||Date.parse(rereadCtl.lease_expires_at)<=Date.now()){
      throw new Error('CAMPAIGN_DEEP_READ_STALE_AFTER_RESEARCH');
    }
    if(!rereadAction||!['PENDING','IN_PROGRESS'].includes(String(rereadAction.state))){
      throw new Error('CAMPAIGN_DEEP_READ_ACTION_CHANGED_AFTER_RESEARCH');
    }

    const providerState=result.source_provider
      ?providerStates[result.source_provider]??'UNKNOWN':'UNKNOWN';
    const briefSnapshotId=result.brief_url||campaignUrl;
    const requirements={
      language:result.language,
      core_lane:String(candidate.coarse_lane??''),
      platforms:result.platforms,
      disclosure:{required:result.disclosure_required},
      source_provider:result.source_provider,
      reference_materials:result.source_references,
      min_video_seconds:result.min_video_seconds,
      official_source_only:true,
      dedicated_page_required:result.dedicated_page_required
    };
    const evidence={
      campaign_url:campaignUrl,
      brief_url:result.brief_url||campaignUrl,
      market_candidate_id:marketCandidateId,
      market_snapshot_id:candidate.raw_market_evidence?.snapshot_id??null,
      live_market_evidence:candidate.raw_market_evidence??{},
      trend_signal_id:trend?.id??null,
      trend_used_as_opportunity_only:true,
      research_provider:'HALYARD_OPENAI_RESPONSES_WEB_SEARCH',
      research_model:MODEL,
      citation_backed:true,
      research_sources:result.sources,
      category_fit:result.category_fit,
      account_fit:result.account_fit,
      account_fit_reason:result.account_fit_reason,
      rights_clear:result.rights_clear,
      rights_summary:result.rights_summary,
      source_authorization:result.source_authorization,
      source_adapter_state:providerState,
      blockers:result.blockers,
      rationale:result.rationale,
      researched_at:new Date().toISOString()
    };
    const briefHash=crypto.createHash('sha256')
      .update(JSON.stringify({requirements,evidence}))
      .digest('hex');

    const {data:contractId,error:contractError}=await client.rpc(
      'momentcircuit_upsert_campaign_contract_v2',{
        p_run_id:ctl.active_run_id,
        p_generation:Number(ctl.generation),
        p_campaign_id:campaignId,
        p_campaign_name:campaignName,
        p_brief_snapshot_id:briefSnapshotId,
        p_brief_hash:briefHash,
        p_decision:result.decision,
        p_source_work_allowed:result.source_work_allowed,
        p_publish_allowed:result.publish_allowed,
        p_requirements:requirements,
        p_evidence:evidence,
        p_valid_minutes:85
      });
    if(contractError||!contractId){
      throw new Error(rpcMessage(contractError,'CAMPAIGN_DEEP_READ_CONTRACT_WRITE_FAILED'));
    }

    const {data:completed,error:completeError}=await client.rpc(
      'momentcircuit_complete_campaign_rotation_action',{
        p_run_id:ctl.active_run_id,
        p_generation:Number(ctl.generation),
        p_action_id:actionId,
        p_campaign_contract_id:contractId,
        p_outcome:result.outcome,
        p_evidence:{
          decision:result.decision,
          cloud_worker:'HALYARD_CAMPAIGN_DEEP_READ',
          category_fit:result.category_fit,
          source_provider:result.source_provider,
          source_adapter_state:providerState,
          blockers:result.blockers,
          citation_backed:true,
          source_count:result.sources.length
        }
      });
    if(completeError){
      throw new Error(rpcMessage(completeError,'CAMPAIGN_DEEP_READ_ACTION_COMPLETE_FAILED'));
    }

    return NextResponse.json({
      ok:true,recorded:true,action_id:actionId,
      outcome:result.outcome,
      campaign_id:campaignId,
      campaign_name:campaignName,
      campaign_contract_id:contractId,
      decision:result.decision,
      source_provider:result.source_provider,
      source_adapter_state:providerState,
      source_count:result.sources.length,
      completed
    });
  }catch(error){
    const message=error instanceof Error?error.message:'CAMPAIGN_DEEP_READ_FAILED';
    try{
      await client.from('momentcircuit_horizon_actions').update({
        last_error:message,
        updated_at:new Date().toISOString()
      }).eq('id',actionId);
    }catch{/* Supabase transport reconciliation owns final retry state. */}
    return NextResponse.json({error:message},{status:500});
  }
}
