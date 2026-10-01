import crypto from 'node:crypto';
import {
  deriveV4DurationPolicy,effectiveV4CandidateMin,type V4DurationPolicy
} from './v4-duration-policy';

export type SourceProbe={durationSeconds:number;videoCodec:string;width:number;height:number;audioPresent:boolean};
export type TimedSpeech={start:number;end:number;text:string};
export type FrameObservation={at:number;observation:string};
export type MinerFrameRef={at:number};
export type MinerProposal={start_seconds?:unknown;end_seconds?:unknown;
  story_family?:unknown;proposed_story_claim?:unknown;payoff?:unknown;
  platforms?:unknown;visual_reason?:unknown;source_beat_ids?:unknown;
  hook_type?:unknown;hook_strength?:unknown;cold_clarity?:unknown;
  payoff_strength?:unknown;context_tax?:unknown;social_currency?:unknown;
  stop_reason?:unknown;boundary_recovery?:unknown};
export type SourceIntelligenceBeat={
  beat_id:string;start_seconds:number;end_seconds:number;beat_type:string;
  hook_potential:number;cold_clarity:number;payoff_potential:number;
  context_tax:number;social_currency:number;candidate_worthy:boolean;
  transcript_reason:string;visual_reason:string;
};
export type SourceIntelligence={
  version:'v4-source-intelligence-20261001';
  source_summary:string;selection_directive:string;
  beats:SourceIntelligenceBeat[];
  dead_zones:Array<{start_seconds:number;end_seconds:number;reason:string}>;
  frame_observations:FrameObservation[];
};
export type RecoveryProposal={story_family?:unknown;start_seconds?:unknown;
  end_seconds?:unknown;added_context_reason?:unknown;
  added_visual_evidence_at_seconds?:unknown};
export type MinedCandidate={candidate_id:string;platform:'tiktok'|'youtube';
  start_seconds:number;end_seconds:number;story_family:string;
  proposed_story_claim:string;transcript_evidence:Record<string,unknown>};

const SHA=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseMinerSourceProbe(stderr:string):SourceProbe{
  const duration=stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  const video=stderr.match(/Video:\s*([a-zA-Z0-9_.-]+)[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  if(!duration||!video) throw new Error('MINER_SOURCE_PROBE_INVALID');
  const durationSeconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
  const width=Number(video[2]),height=Number(video[3]);
  if(!Number.isFinite(durationSeconds)||durationSeconds<1||durationSeconds>21600
    ||width<1||height<1||width>16384||height>16384){
    throw new Error('MINER_SOURCE_PROBE_INVALID');
  }
  return {durationSeconds:Math.floor(durationSeconds*1000)/1000,
    videoCodec:String(video[1]).toLowerCase(),width,height,
    audioPresent:/Audio:\s*[a-zA-Z0-9_.-]+/.test(stderr)};
}

export function stableMomentId(sourceWorkId:string,start:number,end:number,family:string){
  if(!UUID.test(sourceWorkId)||!Number.isFinite(start)||!Number.isFinite(end)||!family){
    throw new Error('MINER_IDENTITY_INVALID');
  }
  const bytes=crypto.createHash('sha256')
    .update(`${sourceWorkId}:${start.toFixed(3)}:${end.toFixed(3)}:${family}`)
    .digest().subarray(0,16);
  bytes[6]=((bytes[6]??0)&0x0f)|0x50;
  bytes[8]=((bytes[8]??0)&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function storySlug(value:unknown){
  return (typeof value==='string'?value:'').toLowerCase().replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'').slice(0,80);
}

function safeText(value:unknown,max:number){
  return typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):'';
}

function numericSeconds(value:unknown){
  if(typeof value==='number'&&Number.isFinite(value)) return value;
  if(typeof value==='string'&&/^\s*\d+(?:\.\d+)?\s*$/.test(value)){
    const parsed=Number(value.trim());
    return Number.isFinite(parsed)?parsed:null;
  }
  return null;
}

function normalizedPlatforms(value:unknown){
  const values=Array.isArray(value)?value:typeof value==='string'?[value]:[];
  return values.filter((x):x is 'tiktok'|'youtube'=>x==='tiktok'||x==='youtube');
}

const SOURCE_BEAT_TYPES=new Set([
  'CONFLICT','DANGER','SURPRISE_REVEAL','PUNCHLINE','PHYSICAL_ACTION',
  'REACTION','SOCIAL_AWKWARDNESS','HIGH_STAKES_CHOICE','SPECTACLE',
  'EMOTIONAL_TURN','EXPOSITION','TRANSITION','OTHER'
]);
const DIRECTOR_HOOK_TYPES=new Set([
  'CONFLICT','DANGER','SURPRISE_REVEAL','PUNCHLINE','PHYSICAL_ACTION',
  'REACTION','SOCIAL_AWKWARDNESS','HIGH_STAKES_CHOICE','SPECTACLE',
  'EMOTIONAL_TURN','OTHER'
]);

function score100(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0&&n<=100?Number(n.toFixed(2)):null;
}

export function v4SourceIntelligencePrompt(){
  return 'First analyze the WHOLE source before selecting any clip. Return JSON only: '
    +'{"source_summary":"what happens across the source",'
    +'"selection_directive":"what kinds of beats are actually worth considering",'
    +'"frame_observations":[{"at_seconds":0.0,"observation":"visible fact"}],'
    +'"beats":[{"beat_id":"b1","start_seconds":0.0,"end_seconds":4.0,'
    +'"beat_type":"CONFLICT|DANGER|SURPRISE_REVEAL|PUNCHLINE|PHYSICAL_ACTION|REACTION|SOCIAL_AWKWARDNESS|HIGH_STAKES_CHOICE|SPECTACLE|EMOTIONAL_TURN|EXPOSITION|TRANSITION|OTHER",'
    +'"hook_potential":0,"cold_clarity":0,"payoff_potential":0,"context_tax":0,'
    +'"social_currency":0,"candidate_worthy":false,'
    +'"transcript_reason":"what the spoken beat contributes",'
    +'"visual_reason":"what the supplied frames visibly contribute"}],'
    +'"dead_zones":[{"start_seconds":0.0,"end_seconds":2.0,"reason":"routine setup/exposition/logistics/etc"}]}. '
    +'Scores are 0-100 editorial estimates, not measured retention. Map the source honestly. '
    +'Routine exposition, greetings, logistics, generic affection/goodbyes, fandom-only lore and slow setup '
    +'should normally be candidate_worthy=false unless an immediate twist, conflict, stakes, reaction or payoff makes the beat intrinsically compelling.';
}

export function normalizeSourceIntelligence(args:{
  raw:unknown;durationSeconds:number;frames:MinerFrameRef[];
}):SourceIntelligence{
  if(!args.raw||typeof args.raw!=='object'||Array.isArray(args.raw)
    ||!Number.isFinite(args.durationSeconds)||args.durationSeconds<=0){
    throw new Error('SOURCE_INTELLIGENCE_INVALID');
  }
  const row=args.raw as Record<string,unknown>;
  const sourceSummary=safeText(row.source_summary,800);
  const selectionDirective=safeText(row.selection_directive,600);
  if(sourceSummary.length<12||selectionDirective.length<12){
    throw new Error('SOURCE_INTELLIGENCE_SUMMARY_MISSING');
  }
  const frameObservations=normalizeMinerFrameObservations(row.frame_observations,args.frames);
  const beats=(Array.isArray(row.beats)?row.beats:[]).flatMap((value,index)=>{
    if(!value||typeof value!=='object') return [];
    const b=value as Record<string,unknown>;
    const start=numericSeconds(b.start_seconds),end=numericSeconds(b.end_seconds);
    const beatType=safeText(b.beat_type,40).toUpperCase();
    const hook=score100(b.hook_potential),cold=score100(b.cold_clarity);
    const payoff=score100(b.payoff_potential),context=score100(b.context_tax);
    const social=score100(b.social_currency);
    const transcriptReason=safeText(b.transcript_reason,400);
    const visualReason=safeText(b.visual_reason,400);
    if(start===null||end===null||start<0||end<=start||end>args.durationSeconds+0.001
      ||!SOURCE_BEAT_TYPES.has(beatType)||hook===null||cold===null||payoff===null
      ||context===null||social===null||typeof b.candidate_worthy!=='boolean'
      ||transcriptReason.length<8||visualReason.length<8) return [];
    return [{
      beat_id:storySlug(b.beat_id)||`beat_${index+1}`,
      start_seconds:start,end_seconds:end,beat_type:beatType,
      hook_potential:hook,cold_clarity:cold,payoff_potential:payoff,
      context_tax:context,social_currency:social,candidate_worthy:b.candidate_worthy,
      transcript_reason:transcriptReason,visual_reason:visualReason
    }];
  }).slice(0,30);
  if(!beats.length) throw new Error('SOURCE_INTELLIGENCE_BEATS_MISSING');
  const deadZones=(Array.isArray(row.dead_zones)?row.dead_zones:[]).flatMap(value=>{
    if(!value||typeof value!=='object') return [];
    const d=value as Record<string,unknown>;
    const start=numericSeconds(d.start_seconds),end=numericSeconds(d.end_seconds);
    const reason=safeText(d.reason,300);
    return start!==null&&end!==null&&start>=0&&end>start&&end<=args.durationSeconds+0.001
      &&reason.length>=8?[{start_seconds:start,end_seconds:end,reason}]:[];
  }).slice(0,20);
  return {version:'v4-source-intelligence-20261001',source_summary:sourceSummary,
    selection_directive:selectionDirective,beats,dead_zones:deadZones,frame_observations:frameObservations};
}

function directorEvidence(row:MinerProposal){
  const hookType=safeText(row.hook_type,40).toUpperCase();
  const hook=score100(row.hook_strength),cold=score100(row.cold_clarity);
  const payoff=score100(row.payoff_strength),context=score100(row.context_tax);
  const social=score100(row.social_currency);
  const stopReason=safeText(row.stop_reason,500);
  const beatIds=(Array.isArray(row.source_beat_ids)?row.source_beat_ids:[])
    .map(x=>storySlug(x)).filter(Boolean).slice(0,6);
  if(!DIRECTOR_HOOK_TYPES.has(hookType)||hook===null||cold===null||payoff===null
    ||context===null||social===null||stopReason.length<12||beatIds.length===0) return null;
  const score=Number((0.30*hook+0.20*cold+0.20*payoff+0.15*social+0.15*(100-context)).toFixed(2));
  const reasons:string[]=[];
  if(hook<70) reasons.push('HOOK_LT_70');
  if(cold<65) reasons.push('COLD_CLARITY_LT_65');
  if(payoff<65) reasons.push('PAYOFF_LT_65');
  if(context>60) reasons.push('CONTEXT_TAX_GT_60');
  if(score<70) reasons.push('DIRECTOR_SCORE_LT_70');
  return {pass:reasons.length===0,score,hook_type:hookType,hook_strength:hook,
    cold_clarity:cold,payoff_strength:payoff,context_tax:context,
    social_currency:social,stop_reason:stopReason,source_beat_ids:beatIds,reasons};
}

export function v4MinerCandidateSchemaPrompt(allowedPlatforms:string[]){
  const eligible=allowedPlatforms.filter(x=>x==='tiktok'||x==='youtube');
  return 'Return exactly this JSON shape: '
    +'{"candidates":[{"story_family":"short_stable_slug",'
    +'"proposed_story_claim":"complete story claim","payoff":"specific payoff",'
    +'"visual_reason":"specific visible reason","start_seconds":0.0,"end_seconds":10.5,'
    +'"platforms":["tiktok"],"source_beat_ids":["b1"],'
    +'"hook_type":"CONFLICT|DANGER|SURPRISE_REVEAL|PUNCHLINE|PHYSICAL_ACTION|REACTION|SOCIAL_AWKWARDNESS|HIGH_STAKES_CHOICE|SPECTACLE|EMOTIONAL_TURN|OTHER",'
    +'"hook_strength":0,"cold_clarity":0,"payoff_strength":0,"context_tax":0,'
    +'"social_currency":0,"stop_reason":"why a cold viewer would stop now"}],'
    +'"reason":"brief explanation"}. '
    +'All scores are JSON numbers 0-100, never strings. start_seconds and end_seconds must be JSON numbers, never strings. '
    +'platforms must be an array containing only eligible values: '+eligible.join(', ')+'. '
    +'Select ONLY high-conviction windows anchored to source_beat_ids from the supplied source-intelligence map. '
    +'Every candidate must already satisfy the supplied preferred minimum and campaign maximum. '
    +'If the semantic core is shorter, widen to meaningful source-native setup, action, reaction or payoff before returning it; otherwise omit it. '
    +'A merely coherent or emotional scene is not enough: routine exposition, logistics, greetings, generic affection/goodbyes and fandom-only lore should be omitted unless the opening itself has immediate conflict, surprise, stakes, action/reaction, humor or another strong stop reason.';
}

export function normalizeMinerFrameObservations(raw:unknown,frames:MinerFrameRef[]){
  const observations=(Array.isArray(raw)?raw:[]).flatMap(value=>{
    if(!value||typeof value!=='object') return [];
    const item=value as {at_seconds?:unknown;observation?:unknown};
    const at=Number(item.at_seconds);
    const observation=safeText(item.observation,300);
    const frame=frames.find(row=>Math.abs(row.at-at)<=0.05);
    return Number.isFinite(at)&&observation.length>=8&&frame
      ?[{at:frame.at,observation}]:[];
  });
  return [...new Map(observations.map(x=>[x.at,x])).values()]
    .sort((a,b)=>a.at-b.at);
}

export function selectMinerFrameEvidenceRepairTargets(args:{
  frames:MinerFrameRef[];existing:FrameObservation[];target?:number;
}){
  const target=Math.max(1,args.target??4);
  const existingTimes=new Set(args.existing.map(x=>x.at));
  const missing=args.frames.filter(frame=>!existingTimes.has(frame.at));
  const need=Math.max(0,target-args.existing.length);
  if(need===0||missing.length===0) return [] as MinerFrameRef[];
  if(missing.length<=need) return missing;
  const selected:MinerFrameRef[]=[];
  for(let i=0;i<need;i++){
    const index=Math.min(missing.length-1,
      Math.floor((i+0.5)*missing.length/need));
    const frame=missing[index];
    if(frame&&!selected.some(x=>x.at===frame.at)) selected.push(frame);
  }
  return selected;
}

export function mergeMinerFrameObservations(
  existing:FrameObservation[],repaired:FrameObservation[]){
  // Existing evidence came from the primary multimodal mining decision and
  // remains authoritative when the repair call happens to repeat a timestamp.
  return [...new Map([...repaired,...existing].map(x=>[x.at,x])).values()]
    .sort((a,b)=>a.at-b.at);
}

function normalizedWindow(row:MinerProposal){
  const start=numericSeconds(row.start_seconds),end=numericSeconds(row.end_seconds);
  if(start===null||end===null) return null;
  const s=Math.round(start*1000)/1000,e=Math.floor(end*1000)/1000;
  return e>s?{start:s,end:e,length:e-s}:null;
}

function proposalShapeValid(row:MinerProposal,allowedPlatforms:string[]){
  const family=storySlug(row.story_family);
  const claim=safeText(row.proposed_story_claim,240);
  const payoff=safeText(row.payoff,240);
  const visualReason=safeText(row.visual_reason,300);
  const selected=normalizedPlatforms(row.platforms)
    .filter(x=>allowedPlatforms.includes(x));
  return family.length>=3&&claim.length>=8&&payoff.length>=8&&visualReason.length>=8
    &&selected.length>0;
}

export function recoverableShortMinerProposals(args:{
  proposals:unknown;durationSeconds:number;durationPolicy:V4DurationPolicy;
  allowedPlatforms:string[];
}){
  if(!Array.isArray(args.proposals)) return [] as Array<{
    row:MinerProposal;family:string;start:number;end:number;length:number}>;
  const floor=effectiveV4CandidateMin(args.durationPolicy,args.durationSeconds);
  if(floor===null) return [];
  const rows:Array<{row:MinerProposal;family:string;start:number;end:number;length:number}>=[];
  for(const raw of args.proposals.slice(0,40)){
    if(!raw||typeof raw!=='object') continue;
    const row=raw as MinerProposal;
    const window=normalizedWindow(row);
    if(!window||window.start<0||window.end>args.durationSeconds
      ||window.length>=floor||window.length>180
      ||(args.durationPolicy.contractMaxSeconds!==null
        &&window.length>args.durationPolicy.contractMaxSeconds)
      ||!proposalShapeValid(row,args.allowedPlatforms)) continue;
    rows.push({row,family:storySlug(row.story_family),...window});
    if(rows.length>=8) break;
  }
  return rows;
}

function overlaps(start:number,end:number,a:number,b:number){
  return Math.max(0,Math.min(end,b)-Math.max(start,a))>0.001;
}

export function applyBoundaryRecovery(args:{
  originalProposals:unknown;
  recoveredProposals:unknown;
  durationSeconds:number;
  durationPolicy:V4DurationPolicy;
  allowedPlatforms:string[];
  transcript:TimedSpeech[];
  frameObservations:FrameObservation[];
}):MinerProposal[]{
  if(!Array.isArray(args.recoveredProposals)) return [];
  const floor=effectiveV4CandidateMin(args.durationPolicy,args.durationSeconds);
  if(floor===null) return [];
  const originals=recoverableShortMinerProposals({
    proposals:args.originalProposals,durationSeconds:args.durationSeconds,
    durationPolicy:args.durationPolicy,allowedPlatforms:args.allowedPlatforms});
  const byFamily=new Map(originals.map(x=>[x.family,x]));
  const accepted:MinerProposal[]=[];
  const used=new Set<string>();
  for(const raw of args.recoveredProposals.slice(0,16)){
    if(!raw||typeof raw!=='object') continue;
    const row=raw as RecoveryProposal;
    const family=storySlug(row.story_family);
    const original=byFamily.get(family);
    const rawStart=numericSeconds(row.start_seconds);
    const rawEnd=numericSeconds(row.end_seconds);
    if(!original||used.has(family)||rawStart===null||rawEnd===null) continue;
    const start=Math.round(rawStart*1000)/1000;
    const end=Math.floor(rawEnd*1000)/1000;
    if(!Number.isFinite(start)||!Number.isFinite(end)
      ||start<0||end>args.durationSeconds||end<=start
      ||start>original.start+0.001||end<original.end-0.001
      ||(Math.abs(start-original.start)<=0.001&&Math.abs(end-original.end)<=0.001)) continue;
    const length=end-start;
    if(length+0.0005<floor||length>180
      ||(args.durationPolicy.contractMaxSeconds!==null
        &&length>args.durationPolicy.contractMaxSeconds+0.0005)) continue;
    const reason=safeText(row.added_context_reason,300);
    if(reason.length<12) continue;

    const addedSpeech=args.transcript.filter(segment=>{
      const text=segment.text.trim();
      if(!text) return false;
      return (start<original.start
          &&overlaps(segment.start,segment.end,start,original.start))
        ||(end>original.end
          &&overlaps(segment.start,segment.end,original.end,end));
    });
    const requestedVisual=Array.isArray(row.added_visual_evidence_at_seconds)
      ?row.added_visual_evidence_at_seconds.map(Number).filter(Number.isFinite):[];
    const visualEvidence=requestedVisual.flatMap(at=>{
      const frame=args.frameObservations.find(x=>Math.abs(x.at-at)<=0.05);
      if(!frame) return [];
      const inExtension=(start<original.start&&frame.at>=start&&frame.at<original.start)
        ||(end>original.end&&frame.at>original.end&&frame.at<=end);
      return inExtension&&frame.observation.trim().length>=8?[frame]:[];
    });
    if(!addedSpeech.length&&!visualEvidence.length) continue;

    accepted.push({...original.row,start_seconds:start,end_seconds:end,
      boundary_recovery:{
        policy_version:args.durationPolicy.version,
        original_start_seconds:original.start,
        original_end_seconds:original.end,
        added_context_reason:reason,
        added_speech_segments:addedSpeech,
        added_visual_evidence:visualEvidence
      }});
    used.add(family);
  }
  return accepted;
}

export function normalizeMinerProposals(args:{
  proposals:unknown;sourceWorkId:string;sourceSha256:string;
  durationSeconds:number;minVideoSeconds:number;maxVideoSeconds:number|null;
  allowedPlatforms:string[];transcript:TimedSpeech[];model:string;
  durationPolicy?:V4DurationPolicy;requireDirectorEvidence?:boolean;
}):MinedCandidate[]{
  const policy=args.durationPolicy??deriveV4DurationPolicy({
    minVideoSeconds:args.minVideoSeconds,maxVideoSeconds:args.maxVideoSeconds});
  if(!UUID.test(args.sourceWorkId)||!SHA.test(args.sourceSha256)
    ||!Array.isArray(args.proposals)
    ||!Number.isFinite(args.durationSeconds)||args.durationSeconds<=0
    ||!Number.isFinite(args.minVideoSeconds)||args.minVideoSeconds<=0
    ||args.maxVideoSeconds!==null&&(!Number.isFinite(args.maxVideoSeconds)
      ||args.maxVideoSeconds<args.minVideoSeconds)){
    throw new Error('MINER_PROPOSALS_INVALID');
  }
  const minCandidate=effectiveV4CandidateMin(policy,args.durationSeconds);
  if(minCandidate===null) return [];
  const accepted:MinedCandidate[]=[];
  const seenFamilies=new Set<string>();
  const seenWindows:Array<{start:number;end:number}>=[];
  const transcriptSha=crypto.createHash('sha256')
    .update(JSON.stringify(args.transcript)).digest('hex');
  for(const raw of args.proposals.slice(0,40)){
    if(!raw||typeof raw!=='object') continue;
    const row=raw as MinerProposal;
    const window=normalizedWindow(row);
    if(!window) continue;
    const {start:s,end:e,length}=window;
    if(s<0||e>args.durationSeconds||length+0.0005<minCandidate
      ||length>180||(args.maxVideoSeconds!==null&&length>args.maxVideoSeconds)) continue;
    const family=storySlug(row.story_family);
    const claim=safeText(row.proposed_story_claim,240);
    const payoff=safeText(row.payoff,240);
    const visualReason=safeText(row.visual_reason,300);
    const director=args.requireDirectorEvidence?directorEvidence(row):null;
    if(family.length<3||claim.length<8||payoff.length<8||visualReason.length<8
      ||seenFamilies.has(family)
      ||(args.requireDirectorEvidence&&(!director||!director.pass))) continue;
    const nearDuplicate=seenWindows.some(w=>{
      const overlap=Math.max(0,Math.min(e,w.end)-Math.max(s,w.start));
      return overlap/Math.min(length,w.end-w.start)>0.7;
    });
    if(nearDuplicate) continue;
    const selected=normalizedPlatforms(row.platforms)
      .filter(x=>args.allowedPlatforms.includes(x));
    if(!selected.length) continue;
    const id=stableMomentId(args.sourceWorkId,s,e,family);
    const speech=args.transcript.filter(x=>x.end>s&&x.start<e)
      .map(x=>({start:x.start,end:x.end,text:x.text.slice(0,500)}));
    const recovery=row.boundary_recovery&&typeof row.boundary_recovery==='object'
      ?row.boundary_recovery:undefined;
    for(const platform of [...new Set(selected)]){
      accepted.push({candidate_id:id,platform,start_seconds:s,end_seconds:e,
        story_family:family,proposed_story_claim:claim,
        transcript_evidence:{model:args.model,source_sha256:args.sourceSha256,
          transcript_sha256:transcriptSha,speech_segments:speech,
          payoff,visual_reason:visualReason,
          ...(director?{source_intelligence_selection:director}:{}),
          duration_policy:{version:policy.version,
            render_safe_min_seconds:policy.renderSafeMinSeconds,
            preferred_min_seconds:minCandidate},
          ...(recovery?{boundary_recovery:recovery}:{})}});
    }
    seenFamilies.add(family);
    seenWindows.push({start:s,end:e});
    if(seenFamilies.size>=20) break;
  }
  return accepted;
}
