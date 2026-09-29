import { describe,it,expect } from 'vitest';
import { applyRepair,sampleTimes } from './quality-repair';
const input = () => ({render_segment:{start:100,duration:12,require_word_captions:true,caption_cues:[{start:0,end:1,text:'first'},{start:1,end:4,text:'second'},{start:10,end:12,text:'last'}],hook_line1:'old headline',hook_line2:'old continuation',hook_text:'old fallback'}});
describe('MomentCircuit bounded repair',()=>{
  it('retimes every remaining caption after a start trim',()=>{
    const out=applyRepair(input(),{action:'TRIM_START',trim_start_seconds:2})!;
    const s=out.render_segment as any;
    expect(s.start).toBe(102); expect(s.duration).toBe(10);
    expect(s.caption_cues).toEqual([{start:0,end:2,text:'second'},{start:8,end:10,text:'last'}]);
  });
  it('clamps end-trim captions without changing source start',()=>{
    const s=applyRepair(input(),{action:'TRIM_END',trim_end_seconds:1})!.render_segment as any;
    expect(s.start).toBe(100); expect(s.caption_cues.at(-1).end).toBe(11);
  });
  it('replaces all higher-precedence old headline fields',()=>{
    const s=applyRepair(input(),{action:'REPLACE_HOOK',new_hook_text:'A better hook'})!.render_segment as any;
    expect(s.hook_line1).toBeUndefined();expect(s.hook_line2).toBeUndefined();expect(s.hook_text).toBe('A better hook');
  });
  it('actually removes every headline field',()=>{
    const s=applyRepair(input(),{action:'REMOVE_HOOK'})!.render_segment as any;
    expect(s.hook_line1).toBeUndefined();expect(s.hook_line2).toBeUndefined();expect(s.hook_text).toBeUndefined();expect(s.hook_duration).toBe(0);
  });
  it('does not mutate the failed work order',()=>{const p=input();const before=structuredClone(p);applyRepair(p,{action:'TRIM_START',trim_start_seconds:1});expect(p).toEqual(before);});
  it('refuses NaN trim and empty-caption rerender',()=>{expect(applyRepair(input(),{action:'TRIM_START',trim_start_seconds:NaN})).toBeNull();expect(applyRepair({render_segment:{duration:12}},{action:'RERENDER_CAPTIONS'})).toBeNull();});
});
describe('Whole-timeline frame sampling',()=>{
  for(const d of [0.4,5,12,30,60,90,180]) it(`preserves opening and ending at ${d}s`,()=>{const t=sampleTimes(d);expect(t.length).toBeLessThanOrEqual(14);expect(t[0]).toBeLessThanOrEqual(0.05);expect(t.at(-1)).toBeGreaterThanOrEqual(d-0.151);expect(t.every(x=>x>=0&&x<d)).toBe(true);});
  it('rejects invalid durations',()=>{expect(()=>sampleTimes(0)).toThrow();expect(()=>sampleTimes(NaN)).toThrow();});
});

describe('Upstream targeted reframe compatibility',()=>{
 it('keeps reframe and hook repair without old text precedence',()=>{const s=applyRepair(input(),{action:'REFRAME_AND_HOOK',new_focus_x:0.65,new_hook_text:'A clearer hook'})!.render_segment as any;expect(s.focus_x).toBe(0.65);expect(s.hook_line1).toBeUndefined();expect(s.hook_text).toBe('A clearer hook');});
 it('rejects missing or invalid reframe coordinates',()=>{expect(applyRepair(input(),{action:'REFRAME'})).toBeNull();expect(applyRepair(input(),{action:'REFRAME',new_focus_x:2})).toBeNull();});
});
