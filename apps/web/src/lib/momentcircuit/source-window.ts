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
