import {validateCaptionCues,type CaptionCue,type PresentationMode,type SourceLayout}
  from './edit-plan';

const MODES=new Set<PresentationMode>([
  'NATIVE_SOURCE_ONLY','HEADLINE_CARD_OPENING',
  'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES']);
const LAYOUTS=new Set<SourceLayout>([
  'VERTICAL_NATIVE','SINGLE_SPEAKER','TWO_SHOT','SPLIT_SCREEN',
  'GAMEPLAY_PLUS_FACE','FULLSCREEN_GAMEPLAY','INTERVIEW','CINEMATIC']);

type Speech={start?:unknown;end?:unknown;text?:unknown};

export function captionCuesFromSourceSpeech(raw:unknown,start:number,
  duration:number,required:boolean):CaptionCue[]{
  if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0){
    throw new Error('EDITORIAL_WINDOW_INVALID');
  }
  const end=start+duration;
  const rows=Array.isArray(raw)?raw as Speech[]:[];
  const cues:CaptionCue[]=[];
  for(const row of rows){
    const speechStart=Number(row.start),speechEnd=Number(row.end);
    const words=typeof row.text==='string'
      ?row.text.normalize('NFC').trim().split(/\s+/).filter(Boolean):[];
    if(!Number.isFinite(speechStart)||!Number.isFinite(speechEnd)
      ||speechEnd<=speechStart||!words.length||speechEnd<=start||speechStart>=end){
      continue;
    }
    const localStart=Math.max(0,speechStart-start);
    const localEnd=Math.min(duration,speechEnd-start);
    const groups:string[][]=[];
    for(let i=0;i<words.length;i+=6) groups.push(words.slice(i,i+6));
    for(const [index,group] of groups.entries()){
      const a=localStart+(localEnd-localStart)*index/groups.length;
      const b=localStart+(localEnd-localStart)*(index+1)/groups.length;
      const prior=cues.at(-1)?.end??0;
      const cueStart=Math.max(a,prior);
      if(b-cueStart<0.16) continue;
      cues.push({start:Number(cueStart.toFixed(3)),
        end:Number(b.toFixed(3)),text:group.join(' ')});
    }
  }
  return validateCaptionCues(cues,duration,required);
}

function strings(value:unknown){
  return Array.isArray(value)?value.filter((x):x is string=>
    typeof x==='string'&&x.trim().length>0).map(x=>x.trim()):[];
}

export function normalizeEditorialCaption(raw:unknown,requirements:unknown,
  platform:'tiktok'|'youtube'){
  if(typeof raw!=='string') throw new Error('EDITORIAL_POST_CAPTION_MISSING');
  let caption=raw.normalize('NFC').replace(/\s+/g,' ').trim();
  if(caption.length<8) throw new Error('EDITORIAL_POST_CAPTION_MISSING');
  const req=requirements&&typeof requirements==='object'
    ?requirements as Record<string,unknown>:{};
  const disclosure=req.disclosure&&typeof req.disclosure==='object'
    ?req.disclosure as Record<string,unknown>:{};
  const captionSpec=req.caption&&typeof req.caption==='object'
    ?req.caption as Record<string,unknown>:{};
  const rejected=strings(disclosure.rejected);
  if(rejected.some(token=>new RegExp(`(^|\\W)${token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(\\W|$)`,'i')
    .test(caption))){
    throw new Error('EDITORIAL_REJECTED_DISCLOSURE_WORD');
  }
  const requiredTokens=strings(captionSpec.must_include_one_of);
  if(requiredTokens.length&&!requiredTokens.some(token=>
    caption.toLocaleLowerCase().includes(token.toLocaleLowerCase()))){
    caption=`${caption} ${requiredTokens[0]}`;
  }
  if(disclosure.required===true&&!/^(#ad|Ad)(\s|[.,:;!?]|$)/.test(caption)){
    const accepted=strings(disclosure.accepted);
    if(!accepted.includes('#ad')) throw new Error('EDITORIAL_DISCLOSURE_UNSUPPORTED');
    caption=`#ad ${caption}`;
  }
  const limit=platform==='youtube'?100:180;
  if(caption.length>limit) throw new Error('EDITORIAL_POST_CAPTION_TOO_LONG');
  return caption;
}

export function normalizeEditorialDecision(raw:unknown,hasCaptions:boolean){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    throw new Error('EDITORIAL_AI_SHAPE_INVALID');
  }
  const row=raw as Record<string,unknown>;
  const mode=String(row.presentation_mode??'') as PresentationMode;
  const layout=String(row.source_layout??'') as SourceLayout;
  const focus=Number(row.focus_x);
  if(!MODES.has(mode)||!LAYOUTS.has(layout)
    ||!Number.isFinite(focus)||focus<0.05||focus>0.95){
    throw new Error('EDITORIAL_AI_DECISION_INVALID');
  }
  if(mode==='HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES'&&!hasCaptions){
    throw new Error('EDITORIAL_DYNAMIC_SUBTITLES_WITHOUT_CAPTIONS');
  }
  const headline=typeof row.headline==='string'?row.headline.trim():'';
  if(mode==='NATIVE_SOURCE_ONLY'&&headline){
    throw new Error('EDITORIAL_NATIVE_HEADLINE_CONFLICT');
  }
  if(mode!=='NATIVE_SOURCE_ONLY'&&headline.length<8){
    throw new Error('EDITORIAL_HEADLINE_MISSING');
  }
  const evidence=typeof row.layout_evidence==='string'
    ?row.layout_evidence.trim():'';
  if(evidence.length<12) throw new Error('EDITORIAL_LAYOUT_EVIDENCE_MISSING');
  return {presentation_mode:mode,source_layout:layout,focus_x:focus,
    ...(headline?{headline}:{}),headline_duration:2.4,
    post_caption:row.post_caption,layout_evidence:evidence};
}
