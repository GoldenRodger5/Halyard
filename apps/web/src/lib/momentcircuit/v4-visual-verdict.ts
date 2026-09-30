const CONTENT_CLASSES=new Set([
  'STREAMER_REACTION','ANIMATION_SCENE','PODCAST_CONVERSATION',
  'GAMING_CLIP','SPORTS_CLIP','CELEBRITY_INTERVIEW',
  'MUSIC_PERFORMANCE','CREATOR_STORY','OTHER']);

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
  return {event:'CANDIDATE_VERIFIED' as const,evidence:{...common,
    visual_verdict:'PASS',story_claim:storyClaim,payoff,
    first_second_reason:firstSecondReason,content_class:contentClass,
    content_class_evidence:contentClassEvidence}};
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
