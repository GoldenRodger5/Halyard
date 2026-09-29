import {describe,expect,it} from 'vitest';
import {buildVerifiedEditPlan,verifiedSourceLayout} from './edit-planner';

const cues=[{start:0,end:2,text:'This wording is verified.'},{start:2.1,end:4,text:'So is this payoff.'}];

describe('AI planner boundary',()=>{
  it('honors verified source layout metadata over AI guesses',()=>{expect(verifiedSourceLayout({layout:'SPLIT_SCREEN',representative_frames_verified:true})).toBe('SPLIT_SCREEN');expect(verifiedSourceLayout({layout:'TWO_SHOT'})).toBeUndefined();});
  it('uses AI for layout but never rewrites verified cues',()=>{
    const p=buildVerifiedEditPlan({decision:{presentation_mode:'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES',source_layout:'SINGLE_SPEAKER',focus_x:.45,headline:'Why this story gets weird'},start:20,duration:5,caption_cues:cues,captions_required:true});
    expect(p.caption_cues).toEqual(cues);
    expect(p.headline?.text).toBe('Why this story gets weird');
    expect(p.shots[0]?.focus_x).toBe(.45);
  });
  it('allows source-only when the source opening is already strong',()=>{
    const p=buildVerifiedEditPlan({decision:{presentation_mode:'NATIVE_SOURCE_ONLY',source_layout:'VERTICAL_NATIVE'},start:0,duration:5,caption_cues:[],captions_required:false});
    expect(p.headline).toBeUndefined();
  });
  it('rejects headline mode without headline text',()=>expect(()=>buildVerifiedEditPlan({decision:{presentation_mode:'HEADLINE_CARD_OPENING'},start:0,duration:5,caption_cues:[],captions_required:false})).toThrow());
  it('rejects invalid AI geometry through the deterministic contract',()=>expect(()=>buildVerifiedEditPlan({decision:{presentation_mode:'NATIVE_SOURCE_ONLY',shots:[{start:0,end:4,focus_x:2,layout:'SINGLE_SPEAKER'}]},start:0,duration:5,caption_cues:[],captions_required:false})).toThrow());
  it('accepts multi-shot plans only when they exactly cover the clip',()=>{
    const p=buildVerifiedEditPlan({decision:{presentation_mode:'NATIVE_SOURCE_ONLY',shots:[{start:0,end:2,focus_x:.3,layout:'SINGLE_SPEAKER'},{start:2,end:5,focus_x:.7,layout:'SINGLE_SPEAKER'}]},start:0,duration:5,caption_cues:[],captions_required:false});
    expect(p.shots).toHaveLength(2);
  });
});
