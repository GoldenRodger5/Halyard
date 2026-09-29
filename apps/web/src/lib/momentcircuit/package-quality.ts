export type PackageQualityInput={
  specificity?:number;
  native_voice?:number;
  unsupported_claims?:string[];
};

export type PackageQuality={
  pass:boolean;
  specificity:number;
  nativeVoice:number;
  reasons:string[];
};

export function assessPackageQuality(input:PackageQualityInput):PackageQuality{
  const specificity=Math.max(0,Math.min(1,Number(input.specificity??0)));
  const nativeVoice=Math.max(0,Math.min(1,Number(input.native_voice??0)));
  const reasons:string[]=[];
  if(Array.isArray(input.unsupported_claims)&&input.unsupported_claims.filter(Boolean).length) reasons.push('UNSUPPORTED_CLAIMS');
  if(specificity<0.78) reasons.push('SPECIFICITY_BELOW_0_78');
  if(nativeVoice<0.80) reasons.push('NATIVE_VOICE_BELOW_0_80');
  return {pass:reasons.length===0,specificity,nativeVoice,reasons};
}

export function packageRevisionFeedback(q:PackageQuality):string{
  const notes:string[]=[];
  if(q.specificity<0.78) notes.push('Make the packaging more concrete and specific to the verified story/payoff. Name the actual premise instead of using generic reaction language.');
  if(q.nativeVoice<0.80) notes.push('Make it sound like a sharp native short-form clip page: concise, conversational, natural, not marketing copy or AI summary language.');
  if(q.reasons.includes('UNSUPPORTED_CLAIMS')) notes.push('Remove every phrase that is not directly supported by the verified story/payoff/requirements.');
  return notes.join(' ');
}