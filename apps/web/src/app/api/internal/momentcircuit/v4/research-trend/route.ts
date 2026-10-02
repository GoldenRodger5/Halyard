import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  TREND_RESEARCH_SCHEMA,
  extractResponseTextAndCitations,
  trendResearchInput,
  trendResearchInstructions,
  validateTrendResearch
} from '@/lib/momentcircuit/v4-trend-research';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;

const MODEL='gpt-5.6';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_TYPES=new Set(['REFRESH_MARKET_TREND_SIGNAL','REFRESH_TREND_SIGNAL']);

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

async function research(args:{
  actionType:string;
  platform:string;
  payload:unknown;
}){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new Error('OPENAI_API_KEY_MISSING');

  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{
      authorization:`Bearer ${key}`,
      'content-type':'application/json'
    },
    body:JSON.stringify({
      model:MODEL,
      tools:[{type:'web_search'}],
      include:['web_search_call.action.sources'],
      instructions:trendResearchInstructions(),
      input:trendResearchInput(args),
      text:{
        format:{
          type:'json_schema',
          name:'momentcircuit_trend_signal',
          strict:true,
          schema:TREND_RESEARCH_SCHEMA
        }
      },
      max_output_tokens:2600,
      store:false
    }),
    signal:AbortSignal.timeout(180_000)
  });

  if(!response.ok) throw new Error(`TREND_OPENAI_HTTP_${response.status}`);
  const body=await response.json() as unknown;
  const extracted=extractResponseTextAndCitations(body);

  let parsed:unknown;
  try{parsed=JSON.parse(extracted.text);}catch{
    throw new Error('TREND_OPENAI_JSON_INVALID');
  }
  return validateTrendResearch(parsed,extracted.citations);
}

function rpcError(error:unknown,fallback:string){
  if(error&&typeof error==='object'&&'message' in error){
    const message=String((error as {message?:unknown}).message??'').trim();
    if(message) return message;
  }
  return fallback;
}
export async function POST(request:NextRequest){
  try{authorize(request);}catch{
    return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  }

  let body:Record<string,unknown>;
  try{body=await request.json() as Record<string,unknown>;}catch{
    return NextResponse.json({error:'TREND_REQUEST_INVALID'},{status:400});
  }

  const actionId=String(body.action_id??'').toLowerCase();
  if(!UUID.test(actionId)){
    return NextResponse.json({error:'TREND_REQUEST_INVALID'},{status:400});
  }

  const client=database();
  const [{data:action,error:ae},{data:ctl,error:ce}]=await Promise.all([
    client.from('momentcircuit_horizon_actions').select('*').eq('id',actionId).maybeSingle(),
    client.from('momentcircuit_pipeline_control')
      .select('generation,active_run_id,lease_expires_at').eq('singleton',true).maybeSingle()
  ]);

  if(ae||!action||!ACTION_TYPES.has(String(action.action_type))){
    return NextResponse.json({error:'TREND_ACTION_MISSING'},{status:404});
  }
  if(action.state==='DONE'){
    return NextResponse.json({ok:true,duplicate:true,action_id:actionId});
  }
  if(!['PENDING','IN_PROGRESS'].includes(String(action.state))){
    return NextResponse.json({error:'TREND_ACTION_NOT_ACTIVE'},{status:409});
  }
  if(ce||!ctl||!ctl.active_run_id||Date.parse(ctl.lease_expires_at)<=Date.now()
     ||Number(action.generation)!==Number(ctl.generation)
     ||String(action.run_id)!==String(ctl.active_run_id)){
    return NextResponse.json({error:'TREND_ACTION_STALE_RUN'},{status:409});
  }

  await client.from('momentcircuit_horizon_actions').update({
    state:'IN_PROGRESS',
    last_attempt_at:new Date().toISOString(),
    last_error:null,
    updated_at:new Date().toISOString()
  }).eq('id',actionId);

  try{
    const result=await research({
      actionType:String(action.action_type),
      platform:String(action.platform??'cross_platform'),
      payload:action.payload
    });
    if(!result.should_record){
      const retryAt=new Date(Date.now()+20*60_000).toISOString();
      await client.from('momentcircuit_horizon_actions').update({
        state:'PENDING',
        not_before:retryAt,
        last_error:'TREND_CURRENT_EVIDENCE_INSUFFICIENT',
        payload:{
          ...(action.payload??{}),
          cloud_trend_last_research_at:new Date().toISOString(),
          cloud_trend_last_model:MODEL,
          cloud_trend_last_rationale:result.rationale
        },
        updated_at:new Date().toISOString()
      }).eq('id',actionId);
      return NextResponse.json({
        ok:true,recorded:false,action_id:actionId,
        reason:'TREND_CURRENT_EVIDENCE_INSUFFICIENT'
      });
    }

    const evidence={
      rationale:result.rationale,
      sources:result.sources,
      research_provider:'HALYARD_OPENAI_RESPONSES_WEB_SEARCH',
      research_model:MODEL,
      citation_backed:true,
      researched_at:new Date().toISOString()
    };
    const validUntil=new Date(Date.now()+85*60_000).toISOString();
    let rpcResult:unknown;
    if(action.action_type==='REFRESH_MARKET_TREND_SIGNAL'){
      const {data,error}=await client.rpc('momentcircuit_record_market_trend_refresh',{
        p_run_id:ctl.active_run_id,
        p_generation:Number(ctl.generation),
        p_action_id:actionId,
        p_source:'halyard_openai_web_search',
        p_heat:result.heat,
        p_velocity:result.velocity,
        p_saturation:result.saturation,
        p_novelty:result.novelty,
        p_audience_adjacent_fit:result.audience_adjacent_fit,
        p_evidence:evidence,
        p_valid_until:validUntil
      });
      if(error) throw new Error(rpcError(error,'TREND_RECORD_MARKET_FAILED'));
      rpcResult=data;
    }else{
      const {data,error}=await client.rpc('momentcircuit_record_trend_refresh',{
        p_run_id:ctl.active_run_id,
        p_generation:Number(ctl.generation),
        p_action_id:actionId,
        p_topic_key:result.topic_key,
        p_source:'halyard_openai_web_search',
        p_heat:result.heat,
        p_velocity:result.velocity,
        p_saturation:result.saturation,
        p_novelty:result.novelty,
        p_audience_adjacent_fit:result.audience_adjacent_fit,
        p_evidence:evidence,
        p_valid_until:validUntil
      });
      if(error) throw new Error(rpcError(error,'TREND_RECORD_PLATFORM_FAILED'));
      rpcResult=data;
    }

    return NextResponse.json({
      ok:true,
      recorded:true,
      action_id:actionId,
      topic_key:result.topic_key,
      signal:rpcResult,
      source_count:result.sources.length,
      valid_until:validUntil
    });
  }catch(error){
    const message=error instanceof Error?error.message:'TREND_RESEARCH_FAILED';
    await client.from('momentcircuit_horizon_actions').update({
      last_error:message,
      payload:{
        ...(action.payload??{}),
        cloud_trend_last_error:message,
        cloud_trend_last_error_at:new Date().toISOString(),
        cloud_trend_last_model:MODEL
      },
      updated_at:new Date().toISOString()
    }).eq('id',actionId);
    return NextResponse.json({error:message},{status:500});
  }
}
