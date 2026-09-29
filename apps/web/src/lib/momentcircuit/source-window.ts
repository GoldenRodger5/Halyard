export type CandidateWindow={start:number;duration:number;end:number};

export function candidateSourceWindow(startValue:unknown,endValue:unknown):CandidateWindow{
  const start=Number(startValue);
  const end=Number(endValue);
  if(!Number.isFinite(start)||start<0) throw new Error('CANDIDATE_SOURCE_START_INVALID');
  if(!Number.isFinite(end)||end<=start) throw new Error('CANDIDATE_SOURCE_END_INVALID');
  const duration=end-start;
  if(duration<=0||duration>180) throw new Error('CANDIDATE_SOURCE_DURATION_INVALID');
  return {start:Number(start.toFixed(3)),duration:Number(duration.toFixed(3)),end:Number(end.toFixed(3))};
}

export function prepareSourceWindow(candidateStart:unknown,candidateEnd:unknown,existingSegment:Record<string,unknown>|undefined,alreadyPrepared:boolean):CandidateWindow{
  const candidate=candidateSourceWindow(candidateStart,candidateEnd);
  if(!alreadyPrepared) return candidate;
  const seg=existingSegment??{};
  const start=Number(seg.start);
  const duration=Number(seg.duration);
  if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0) return candidate;
  const end=start+duration;
  if(start<candidate.start-0.01||end>candidate.end+0.01) return candidate;
  return {start:Number(start.toFixed(3)),duration:Number(duration.toFixed(3)),end:Number(end.toFixed(3))};
}
