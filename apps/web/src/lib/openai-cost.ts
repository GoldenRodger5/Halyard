export type OpenAiTokenUsage={
  prompt_tokens?:number;
  completion_tokens?:number;
  input_tokens?:number;
  output_tokens?:number;
};

const TOKEN_RATES:Record<string,{inputPerMillion:number;outputPerMillion:number}>={
  'gpt-5.5':{inputPerMillion:5,outputPerMillion:30},
  'gpt-6-luna':{inputPerMillion:.1,outputPerMillion:.5},
};

export function openAiTokenCostUsd(model:string,usage:OpenAiTokenUsage|undefined|null){
  const rate=TOKEN_RATES[model];
  if(!rate||!usage) return null;
  const input=Number(usage.input_tokens??usage.prompt_tokens??0);
  const output=Number(usage.output_tokens??usage.completion_tokens??0);
  if(!Number.isFinite(input)||input<0||!Number.isFinite(output)||output<0) return null;
  // Deliberately ignore cached-input discounts. Full input rate is a safe
  // overestimate while still being far tighter than settling the full reserve.
  return Number(((input*rate.inputPerMillion+output*rate.outputPerMillion)/1_000_000)
    .toFixed(6));
}

export function transcriptionCostUsd(model:string,durationSeconds:number){
  if(!Number.isFinite(durationSeconds)||durationSeconds<0) return null;
  const perMinute=model==='gpt-transcribe'?.0045:model==='whisper-1'?.006:null;
  return perMinute===null?null:Number((durationSeconds/60*perMinute).toFixed(6));
}

export function webSearchCostUsd(calls:number){
  if(!Number.isInteger(calls)||calls<0) return null;
  return Number((calls*.01).toFixed(6));
}
