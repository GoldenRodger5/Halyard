import {describe,expect,it} from 'vitest';
import {applyV4RepairPlan} from './v4-repair-plan';

const native={edit_plan_version:1,start:0,duration:12,
  presentation_mode:'NATIVE_SOURCE_ONLY',source_layout:'CINEMATIC',
  shots:[{start:0,end:12,focus_x:0.5,layout:'CINEMATIC'}],
  caption_cues:[{start:0,end:2,text:'A complete scene'}],
  captions_required:true,disclosure_mode:'none'};

describe('bounded v4 repair plan',()=>{
  it('adjusts focus while preserving exact source timing and captions',()=>{
    const result=applyV4RepairPlan(native,{action:'REFRAME',new_focus_x:0.65,
      rationale:'The original crop clips the payoff character'});
    expect(result?.plan.shots[0]?.focus_x).toBe(0.65);
    expect(result?.plan.caption_cues).toEqual(native.caption_cues);
    expect(result?.plan.duration).toBe(12);
  });
  it('does not invent a headline on native source only',()=>{
    expect(applyV4RepairPlan(native,{action:'REPLACE_HOOK',
      new_hook_text:'A new headline',
      rationale:'A new title would be more readable'})).toBeNull();
  });
  it('refuses a no-op crop and an unsafe source shift',()=>{
    expect(applyV4RepairPlan(native,{action:'REFRAME',new_focus_x:0.51,
      rationale:'Move the crop by a negligible amount'})).toBeNull();
    expect(applyV4RepairPlan(native,{action:'REFRAME',new_focus_x:1.4,
      rationale:'Move entirely outside the source image'})).toBeNull();
  });
  it('replaces an existing headline without changing its timing',()=>{
    const original={...native,presentation_mode:'HEADLINE_CARD_OPENING',
      headline:{text:'The first title',start:0,end:1.8}};
    const result=applyV4RepairPlan(original,{action:'REPLACE_HOOK',
      new_hook_text:'The sharper opening line',
      rationale:'The headline covers too much of the first beat'});
    expect(result?.plan.headline).toEqual({
      text:'The sharper opening line',start:0,end:1.8});
  });
});
