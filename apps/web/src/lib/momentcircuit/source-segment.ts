export const SOURCE_SEGMENT_HOSTS = ['amazonaws.com','cloudfront.net','supabase.co'] as const;

export function sourceSegmentHostAllowed(raw:string):boolean{
  try{
    const u=new URL(raw);
    if(u.protocol!=='https:') return false;
    const h=u.hostname.toLowerCase();
    return SOURCE_SEGMENT_HOSTS.some((allowed)=>h===allowed||h.endsWith('.'+allowed));
  }catch{return false;}
}

export function validateSourceSegment(startRaw:unknown,endRaw:unknown){
  const start=Number(startRaw),end=Number(endRaw);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start) throw new Error('SOURCE_SEGMENT_WINDOW_INVALID');
  const duration=end-start;
  if(duration>180) throw new Error('SOURCE_SEGMENT_WINDOW_TOO_LONG');
  return {start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),duration:Number(duration.toFixed(3))};
}

export function candidateSegmentObjectPath(campaignId:string,candidateId:string,sha256:string){
  const safeCampaign=campaignId.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);
  const safeCandidate=candidateId.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);
  if(!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('SOURCE_SEGMENT_SHA_INVALID');
  return `momentcircuit/source-segments/${safeCampaign}/${safeCandidate}-${sha256.slice(0,20)}.mp4`;
}
