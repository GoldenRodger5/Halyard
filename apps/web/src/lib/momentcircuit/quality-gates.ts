export type QualityLayers = {
  technical:{pass:boolean;reason?:string};
  audiovisual:{pass:boolean;reason?:string};
  visual:{pass:boolean;reason?:string};
  cold_viewer:{pass:boolean;reason?:string};
};

export function exactFinalPass(layers:QualityLayers):boolean {
  return layers.technical.pass && layers.audiovisual.pass && layers.visual.pass && layers.cold_viewer.pass;
}

export function technicalLayer(input:{technical_qc?:unknown;duration?:unknown;size?:unknown;audio_present:boolean}):QualityLayers['technical']{
  const duration=Number(input.duration),size=Number(input.size);
  if(input.technical_qc!=='passed') return {pass:false,reason:'RENDER_TECHNICAL_QC_NOT_PASS'};
  if(!Number.isFinite(duration)||duration<=0) return {pass:false,reason:'FINAL_DURATION_INVALID'};
  if(!Number.isFinite(size)||size<=1000) return {pass:false,reason:'FINAL_FILE_TOO_SMALL'};
  if(!input.audio_present) return {pass:false,reason:'FINAL_AUDIO_MISSING'};
  return {pass:true};
}

export function audiovisualLayer(input:{alignment_pass:boolean;captions_required:boolean;transcript_nonempty:boolean}):QualityLayers['audiovisual']{
  if(input.captions_required && !input.transcript_nonempty) return {pass:false,reason:'FINAL_TRANSCRIPT_EMPTY'};
  if(input.captions_required && !input.alignment_pass) return {pass:false,reason:'FINAL_CAPTION_AUDIO_MISMATCH'};
  return {pass:true};
}

export function coldViewerLayer(input:{cold_viewer_clarity:boolean;first_second_hook:boolean;payoff_complete:boolean;ending_complete:boolean}):QualityLayers['cold_viewer']{
  if(!input.cold_viewer_clarity) return {pass:false,reason:'COLD_VIEWER_CONTEXT_FAIL'};
  if(!input.first_second_hook) return {pass:false,reason:'FIRST_SECOND_FAIL'};
  if(!input.payoff_complete) return {pass:false,reason:'PAYOFF_INCOMPLETE'};
  if(!input.ending_complete) return {pass:false,reason:'ENDING_INCOMPLETE'};
  return {pass:true};
}
