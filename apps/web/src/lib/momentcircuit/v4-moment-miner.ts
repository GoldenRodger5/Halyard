import crypto from 'node:crypto';

export type SourceProbe={durationSeconds:number;videoCodec:string;width:number;height:number;audioPresent:boolean};
export type TimedSpeech={start:number;end:number;text:string};
export type MinerProposal={start_seconds?:unknown;end_seconds?:unknown;
  story_family?:unknown;proposed_story_claim?:unknown;payoff?:unknown;
  platforms?:unknown;visual_reason?:unknown};
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

export function normalizeMinerProposals(args:{
  proposals:unknown;sourceWorkId:string;sourceSha256:string;
  durationSeconds:number;minVideoSeconds:number;maxVideoSeconds:number|null;
  allowedPlatforms:string[];transcript:TimedSpeech[];model:string;
}):MinedCandidate[]{
  if(!UUID.test(args.sourceWorkId)||!SHA.test(args.sourceSha256)
    ||!Array.isArray(args.proposals)
    ||!Number.isFinite(args.durationSeconds)||args.durationSeconds<=0
    ||!Number.isFinite(args.minVideoSeconds)||args.minVideoSeconds<=0
    ||args.maxVideoSeconds!==null&&(!Number.isFinite(args.maxVideoSeconds)
      ||args.maxVideoSeconds<args.minVideoSeconds)){
    throw new Error('MINER_PROPOSALS_INVALID');
  }
  const accepted:MinedCandidate[]=[];
  const seenFamilies=new Set<string>();
  const seenWindows:Array<{start:number;end:number}>=[];
  const transcriptSha=crypto.createHash('sha256')
    .update(JSON.stringify(args.transcript)).digest('hex');
  for(const raw of args.proposals.slice(0,40)){
    if(!raw||typeof raw!=='object') continue;
    const row=raw as MinerProposal;
    if(typeof row.start_seconds!=='number'||typeof row.end_seconds!=='number') continue;
    const start=Number(row.start_seconds),end=Number(row.end_seconds);
    if(!Number.isFinite(start)||!Number.isFinite(end)) continue;
    const s=Math.round(start*1000)/1000,e=Math.floor(end*1000)/1000;
    const length=e-s;
    if(s<0||e>args.durationSeconds||length<args.minVideoSeconds
      ||length>180||(args.maxVideoSeconds!==null&&length>args.maxVideoSeconds)) continue;
    const family=storySlug(row.story_family);
    const claim=safeText(row.proposed_story_claim,240);
    const payoff=safeText(row.payoff,240);
    const visualReason=safeText(row.visual_reason,300);
    if(family.length<3||claim.length<8||payoff.length<8||visualReason.length<8
      ||seenFamilies.has(family)) continue;
    const nearDuplicate=seenWindows.some(w=>{
      const overlap=Math.max(0,Math.min(e,w.end)-Math.max(s,w.start));
      return overlap/Math.min(length,w.end-w.start)>0.7;
    });
    if(nearDuplicate) continue;
    const platforms=Array.isArray(row.platforms)?row.platforms:[];
    const selected=platforms.filter((x):x is 'tiktok'|'youtube'=>
      (x==='tiktok'||x==='youtube')&&args.allowedPlatforms.includes(x));
    if(!selected.length) continue;
    const id=stableMomentId(args.sourceWorkId,s,e,family);
    const speech=args.transcript.filter(x=>x.end>s&&x.start<e)
      .map(x=>({start:x.start,end:x.end,text:x.text.slice(0,500)}));
    for(const platform of [...new Set(selected)]){
      accepted.push({candidate_id:id,platform,start_seconds:s,end_seconds:e,
        story_family:family,proposed_story_claim:claim,
        transcript_evidence:{model:args.model,source_sha256:args.sourceSha256,
          transcript_sha256:transcriptSha,speech_segments:speech,
          payoff,visual_reason:visualReason}});
    }
    seenFamilies.add(family);
    seenWindows.push({start:s,end:e});
    if(seenFamilies.size>=20) break;
  }
  return accepted;
}
