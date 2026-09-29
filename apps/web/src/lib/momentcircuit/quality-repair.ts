/** Pure, bounded transformations. Infrastructure recovery is not a creative strike. */
export type RepairPlan = {
  dominant_problem?: string;
  action?: 'NONE' | 'TRIM_START' | 'TRIM_END' | 'REPLACE_HOOK' | 'REMOVE_HOOK' | 'RERENDER_CAPTIONS' | 'REFRAME' | 'REFRAME_AND_HOOK' | 'REPLACE_MOMENT';
  trim_start_seconds?: number;
  trim_end_seconds?: number;
  new_hook_text?: string | null;
  new_focus_x?: number | null;
};

/** Never drop the ending when the frame budget is exceeded. */
export function sampleTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('QC_DURATION_INVALID');
  const last = Math.max(duration * 0.8, duration - 0.15);
  const anchors = [Math.min(0.05, duration / 10), Math.min(0.5, duration / 3), Math.min(1, duration / 2), last];
  const count = duration > 20 ? 10 : 5;
  for (let i = 1; i <= count; i++) anchors.push(last * i / (count + 1));
  return [...new Set(anchors.filter(t => t >= 0 && t < duration).map(t => Number(t.toFixed(3))))].sort((a,b)=>a-b);
}

export type QcCaptionCue = { start:number; end:number; text?:string };

/**
 * Exact-final QC must see the actual subtitle/payoff beats it is judging.
 * Uniform timeline sampling alone can land on both sides of a short cue and
 * falsely conclude that required text/payoff never appeared.
 *
 * Keep cost bounded: preserve opening + ending, then caption midpoints, then
 * fill remaining slots from the ordinary whole-timeline sampler.
 */
export function sampleTimesWithCues(
  duration:number,
  cues:QcCaptionCue[],
  maxFrames=14,
):number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('QC_DURATION_INVALID');
  if (!Number.isInteger(maxFrames) || maxFrames < 6 || maxFrames > 20) throw new Error('QC_FRAME_BUDGET_INVALID');

  const last=Math.max(duration*.8,duration-.15);
  const opening=[
    Math.min(.05,duration/10),
    Math.min(.5,duration/3),
    Math.min(1,duration/2),
  ];
  const normalized=(Array.isArray(cues)?cues:[])
    .map((cue)=>({start:Number(cue?.start),end:Number(cue?.end)}))
    .filter((cue)=>Number.isFinite(cue.start)&&Number.isFinite(cue.end)&&cue.start>=0&&cue.end>cue.start&&cue.start<duration)
    .map((cue)=>({
      start:Math.max(0,cue.start),
      end:Math.min(duration,cue.end),
      mid:Number(((Math.max(0,cue.start)+Math.min(duration,cue.end))/2).toFixed(3)),
    }))
    .filter((cue)=>cue.end>cue.start);

  const selected:number[]=[];
  const add=(value:number)=>{
    if(!Number.isFinite(value)||value<0||value>=duration)return;
    if(selected.some((x)=>Math.abs(x-value)<.055))return;
    selected.push(Number(value.toFixed(3)));
  };

  opening.forEach(add);
  add(last);

  const cueMids=normalized.map((cue)=>cue.mid);
  if(cueMids.length <= maxFrames-selected.length){
    cueMids.forEach(add);
  } else {
    // Payoff protection first: first cue, final four cues, then evenly spaced
    // remaining cue beats until the bounded frame budget is exhausted.
    add(cueMids[0]!);
    cueMids.slice(-4).forEach(add);
    const remaining=cueMids.filter((mid)=>!selected.some((x)=>Math.abs(x-mid)<.055));
    while(selected.length<maxFrames && remaining.length){
      const index=Math.floor((remaining.length-1)/2);
      add(remaining.splice(index,1)[0]!);
    }
  }

  for(const t of sampleTimes(duration)){
    if(selected.length>=maxFrames)break;
    add(t);
  }

  // Ending is non-negotiable even if a future change modifies insertion order.
  if(!selected.some((x)=>Math.abs(x-last)<.055)){
    if(selected.length>=maxFrames) selected.splice(Math.max(3,selected.length-2),1);
    add(last);
  }
  return selected.sort((a,b)=>a-b);
}

export function applyRepair(payload: Record<string,unknown>, plan: RepairPlan): Record<string,unknown> | null {
  const next = structuredClone(payload);
  const original = next.render_segment;
  if (!original || typeof original !== 'object' || Array.isArray(original)) return null;
  const seg = {...original as Record<string,unknown>};
  const duration = Number(seg.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const action = plan.action ?? 'REPLACE_MOMENT';
  const vnext = seg.edit_plan_version === 1;

  if (action === 'TRIM_START' || action === 'TRIM_END') {
    const value=Number(action==='TRIM_START'?plan.trim_start_seconds:plan.trim_end_seconds);
    if(!Number.isFinite(value)||value<=0) return null;
    const amount=Math.min(action==='TRIM_START'?3:4,value);
    const newDuration=duration-amount;
    if(newDuration<=5) return null;
    const trimStart=action==='TRIM_START'?amount:0;
    if(trimStart){const start=Number(seg.start??0);if(!Number.isFinite(start)||start<0)return null;seg.start=start+trimStart;}
    seg.duration=newDuration;
    if(Array.isArray(seg.caption_cues)){
      const cues:Array<{start:number;end:number;text:string}>=[];
      for(const raw of seg.caption_cues){
        if(!raw||typeof raw!=='object')return null;const cue=raw as Record<string,unknown>;
        const a=Number(cue.start),b=Number(cue.end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||typeof cue.text!=='string')return null;
        const start=Math.max(0,a-trimStart),end=Math.min(newDuration,b-trimStart);if(end>start)cues.push({start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),text:cue.text});
      }
      seg.caption_cues=cues;
    }
    if(vnext&&Array.isArray(seg.shots)){
      const shots:Array<Record<string,unknown>>=[];
      for(const raw of seg.shots){
        if(!raw||typeof raw!=='object')return null;const shot={...raw as Record<string,unknown>};
        const a=Number(shot.start),b=Number(shot.end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return null;
        const start=Math.max(0,a-trimStart),end=Math.min(newDuration,b-trimStart);if(end>start)shots.push({...shot,start:Number(start.toFixed(3)),end:Number(end.toFixed(3))});
      }
      if(!shots.length)return null;shots[0]!.start=0;shots[shots.length-1]!.end=newDuration;seg.shots=shots;
      if(seg.headline&&typeof seg.headline==='object'){const h={...seg.headline as Record<string,unknown>};h.start=Math.max(0,Number(h.start??0)-trimStart);h.end=Math.min(newDuration,Math.max(0,Number(h.end??0)-trimStart));if(Number(h.end)<=Number(h.start))delete seg.headline;else seg.headline=h;}
    }
    delete seg.caption_words;
  } else if (action === 'REPLACE_HOOK' || action === 'REMOVE_HOOK') {
    if(vnext){
      if(action==='REMOVE_HOOK'){delete seg.headline;seg.presentation_mode='NATIVE_SOURCE_ONLY';}
      else {const text=String(plan.new_hook_text??'').replace(/\s+/g,' ').trim();if(!text||text.length>90)return null;seg.headline={text,start:0,end:Math.min(duration,2.5)};if(seg.presentation_mode==='NATIVE_SOURCE_ONLY')seg.presentation_mode=Array.isArray(seg.caption_cues)&&seg.caption_cues.length?'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES':'HEADLINE_CARD_OPENING';}
    } else {
      delete seg.hook_line1; delete seg.hook_line2; delete seg.hook_text;
      if(action==='REPLACE_HOOK'){const text=String(plan.new_hook_text??'').trim();if(!text||text.length>56)return null;seg.hook_text=text;seg.hook_duration=Math.min(2.5,Math.max(.6,Number(seg.hook_duration)||2));}else seg.hook_duration=0;
    }
  } else if (action === 'REFRAME' || action === 'REFRAME_AND_HOOK') {
    const focus=Number(plan.new_focus_x);if(plan.new_focus_x==null||!Number.isFinite(focus)||focus<.08||focus>.92)return null;
    if(vnext){
      if(!Array.isArray(seg.shots)||!seg.shots.length)return null;
      seg.shots=seg.shots.map((raw,index)=>index===0&&raw&&typeof raw==='object'?{...raw as Record<string,unknown>,focus_x:focus}:raw);
      if(action==='REFRAME_AND_HOOK'){const text=String(plan.new_hook_text??'').replace(/\s+/g,' ').trim();if(!text||text.length>90)return null;seg.headline={text,start:0,end:Math.min(duration,2.5)};if(seg.presentation_mode==='NATIVE_SOURCE_ONLY')seg.presentation_mode='HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES';}
    } else {seg.focus_x=focus;seg.crop_mode='speaker';if(action==='REFRAME_AND_HOOK'){const hook=String(plan.new_hook_text??'').trim();if(!hook||hook.length>56)return null;delete seg.hook_line1;delete seg.hook_line2;delete seg.hook_text;seg.hook_text=hook;seg.hook_duration=Math.min(2.5,Math.max(.6,Number(seg.hook_duration)||2));}}
  } else if (action === 'RERENDER_CAPTIONS') {
    if(!Array.isArray(seg.caption_cues)||!seg.caption_cues.length)return null;
    if(!vnext){seg.caption_mode='PHRASE_CUES_ONLY';seg.require_word_captions=true;}
    delete seg.caption_words;
  } else return null;

  next.render_segment=seg;
  if(vnext) next.edit_plan=seg;
  next.ai_repair_applied={action,dominant_problem:plan.dominant_problem??null,applied_at:new Date().toISOString()};
  return next;
}
