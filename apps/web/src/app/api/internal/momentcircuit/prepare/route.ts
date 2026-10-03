import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { buildVerifiedEditPlan, verifiedSourceLayout, verifiedShotsFromShotMap, type AiEditDecision } from '@/lib/momentcircuit/edit-planner';
import { assessPackageQuality, packageRevisionFeedback } from '@/lib/momentcircuit/package-quality';
import { prepareSourceWindow } from '@/lib/momentcircuit/source-window';
import {reserveHalyardSpend,settleHalyardSpend} from '@/lib/halyard-spend-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;

const MODEL = 'gpt-5.5';
const OPENAI = 'https://api.openai.com/v1/chat/completions';

type PackageReply = {
  post_caption?: string;
  onscreen_hook?: string | null;
  hook_mode?: 'NONE' | 'OPENING_CONTEXT';
  youtube_title?: string | null;
  specificity?: number;
  native_voice?: number;
  unsupported_claims?: string[];
  rationale?: string;
  presentation_mode?: AiEditDecision['presentation_mode'];
  source_layout?: AiEditDecision['source_layout'];
  focus_x?: number;
  shots?: AiEditDecision['shots'];
  headline?: string | null;
  headline_duration?: number;
  first_second_strategy?: 'NATIVE_COLD_OPEN' | 'REACTION_FIRST_TRIM' | 'HEADLINE_CONTEXT' | 'PAYOFF_FORWARD_TRIM' | 'AI_REVIEW_REQUIRED';
};

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function authorize(request: NextRequest) {
  const expected = process.env.MOMENTCIRCUIT_RENDER_SECRET ?? '';
  const actual = request.headers.get('x-momentcircuit-render-secret') ?? '';
  if (!expected || !actual || !secureEqual(expected, actual)) throw new Error('UNAUTHORIZED');
}

function collectHashtags(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const match of value.match(/#[A-Za-z0-9_]+/g) ?? []) out.add(match);
  } else if (Array.isArray(value)) {
    for (const item of value) collectHashtags(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectHashtags(item, out);
  }
  return out;
}

function cleanCaption(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function cleanHook(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.split(/\s+/).slice(0, 14).join(' ').slice(0, 90);
}

function validateCueArray(value: unknown): Array<{start:number;end:number;text:string}> {
  if (!Array.isArray(value) || value.length === 0) throw new Error('VERIFIED_CAPTION_CUES_MISSING');
  const out:Array<{start:number;end:number;text:string}> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new Error('CAPTION_CUE_INVALID');
    const row = raw as Record<string, unknown>;
    const start = Number(row.start);
    const end = Number(row.end);
    const text = String(row.text ?? '').replace(/\s+/g, ' ').trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text) {
      throw new Error('CAPTION_CUE_INVALID');
    }
    if (/(Dialogue:|Style:|Script Info|Format:|-->|,Cap,,|(?:^|\s)\d{1,2}:\d{2}(?::\d{2})?[.,]\d+|["']?(?:start|end)["']?\s*:|\{\s*["'])/i.test(text)) {
      throw new Error('CAPTION_CUE_ARTIFACT_TOKEN');
    }
    out.push({start,end,text:text.slice(0,90)});
  }
  return out;
}

async function generatePackage(args:{
  platform:string;
  campaignName:string;
  story:string;
  payoff:string;
  requirements:unknown;
  requiredHashtags:string[];
  shotMap:unknown;
  duration:number;
  editorialProfile:unknown;
  treatmentHint:unknown;
  editorialThesis:string;
  audienceTraits:string[];
  trendTopics:string[];
  firstSecondEvidence:string;
  revision?: {previous:PackageReply;feedback:string};
}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY_MISSING_FOR_PREPARE');

  const system = `You package professional MomentCircuit short-form clips.
Use ONLY the supplied verified story, payoff, campaign requirements, and required hashtags.
Never invent a fact, person, quote, release date, platform rule, or campaign requirement.

Style:
- sound like a sharp creator/meme/clip page, never like generic AI marketing;
- concrete, casual, specific;
- never use #fyp, #viral, #trending, "wait for it", "you won't believe";
- do not simply repeat a subtitle as the post caption;
- choose exactly one presentation mode: NATIVE_SOURCE_ONLY, HEADLINE_CARD_OPENING, or HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES;
- use a contextual headline only when it materially improves cold-viewer comprehension; max 14 words and 90 characters;
- if the source opening is already excellent, choose NATIVE_SOURCE_ONLY;
- classify source layout as VERTICAL_NATIVE, SINGLE_SPEAKER, TWO_SHOT, SPLIT_SCREEN, GAMEPLAY_PLUS_FACE, FULLSCREEN_GAMEPLAY, INTERVIEW, or CINEMATIC;
- focus_x is 0..1 across source width and must keep faces/action safe;
- shots are relative to the selected clip and must cover the whole duration exactly; use one shot unless a real speaker/layout change requires more;
- never write subtitle wording; verified caption cues are injected deterministically after your decision;
- TikTok: fast, conversational, reaction/share/comment energy;
- YouTube Shorts: standalone, clear premise; youtube_title must be concise and searchable without clickbait;
- preserve every supplied required hashtag exactly.

Editorial Intelligence V3:
- treat editorial_profile and editorial_thesis as ranking/editorial evidence, never as permission to invent facts;
- audience_traits describe the reusable viewer interest this moment serves; packaging should strengthen that promise without naming internal traits;
- trend_topics are context, not clickbait. If trend evidence is absent/neutral, do not manufacture trend language;
- first_second_evidence and treatment_hint describe the verified opening. Preserve a strong native opening rather than covering it with a card;
- when cold clarity needs context, HEADLINE_CARD_OPENING is allowed, but the headline must be truthful, specific, and disappear quickly;
- never use a weaker generic headline simply because the campaign/topic is hot;
- do not reorder chronology in a misleading way;
- the goal is stop power + comprehension + payoff + share/comment reason, not decorative editing.

Return JSON only:
{
 "post_caption":"8-180 chars including required hashtags",
 "onscreen_hook":null,
 "hook_mode":"NONE|OPENING_CONTEXT",
 "youtube_title":null,
 "specificity":0.0,
 "native_voice":0.0,
 "unsupported_claims":[],
 "rationale":"short",
 "presentation_mode":"NATIVE_SOURCE_ONLY|HEADLINE_CARD_OPENING|HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES",
 "source_layout":"VERTICAL_NATIVE|SINGLE_SPEAKER|TWO_SHOT|SPLIT_SCREEN|GAMEPLAY_PLUS_FACE|FULLSCREEN_GAMEPLAY|INTERVIEW|CINEMATIC",
 "focus_x":0.5,
 "shots":[],
 "headline":null,
 "headline_duration":2.4,
 "first_second_strategy":"NATIVE_COLD_OPEN|REACTION_FIRST_TRIM|HEADLINE_CONTEXT|PAYOFF_FORWARD_TRIM|AI_REVIEW_REQUIRED"
}
Set unsupported_claims to any phrase you cannot directly support from the supplied facts. If unsupported_claims is non-empty the package will be rejected.`;

  const user = JSON.stringify({
    platform:args.platform,
    campaign_name:args.campaignName,
    verified_story:args.story,
    verified_payoff:args.payoff,
    campaign_requirements:args.requirements,
    required_hashtags:args.requiredHashtags,
    verified_shot_map:args.shotMap,
    clip_duration_seconds:args.duration,
    editorial_profile:args.editorialProfile,
    editorial_treatment_hint:args.treatmentHint,
    editorial_thesis:args.editorialThesis,
    audience_traits:args.audienceTraits,
    trend_topics:args.trendTopics,
    first_second_evidence:args.firstSecondEvidence,
  });

  const messages:Array<{role:'system'|'user'|'assistant';content:string}>=[
    {role:'system',content:system},
    {role:'user',content:user},
  ];
  if(args.revision){
    messages.push(
      {role:'assistant',content:JSON.stringify(args.revision.previous)},
      {role:'user',content:`One bounded correction pass only. The previous package failed these quality dimensions: ${args.revision.feedback} Rewrite the package while preserving all verified facts, required hashtags, platform, and source-layout truth. Do not invent anything. Return the complete JSON object again.`},
    );
  }
  const response = await fetch(OPENAI,{
    method:'POST',
    headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({
      model:MODEL,
      messages,
      response_format:{type:'json_object'},
      max_completion_tokens:1800,
    }),
  });
  const body = await response.json() as {choices?:Array<{message?:{content?:string|null}}>;error?:{message?:string}};
  if (!response.ok) throw new Error(`PREPARE_AI_${response.status}: ${body.error?.message ?? 'unknown'}`);
  const raw = body.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('PREPARE_AI_EMPTY');
  return JSON.parse(raw) as PackageReply;
}

async function prepareWorkOrder(id:string) {
  const client = db();

  const {data:wo,error:we} = await client.from('momentcircuit_creative_work_orders')
    .select('id,generation,run_id,platform,candidate_moment_id,campaign_contract_id,payload,status')
    .eq('id',id).maybeSingle();
  if (we || !wo) throw new Error(`WORK_ORDER_NOT_FOUND: ${we?.message ?? id}`);

  const {data:ctl} = await client.from('momentcircuit_pipeline_control')
    .select('generation,active_run_id').eq('singleton',true).maybeSingle();
  if (!ctl || Number(ctl.generation)!==Number(wo.generation) || ctl.active_run_id!==wo.run_id) {
    throw new Error('STALE_PREPARE_RUN');
  }

  const [
    {data:cm,error:ce},
    {data:cc,error:cce},
    {data:cues,error:cueError},
    {data:editorialProfile,error:editorialError},
    {data:treatmentHint,error:treatmentError},
    {data:editorialGate,error:editorialGateError},
  ] = await Promise.all([
    client.from('momentcircuit_candidate_moments')
      .select('id,story_family,start_seconds,end_seconds,verified_story_claim,verified_payoff,shot_map,status,semantic_state,scores,semantic_evidence')
      .eq('id',wo.candidate_moment_id).maybeSingle(),
    client.from('momentcircuit_campaign_contracts')
      .select('id,campaign_id,campaign_name,requirements,evidence,publish_allowed,source_work_allowed,valid_until')
      .eq('id',wo.campaign_contract_id).maybeSingle(),
    client.rpc('momentcircuit_verified_caption_cues',{p_candidate_moment_id:wo.candidate_moment_id}),
    client.rpc('momentcircuit_editorial_candidate_value',{p_candidate_moment_id:wo.candidate_moment_id,p_platform:wo.platform}),
    client.rpc('momentcircuit_editorial_treatment_decision',{p_candidate_moment_id:wo.candidate_moment_id,p_platform:wo.platform}),
    client.rpc('momentcircuit_editorial_v3_gate',{p_candidate_moment_id:wo.candidate_moment_id,p_platform:wo.platform}),
  ]);
  if (ce || !cm) throw new Error(`MOMENT_NOT_FOUND: ${ce?.message ?? wo.candidate_moment_id}`);
  if (cce || !cc) throw new Error(`CONTRACT_NOT_FOUND: ${cce?.message ?? wo.campaign_contract_id}`);
  if (cueError) throw new Error(`CUE_LOOKUP_FAILED: ${cueError.message}`);
  if (editorialError) throw new Error(`EDITORIAL_PROFILE_FAILED: ${editorialError.message}`);
  if (treatmentError) throw new Error(`EDITORIAL_TREATMENT_FAILED: ${treatmentError.message}`);
  if (editorialGateError) throw new Error(`EDITORIAL_GATE_FAILED: ${editorialGateError.message}`);
  if (!editorialGate || editorialGate.pass !== true) {
    throw new Error(`EDITORIAL_V3_REQUIRED: ${JSON.stringify(editorialGate ?? {})}`);
  }
  if (!['verified','selected'].includes(String(cm.status))) throw new Error('MOMENT_NOT_VERIFIED');
  if (!String(cm.semantic_state ?? '').toUpperCase().startsWith('VERIFIED')) throw new Error('MOMENT_SEMANTIC_STATE_NOT_VERIFIED');

  const verifiedCues = validateCueArray(cues);
  const payload = structuredClone((wo.payload ?? {}) as Record<string,unknown>);
  const existingRequired = Array.isArray(payload.required_hashtags)
    ? payload.required_hashtags.map((x)=>String(x)).filter((x)=>x.startsWith('#'))
    : [];
  const requiredHashtags = [...new Set([
    ...existingRequired,
    ...collectHashtags(cc.requirements).values(),
  ])];

  const existingSeg =
    payload.render_segment && typeof payload.render_segment === 'object' && !Array.isArray(payload.render_segment)
      ? payload.render_segment as Record<string,unknown>
      : {};
  const sourceWindow=prepareSourceWindow(
    cm.start_seconds,
    cm.end_seconds,
    existingSeg,
    payload.prepare_version==='AI_EDIT_PLAN_VNEXT_1' && existingSeg.edit_plan_version===1,
  );
  const sourceStart=sourceWindow.start;
  const duration=sourceWindow.duration;

  const semanticEvidence = (cm.semantic_evidence ?? {}) as Record<string,unknown>;
  const audienceTraits = Array.isArray(semanticEvidence.audience_traits)
    ? semanticEvidence.audience_traits.map((x)=>String(x)).filter(Boolean)
    : [];
  const trendTopics = Array.isArray(semanticEvidence.trend_topics)
    ? semanticEvidence.trend_topics.map((x)=>String(x)).filter(Boolean)
    : [];
  const packageArgs={
    platform:String(wo.platform),
    campaignName:String(cc.campaign_name),
    story:String(cm.verified_story_claim ?? ''),
    payoff:String(cm.verified_payoff ?? ''),
    requirements:cc.requirements,
    requiredHashtags,
    shotMap:cm.shot_map,
    duration,
    editorialProfile,
    treatmentHint,
    editorialThesis:String(semanticEvidence.editorial_thesis ?? ''),
    audienceTraits,
    trendTopics,
    firstSecondEvidence:String(semanticEvidence.first_second_evidence ?? ''),
  };
  const spendReservation=await reserveHalyardSpend(client,{
    provider:'openai',purpose:'momentcircuit_prepare_packaging',maxUsd:2.00,
    metadata:{model:MODEL,work_order_id:wo.id,platform:wo.platform},
  });
  const firstGenerated = await generatePackage(packageArgs);
  const firstQuality = assessPackageQuality(firstGenerated);
  let generated=firstGenerated;
  let packageRevisionCount=0;
  if(!firstQuality.pass && !firstQuality.reasons.includes('UNSUPPORTED_CLAIMS')){
    generated=await generatePackage({...packageArgs,revision:{previous:firstGenerated,feedback:packageRevisionFeedback(firstQuality)}});
    packageRevisionCount=1;
  }
  await settleHalyardSpend(client,spendReservation,{provider_calls:1+packageRevisionCount});

  const unsupported = Array.isArray(generated.unsupported_claims) ? generated.unsupported_claims.filter(Boolean) : [];
  if (unsupported.length) throw new Error(`UNSUPPORTED_PACKAGING_CLAIMS: ${unsupported.join(' | ').slice(0,600)}`);
  const finalPackageQuality=assessPackageQuality(generated);
  if(!finalPackageQuality.pass){
    throw new Error(`AI_PACKAGE_QUALITY_BELOW_FLOOR:${finalPackageQuality.reasons.join(',')}`);
  }

  let postCaption = cleanCaption(String(generated.post_caption ?? ''));
  for (const tag of requiredHashtags) {
    if (!postCaption.toLowerCase().includes(tag.toLowerCase())) postCaption = cleanCaption(`${postCaption} ${tag}`);
  }
  if (postCaption.length < 8) throw new Error('POST_CAPTION_TOO_SHORT');

  const plannedHeadline=cleanHook(generated.headline ?? generated.onscreen_hook);
  const requestedMode=generated.presentation_mode ?? (generated.hook_mode==='OPENING_CONTEXT'?'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES':'NATIVE_SOURCE_ONLY');
  const hook = requestedMode==='NATIVE_SOURCE_ONLY' ? null : plannedHeadline;
  const hookMode = hook ? 'OPENING_CONTEXT' : 'NONE';
  const verifiedLayout=verifiedSourceLayout(cm.shot_map);
  const verifiedShots=verifiedShotsFromShotMap(cm.shot_map,duration);
  const editPlan=buildVerifiedEditPlan({
    decision:{
      presentation_mode:requestedMode,
      source_layout:verifiedLayout ?? verifiedShots?.[0]?.layout ?? generated.source_layout,
      focus_x:generated.focus_x,
      shots:verifiedShots ?? generated.shots?.map((shot)=>verifiedLayout?{...shot,layout:verifiedLayout}:shot),
      headline:hook,
      headline_duration:generated.headline_duration,
    },
    start:sourceStart,
    duration,
    caption_cues:verifiedCues,
    captions_required:true,
    disclosure:typeof existingSeg.disclosure==='string'?existingSeg.disclosure:undefined,
    disclosure_mode:(existingSeg.disclosure_mode as 'none'|'opening'|'persistent'|undefined)??'none',
  });
  const specificity = finalPackageQuality.specificity;
  const nativeVoice = finalPackageQuality.nativeVoice;

  const qualityInputs = {
    truthful:true,
    specificity,
    native_voice:nativeVoice,
    duplicates_subtitle:false,
    ai_editorial_generated:true,
    spoken_text_from_verified_transcript:true,
    timing_metadata_rendered:false,
    caption_cues_structurally_safe:true,
    caption_version:'V4',
    package_model:MODEL,
    package_revision_count:packageRevisionCount,
    package_revision_policy:'ONE_FEEDBACK_DIRECTED_REVISION_MAX',
    editorial_intelligence_version:'V3',
    editorial_hit_index:Number((editorialProfile as Record<string,unknown> | null)?.editorial_candidate_score ?? 0),
    editorial_thesis:String(semanticEvidence.editorial_thesis ?? ''),
    audience_traits:audienceTraits,
    trend_topics:trendTopics,
    first_second_strategy:String(generated.first_second_strategy ?? (treatmentHint as Record<string,unknown> | null)?.first_second_strategy ?? ''),
    editorial_treatment_hint:treatmentHint,
  };

  const {data:packageId,error:pe} = await client.rpc('momentcircuit_record_caption_package',{
    p_run_id:wo.run_id,
    p_generation:wo.generation,
    p_candidate_moment_id:wo.candidate_moment_id,
    p_platform:wo.platform,
    p_hook:hook,
    p_hook_mode:hookMode,
    p_post_caption:postCaption,
    p_required_hashtags:requiredHashtags,
    p_quality_inputs:qualityInputs,
  });
  if (pe) throw new Error(`CAPTION_PACKAGE_WRITE_FAILED: ${pe.message}`);

  payload.edit_plan=editPlan;
  // Dispatcher compatibility: render_segment is now the exact canonical EditPlan, not a second renderer dialect.
  payload.render_segment=editPlan;
  payload.selected_packaging=postCaption;
  payload.required_hashtags=requiredHashtags;
  payload.quality_inputs=qualityInputs;
  payload.caption_package_id=packageId;
  payload.editorial_intelligence=editorialProfile;
  payload.editorial_treatment_hint=treatmentHint;
  payload.prepare_version='AI_EDIT_PLAN_EDITORIAL_V3';
  payload.editorial_intelligence_version='V3';
  payload.editorial_reprepare_required=false;
  payload.prepared_at=new Date().toISOString();
  if (wo.platform==='youtube') {
    const yt = cleanCaption(String(generated.youtube_title ?? ''));
    if (yt.length < 12 || yt.length > 100) throw new Error('YOUTUBE_TITLE_INVALID');
    payload.youtube_title=yt;
  }

  const {error:ue} = await client.from('momentcircuit_creative_work_orders').update({
    payload,
    status:'ready_to_render',
    updated_at:new Date().toISOString(),
  }).eq('id',wo.id);
  if (ue) throw new Error(`WORK_ORDER_PREPARE_UPDATE_FAILED: ${ue.message}`);

  await client.from('momentcircuit_prepare_dispatches').update({
    state:'PREPARED',
    last_error:null,
    updated_at:new Date().toISOString(),
  }).eq('work_order_id',wo.id);

  await client.rpc('momentcircuit_dispatch_pending_renders',{p_limit:8});
  await client.rpc('momentcircuit_dispatch_queued_render_jobs',{p_max_concurrency:2});

  return {
    prepared:true,
    work_order_id:wo.id,
    platform:wo.platform,
    story_family:cm.story_family,
    caption_package_id:packageId,
    caption_cues:verifiedCues.length,
    post_caption:postCaption,
    youtube_title:wo.platform==='youtube' ? payload.youtube_title : null,
    editorial_intelligence_version:'V3',
    editorial_profile:editorialProfile,
    editorial_treatment_hint:treatmentHint,
  };
}

export async function POST(request:NextRequest) {
  try {
    authorize(request);
    const body = await request.json() as {id?:string};
    if (!body.id) return NextResponse.json({error:'id_required'},{status:400});
    return NextResponse.json({ok:true,result:await prepareWorkOrder(body.id)});
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    console.error('MomentCircuit prepare failed',{error:message});
    return NextResponse.json({error:message},{status:message==='UNAUTHORIZED'?401:500});
  }
}
