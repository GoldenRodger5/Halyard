import { describe,it,expect } from 'vitest';
import { applyRepair,sampleTimes,sampleTimesWithCues } from './quality-repair';
type TestSegment = {start:number;duration:number;caption_cues:Array<{start:number;end:number;text:string}>;hook_line1?:string;hook_line2?:string;hook_text?:string;hook_duration?:number;focus_x?:number};
const input = () => ({render_segment:{start:100,duration:12,require_word_captions:true,caption_cues:[{start:0,end:1,text:'first'},{start:1,end:4,text:'second'},{start:10,end:12,text:'last'}],hook_line1:'old headline',hook_line2:'old continuation',hook_text:'old fallback'}});
describe('MomentCircuit bounded repair',()=>{
  it('retimes every remaining caption after a start trim',()=>{
    const out=applyRepair(input(),{action:'TRIM_START',trim_start_seconds:2})!;
    const s=out.render_segment as TestSegment;
    expect(s.start).toBe(102); expect(s.duration).toBe(10);
    expect(s.caption_cues).toEqual([{start:0,end:2,text:'second'},{start:8,end:10,text:'last'}]);
  });
  it('clamps end-trim captions without changing source start',()=>{
    const s=applyRepair(input(),{action:'TRIM_END',trim_end_seconds:1})!.render_segment as TestSegment;
    expect(s.start).toBe(100); expect(s.caption_cues.at(-1)?.end).toBe(11);
  });
  it('replaces all higher-precedence old headline fields',()=>{
    const s=applyRepair(input(),{action:'REPLACE_HOOK',new_hook_text:'A better hook'})!.render_segment as TestSegment;
    expect(s.hook_line1).toBeUndefined();expect(s.hook_line2).toBeUndefined();expect(s.hook_text).toBe('A better hook');
  });
  it('actually removes every headline field',()=>{
    const s=applyRepair(input(),{action:'REMOVE_HOOK'})!.render_segment as TestSegment;
    expect(s.hook_line1).toBeUndefined();expect(s.hook_line2).toBeUndefined();expect(s.hook_text).toBeUndefined();expect(s.hook_duration).toBe(0);
  });
  it('does not mutate the failed work order',()=>{const p=input();const before=structuredClone(p);applyRepair(p,{action:'TRIM_START',trim_start_seconds:1});expect(p).toEqual(before);});
  it('refuses NaN trim and empty-caption rerender',()=>{expect(applyRepair(input(),{action:'TRIM_START',trim_start_seconds:NaN})).toBeNull();expect(applyRepair({render_segment:{duration:12}},{action:'RERENDER_CAPTIONS'})).toBeNull();});
});
describe('Whole-timeline frame sampling',()=>{
  for(const d of [0.4,5,12,30,60,90,180]) it(`preserves opening and ending at ${d}s`,()=>{const t=sampleTimes(d);expect(t.length).toBeLessThanOrEqual(14);expect(t[0]).toBeLessThanOrEqual(0.05);expect(t.at(-1)).toBeGreaterThanOrEqual(d-0.151);expect(t.every(x=>x>=0&&x<d)).toBe(true);});
  it('rejects invalid durations',()=>{expect(()=>sampleTimes(0)).toThrow();expect(()=>sampleTimes(NaN)).toThrow();});
});

describe('Caption-aware exact-final frame sampling',()=>{
  it('samples the midpoint of a late payoff cue instead of landing on both sides of it',()=>{
    const cues=[
      {start:0,end:2.589,text:'I know what could happen to you or me'},
      {start:2.92,end:3.98,text:'or anyone else.'},
      {start:4.939,end:6.14,text:"I've lost people,"},
      {start:6.419,end:8.06,text:'people I loved more than anything.'},
      {start:9.55,end:10.79,text:'This is my choice,'},
      {start:10.989,end:11.39,text:'Mark.'},
    ];
    const times=sampleTimesWithCues(11.39,cues);
    expect(times.length).toBeLessThanOrEqual(14);
    expect(times.some((x)=>x>9.55&&x<10.79)).toBe(true);
    expect(times.some((x)=>Math.abs(x-10.17)<.08)).toBe(true);
    expect(times.at(-1)).toBeGreaterThanOrEqual(11.239);
  });

  it('keeps opening, ending and bounded cue coverage on caption-dense clips',()=>{
    const cues=Array.from({length:20},(_,i)=>({start:i*.9,end:i*.9+.7,text:`cue ${i}`}));
    const times=sampleTimesWithCues(18,cues);
    expect(times.length).toBeLessThanOrEqual(14);
    expect(times[0]).toBeLessThanOrEqual(.05);
    expect(times.at(-1)).toBeGreaterThanOrEqual(17.849);
    expect(times.some((x)=>x>14)).toBe(true);
  });

  it('rejects invalid frame budgets',()=>{
    expect(()=>sampleTimesWithCues(10,[],5)).toThrow('QC_FRAME_BUDGET_INVALID');
  });
});

describe('Upstream targeted reframe compatibility',()=>{
 it('keeps reframe and hook repair without old text precedence',()=>{const s=applyRepair(input(),{action:'REFRAME_AND_HOOK',new_focus_x:0.65,new_hook_text:'A clearer hook'})!.render_segment as TestSegment;expect(s.focus_x).toBe(0.65);expect(s.hook_line1).toBeUndefined();expect(s.hook_text).toBe('A clearer hook');});
 it('rejects missing or invalid reframe coordinates',()=>{expect(applyRepair(input(),{action:'REFRAME'})).toBeNull();expect(applyRepair(input(),{action:'REFRAME',new_focus_x:2})).toBeNull();});
});

type VNextSegment = {
  start:number;duration:number;presentation_mode:string;
  shots:Array<{start:number;end:number;focus_x:number;layout:string}>;
  headline?:{text:string;start:number;end:number};
  caption_cues:Array<{start:number;end:number;text:string}>;
  focus_x?:number;
};

describe('MomentCircuit vNext repair bounds',()=>{
  const vnext=()=>({render_segment:{edit_plan_version:1,start:100,duration:10,presentation_mode:'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES',source_layout:'SINGLE_SPEAKER',shots:[{start:0,end:10,focus_x:.5,layout:'SINGLE_SPEAKER'}],headline:{text:'Old headline',start:0,end:2},caption_cues:[{start:0,end:2,text:'first words'},{start:8,end:10,text:'last words'}],captions_required:true,disclosure_mode:'none'}});
  it('reframes the first planned shot without reverting to legacy focus fields',()=>{
    const out=applyRepair(vnext(),{action:'REFRAME',new_focus_x:.35})!;
    const seg=out.render_segment as VNextSegment;
    expect(seg.shots[0]!.focus_x).toBe(.35);
    expect(seg.focus_x).toBeUndefined();
    expect((out.edit_plan as VNextSegment).shots[0]!.focus_x).toBe(.35);
  });
  it('replaces the native headline in the canonical plan',()=>{
    const out=applyRepair(vnext(),{action:'REPLACE_HOOK',new_hook_text:'Better context for this clip'})!;
    expect((out.render_segment as VNextSegment).headline!.text).toBe('Better context for this clip');
  });
  it('removes headline by returning to source-only treatment while preserving captions',()=>{
    const out=applyRepair(vnext(),{action:'REMOVE_HOOK'})!;
    const seg=out.render_segment as VNextSegment;
    expect(seg.presentation_mode).toBe('NATIVE_SOURCE_ONLY');
    expect(seg.headline).toBeUndefined();
    expect(seg.caption_cues).toHaveLength(2);
  });
  it('retimes shots and cues together on trim',()=>{
    const out=applyRepair(vnext(),{action:'TRIM_START',trim_start_seconds:1})!;
    const seg=out.render_segment as VNextSegment;
    expect(seg.start).toBe(101);
    expect(seg.duration).toBe(9);
    expect(seg.shots[0]!.start).toBe(0);
    expect(seg.shots.at(-1)!.end).toBe(9);
    expect(seg.caption_cues.at(-1)).toEqual({start:7,end:9,text:'last words'});
  });
});
