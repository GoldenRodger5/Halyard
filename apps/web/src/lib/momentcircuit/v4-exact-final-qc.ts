import crypto from 'node:crypto';
import {assessCaptionAlignment} from './av-qc';

export type FinalFrame={at_seconds:number;bytes:Buffer};
export type QcDefect={
  class:string;severity:'critical'|'major'|'minor';
  evidence:string;at_seconds?:number[];repairable?:boolean;
};
export type FinalReview={
  story_match?:boolean;caption_visual_quality?:boolean;
  professional_quality?:boolean;text_bounds_pass?:boolean;
  cold_viewer_clarity?:boolean;first_second_hook?:boolean;
  payoff_complete?:boolean;ending_complete?:boolean;
  artifact_scan_pass?:boolean;
  frames?:Array<{at_seconds?:number;observation?:string;visible_text?:string[]}>;
  defects?:QcDefect[];summary?:string;
  repair_plan?:{
    action?:'NONE'|'REFRAME'|'REPLACE_HOOK'|'REFRAME_AND_HOOK';
    new_focus_x?:number;new_hook_text?:string;rationale?:string;
  };
};

const ARTIFACT=/(Dialogue:|Style:|Script Info|Format:|,Cap,,|-->|(?:^|\s)\d{1,2}:\d{2}(?::\d{2})?[.,]\d+|["']?(?:start|end)["']?\s*:|\{\s*["']|\[\s*\{)/i;

export function normalizeV4FinalReview(raw:FinalReview,times:number[]){
  if(times.length<8||!Array.isArray(raw.frames)||raw.frames.length<times.length){
    throw new Error('QC_INCOMPLETE_FRAME_INSPECTION');
  }
  const frames=times.map((time)=>{
    const item=raw.frames?.find((row)=>Number.isFinite(Number(row.at_seconds))
      &&Math.abs(Number(row.at_seconds)-time)<=0.03);
    if(!item||String(item.observation??'').trim().length<8
      ||!Array.isArray(item.visible_text)){
      throw new Error('QC_INCOMPLETE_FRAME_INSPECTION');
    }
    return {at_seconds:time,observation:String(item.observation).trim(),
      visible_text:item.visible_text.map((value)=>String(value).slice(0,200))};
  });
  const defects=(Array.isArray(raw.defects)?raw.defects:[]).filter((item)=>
    item&&typeof item.class==='string'&&typeof item.evidence==='string'
    &&['critical','major','minor'].includes(item.severity));
  const artifactHits=frames.flatMap((frame)=>frame.visible_text
    .filter((value)=>ARTIFACT.test(value)).map((value)=>({
      at_seconds:frame.at_seconds,text:value})));
  if(artifactHits.length){
    defects.push({class:'caption_serialization_artifact',severity:'critical',
      evidence:`Visible timing/serialization: ${artifactHits.map((x)=>x.text).join(' | ').slice(0,500)}`,
      at_seconds:artifactHits.map((x)=>x.at_seconds),repairable:false});
  }
  const clean=!defects.some((item)=>item.severity==='critical'
    ||item.severity==='major');
  const pass=raw.story_match===true&&raw.caption_visual_quality===true
    &&raw.professional_quality===true&&raw.text_bounds_pass===true
    &&raw.cold_viewer_clarity===true&&raw.first_second_hook===true
    &&raw.payoff_complete===true&&raw.ending_complete===true
    &&raw.artifact_scan_pass===true&&artifactHits.length===0&&clean;
  return {pass,story_match:raw.story_match===true,
    caption_visual_quality:raw.caption_visual_quality===true,
    professional_quality:raw.professional_quality===true,
    text_bounds_pass:raw.text_bounds_pass===true,
    cold_viewer_clarity:raw.cold_viewer_clarity===true,
    first_second_hook:raw.first_second_hook===true,
    payoff_complete:raw.payoff_complete===true,
    ending_complete:raw.ending_complete===true,
    artifact_scan_pass:raw.artifact_scan_pass===true&&artifactHits.length===0,
    frames,defects,summary:String(raw.summary??'').slice(0,500),
    repair_plan:raw.repair_plan??{action:'NONE'}};
}

export function evaluateV4Final(args:{
  review:ReturnType<typeof normalizeV4FinalReview>;
  captions:string[];transcript:string;technicalPass:boolean;
}){
  if(!args.technicalPass) throw new Error('QC_TECHNICAL_SYSTEMIC');
  const alignment=assessCaptionAlignment(args.captions,args.transcript);
  const defects=[...args.review.defects];
  if(!alignment.pass){
    defects.push({class:'caption_audio_mismatch',severity:'major',
      evidence:`Final audio/caption alignment ${alignment.overall_coverage}/${alignment.ordered_coverage}`,
      repairable:true});
  }
  if(!alignment.pass) throw new Error('QC_GENERATION_SYSTEMIC');
  const systemic=defects.some((item)=>{
    const defectClass=item.class.replace(/[_-]+/g,' ');
    return item.class==='caption_serialization_artifact'
      ||/font failure|blank caption|renderer failure|template padding/i.test(defectClass);
  });
  if(systemic) throw new Error('QC_GENERATION_SYSTEMIC');
  const verdict=args.review.pass&&alignment.pass?'PASS':
    args.review.story_match?'LOCAL_FAIL':'MOMENT_BAD';
  if(verdict!=='PASS'&&defects.length===0){
    defects.push({class:'creative_quality',severity:'major',
      evidence:args.review.summary||'Exact final creative quality did not pass',
      repairable:verdict==='LOCAL_FAIL'});
  }
  return {verdict,defects,alignment,
    transcript_sha256:crypto.createHash('sha256').update(args.transcript).digest('hex')};
}

export async function critiqueV4Final(args:{
  frames:FinalFrame[];platform:string;story_claim:string;payoff:string;
  expected_captions:string[];presentation_mode:string;
}){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new Error('OPENAI_API_KEY_MISSING_FOR_QC');
  const system=`You are the strict production exact-final QC critic for a professional short-form clipping account. Examine every supplied frame of the exact export, including its opening, caption beats and ending. Judge source/story match, legible native framing, cold context, first-second hook, caption spelling, text bounds and safe zones, visible paid disclosure when used, professional appearance, complete payoff and ending. Transcribe every readable text string per frame. Detect leaked SRT/ASS syntax, timestamps, JSON or cue numbers. If expected spoken captions are absent from frames sampled during those caption beats, classify that defect exactly as blank_caption_renderer_failure, severity major, repairable false; this is a render-system failure, not a creative reframe/hook problem. A material defect fails. Return JSON only with booleans story_match, caption_visual_quality, professional_quality, text_bounds_pass, cold_viewer_clarity, first_second_hook, payoff_complete, ending_complete, artifact_scan_pass; frames:[{at_seconds,observation,visible_text:[...]}] for EVERY exact requested timestamp; defects:[{class,severity,evidence,at_seconds,repairable}]; repair_plan:{action:"NONE|REFRAME|REPLACE_HOOK|REFRAME_AND_HOOK",new_focus_x?,new_hook_text?,rationale}; summary. A local repair can only adjust portrait crop focus or replace an existing headline while keeping source timing, captions and disclosure unchanged. Use NONE if those cannot fix the observed defect. Do not infer unseen frames. Do not force a headline onto native-source clips.`;
  const content:Array<Record<string,unknown>>=[{type:'text',text:
    `Platform ${args.platform}; presentation ${args.presentation_mode}. Verified story: ${args.story_claim}. Verified payoff: ${args.payoff}. Expected spoken captions: ${JSON.stringify(args.expected_captions)}. Exact timestamps: ${args.frames.map((f)=>f.at_seconds).join(', ')}.`}];
  for(const frame of args.frames){
    content.push({type:'text',text:`Exact final frame at ${frame.at_seconds}s`});
    content.push({type:'image_url',image_url:{
      url:`data:image/jpeg;base64,${frame.bytes.toString('base64')}`}});
  }
  const response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({model:'gpt-5.5',
      messages:[{role:'system',content:system},{role:'user',content}],
      max_completion_tokens:5000,response_format:{type:'json_object'}}),
    signal:AbortSignal.timeout(180_000)});
  const body=await response.json() as {
    choices?:Array<{message?:{content?:string|null}}>;
    error?:{message?:string};
  };
  if(!response.ok) throw new Error(`AI_QC_${response.status}: ${body.error?.message??'unknown'}`);
  const raw=body.choices?.[0]?.message?.content;
  if(!raw) throw new Error('AI_QC_EMPTY');
  return normalizeV4FinalReview(JSON.parse(raw) as FinalReview,
    args.frames.map((f)=>f.at_seconds));
}
