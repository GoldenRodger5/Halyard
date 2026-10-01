const CONTENT_CLASSES=new Set([
  'STREAMER_REACTION','ANIMATION_SCENE','PODCAST_CONVERSATION',
  'GAMING_CLIP','SPORTS_CLIP','CELEBRITY_INTERVIEW',
  'MUSIC_PERFORMANCE','CREATOR_STORY','OTHER']);

const ATTENTION_ARCHETYPES=new Set([
  'PHYSICAL_CHAOS','SURPRISE_REVEAL','CONFRONTATION','PUNCHLINE','DANGER',
  'SOCIAL_AWKWARDNESS','EMOTIONAL_PAYOFF','LORE_EXPOSITION',
  'RELATIONSHIP_MOMENT','OTHER']);

function boundedScore(value:unknown,name:string){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>100) throw new Error(`ATTENTION_${name}_INVALID`);
  return Number(n.toFixed(2));
}

function boundedLatency(value:unknown,duration:number,name:string){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>duration+0.25){
    throw new Error(`ATTENTION_${name}_INVALID`);
  }
  return Number(Math.min(duration,n).toFixed(3));
}

export function attentionGate(attention:{
  hook_visual:number;hook_spoken:number;cold_comprehension:number;
  motion_reaction_density:number;surprise_tension_humor:number;
  payoff_strength:number;commentability:number;rewatchability:number;
  context_tax:number;hook_latency_seconds:number;requires_fandom_context:boolean;
}){
  const hook=Math.max(attention.hook_visual,attention.hook_spoken);
  const score=Number(Math.max(0,Math.min(100,
    0.25*hook
    +0.15*attention.cold_comprehension
    +0.10*attention.motion_reaction_density
    +0.15*attention.surprise_tension_humor
    +0.15*attention.payoff_strength
    +0.08*attention.commentability
    +0.07*attention.rewatchability
    +0.05*(100-attention.context_tax)
    -(attention.requires_fandom_context?8:0)
  )).toFixed(2));
  const reasons:string[]=[];
  if(hook<65) reasons.push('HOOK_STRENGTH_LT_65');
  if(attention.cold_comprehension<62) reasons.push('COLD_COMPREHENSION_LT_62');
  if(attention.payoff_strength<60) reasons.push('PAYOFF_STRENGTH_LT_60');
  if(attention.context_tax>65) reasons.push('CONTEXT_TAX_GT_65');
  if(attention.hook_latency_seconds>2) reasons.push('HOOK_LATENCY_GT_2S');
  if(score<65) reasons.push('STOP_POWER_LT_65');
  return {pass:reasons.length===0,score,hook,reasons};
}

function normalizeAttention(value:unknown,duration:number){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new Error('ATTENTION_PROFILE_MISSING');
  }
  const row=value as Record<string,unknown>;
  const archetype=text(row.archetype,50);
  const reason=text(row.attention_reason,500);
  if(!ATTENTION_ARCHETYPES.has(archetype)||reason.length<12
    ||typeof row.requires_fandom_context!=='boolean'){
    throw new Error('ATTENTION_PROFILE_INCOMPLETE');
  }
  return {
    version:'v4-attention-director-20261001',
    hook_visual:boundedScore(row.hook_visual,'HOOK_VISUAL'),
    hook_spoken:boundedScore(row.hook_spoken,'HOOK_SPOKEN'),
    cold_comprehension:boundedScore(row.cold_comprehension,'COLD_COMPREHENSION'),
    motion_reaction_density:boundedScore(row.motion_reaction_density,'MOTION_REACTION'),
    surprise_tension_humor:boundedScore(row.surprise_tension_humor,'SURPRISE_TENSION_HUMOR'),
    payoff_strength:boundedScore(row.payoff_strength,'PAYOFF'),
    commentability:boundedScore(row.commentability,'COMMENTABILITY'),
    rewatchability:boundedScore(row.rewatchability,'REWATCHABILITY'),
    context_tax:boundedScore(row.context_tax,'CONTEXT_TAX'),
    hook_latency_seconds:boundedLatency(row.hook_latency_seconds,duration,'HOOK_LATENCY'),
    payoff_latency_seconds:boundedLatency(row.payoff_latency_seconds,duration,'PAYOFF_LATENCY'),
    archetype,
    requires_fandom_context:row.requires_fandom_context,
    attention_reason:reason
  };
}

type Frame={at:number;bytes:Buffer};
function text(value:unknown,max=500){
  return typeof value==='string'?value.trim().slice(0,max):'';
}

export function visualFrameTimes(start:number,end:number,count=8){
  if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<4||count<4){
    throw new Error('VISUAL_WINDOW_INVALID');
  }
  const duration=end-start;
  return Array.from({length:count},(_,i)=>
    Number((start+Math.min(duration-0.15,Math.max(0.05,
      (i+0.5)*duration/count))).toFixed(3)));
}

export function normalizeVisualVerdict(input:{raw:unknown;frames:Frame[];
  start:number;end:number;candidateId:string;segmentSha:string;model:string}){
  const {raw,frames,start,end,candidateId,segmentSha,model}=input;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    throw new Error('VISUAL_AI_SHAPE_INVALID');
  }
  const row=raw as Record<string,unknown>;
  if(!Array.isArray(row.observations)){
    throw new Error('VISUAL_OBSERVATIONS_MISSING');
  }
  const observations=row.observations.flatMap(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value)) return [];
    const item=value as Record<string,unknown>;
    const at=Number(item.at_seconds);
    const frame=frames.find(f=>Math.abs(f.at-at)<=0.02);
    const observation=text(item.observation,300);
    return frame&&observation.length>=8
      ?[{at_seconds:frame.at,observation}]:[];
  });
  const unique=[...new Map(observations.map(o=>[o.at_seconds,o])).values()];
  if(unique.length<4||!unique.some(o=>o.at_seconds<=start+2)
    ||!unique.some(o=>o.at_seconds>=end-2)){
    throw new Error('VISUAL_OBSERVATIONS_INCOMPLETE');
  }
  const common={candidate_id:candidateId,segment_sha256:segmentSha,
    visual_model:model,observations:unique};
  if(row.visual_verdict==='FAIL'){
    const reason=text(row.reason);
    if(reason.length<12) throw new Error('VISUAL_REJECTION_REASON_MISSING');
    return {event:'MOMENT_REJECTED' as const,evidence:{...common,
      visual_verdict:'FAIL',failure_stage:'AI_REVIEW',reason}};
  }
  if(row.visual_verdict!=='PASS') throw new Error('VISUAL_VERDICT_MISSING');
  const storyClaim=text(row.story_claim);
  const payoff=text(row.payoff);
  const firstSecondReason=text(row.first_second_reason);
  const contentClass=text(row.content_class);
  const contentClassEvidence=text(row.content_class_evidence);
  if(storyClaim.length<8||payoff.length<8||firstSecondReason.length<8
    ||!CONTENT_CLASSES.has(contentClass)||contentClassEvidence.length<12){
    throw new Error('VISUAL_PASS_EVIDENCE_INCOMPLETE');
  }
  const attention=normalizeAttention(row.attention,end-start);
  const attentionGateResult=attentionGate(attention);
  if(!attentionGateResult.pass){
    return {event:'MOMENT_REJECTED' as const,evidence:{...common,
      visual_verdict:'FAIL',failure_stage:'ATTENTION_GATE',
      reason:`Cold-feed stop power failed: ${attentionGateResult.reasons.join(', ')}`,
      story_claim:storyClaim,payoff,first_second_reason:firstSecondReason,
      content_class:contentClass,content_class_evidence:contentClassEvidence,
      attention:{...attention,gate:attentionGateResult}}};
  }
  return {event:'CANDIDATE_VERIFIED' as const,evidence:{...common,
    visual_verdict:'PASS',story_claim:storyClaim,payoff,
    first_second_reason:firstSecondReason,content_class:contentClass,
    content_class_evidence:contentClassEvidence,
    attention:{...attention,gate:attentionGateResult}}};
}

export function classifyVisualFailure(message:string){
  if(/^(SOURCE_NATIVE_WINDOW_OUTSIDE_CAMPAIGN_SPEC|ENCODED_SEGMENT_OUTSIDE_CAMPAIGN_SPEC)$/.test(message)){
    return {failureClass:'MOMENT_BAD' as const,terminal:true};
  }
  if(/RIGHTS|CURRENT_CONTRACT|BUDGET|CAMPAIGN_HOLD/.test(message)){
    return {failureClass:'COMPLIANCE' as const,terminal:false};
  }
  if(/PRIVATE_SOURCE_BUCKET|FFMPEG_BINARY|SEGMENT_OBJECT_CONFLICT|SHA_MISMATCH/.test(message)){
    return {failureClass:'SYSTEMIC' as const,terminal:false};
  }
  return {failureClass:'TRANSIENT' as const,terminal:false};
}
