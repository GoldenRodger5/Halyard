import {describe,expect,it} from 'vitest';
import {adaptLegacySegment,validateCaptionCues,validateEditSegment} from './edit-plan';

const base=()=>({
  edit_plan_version:1 as const,
  start:12,
  duration:10,
  presentation_mode:'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES' as const,
  source_layout:'SINGLE_SPEAKER' as const,
  shots:[{start:0,end:10,focus_x:.5,layout:'SINGLE_SPEAKER' as const,protected_region:{x1:.2,y1:.1,x2:.8,y2:.85}}],
  headline:{text:'A simple headline that explains the clip',start:0,end:2.2},
  caption_cues:[{start:0,end:2,text:'The first phrase.'},{start:2.1,end:4.2,text:'The second phrase.'}],
  captions_required:true,
  disclosure_mode:'none' as const,
});

describe('MomentCircuit vNext EditPlan',()=>{
  it('accepts the explicit deterministic plan',()=>expect(validateEditSegment(base())).toMatchObject({edit_plan_version:1,duration:10}));
  it('requires a shot plan covering the entire segment',()=>expect(()=>validateEditSegment({...base(),shots:[{start:1,end:10,focus_x:.5,layout:'SINGLE_SPEAKER'}]})).toThrow('SHOT_PLAN_MUST_COVER_SEGMENT'));
  it('rejects overlapping shots',()=>expect(()=>validateEditSegment({...base(),shots:[{start:0,end:6,focus_x:.5,layout:'SINGLE_SPEAKER'},{start:5,end:10,focus_x:.5,layout:'SINGLE_SPEAKER'}]})).toThrow('SHOT_PLAN_GAP_OR_OVERLAP'));
  it('rejects unsafe focus targets',()=>expect(()=>validateEditSegment({...base(),shots:[{start:0,end:10,focus_x:.99,layout:'SINGLE_SPEAKER'}]})).toThrow('SHOT_FOCUS_INVALID'));
  it('requires headlines only in headline modes',()=>{
    expect(()=>validateEditSegment({...base(),presentation_mode:'NATIVE_SOURCE_ONLY'})).toThrow('NATIVE_SOURCE_ONLY_FORBIDS_HEADLINE');
    expect(()=>validateEditSegment({...base(),headline:undefined})).toThrow('HEADLINE_REQUIRED');
  });
  it('requires captions in dynamic-caption mode',()=>expect(()=>validateEditSegment({...base(),caption_cues:[]})).toThrow('CAPTIONS_REQUIRED'));
  it('rejects caption overlap before rendering',()=>expect(()=>validateCaptionCues([{start:0,end:2,text:'one'},{start:1.9,end:3,text:'two'}],10,true)).toThrow('CAPTION_OVERLAP'));
  it('rejects serialized caption artifacts',()=>expect(()=>validateCaptionCues([{start:0,end:2,text:'Dialogue: 0,0:00:01'}],10,true)).toThrow('RAW_SUBTITLE_ARTIFACT_TOKEN'));
  it('explicitly adapts legacy phrase-cue work instead of using hidden renderer fallback',()=>{
    const p=adaptLegacySegment({duration:8,hook_text:'Why this story matters',caption_mode:'PHRASE_CUES_ONLY',require_word_captions:true,caption_cues:[{start:0,end:2,text:'hello there'}]});
    expect(p.edit_plan_version).toBe(1);
    expect(p.presentation_mode).toBe('HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES');
  });
  it('blocks legacy caption_words entirely',()=>expect(()=>adaptLegacySegment({duration:8,caption_words:[{start:0,end:1,text:'hello'}]})).toThrow('LEGACY_CAPTION_WORDS_FORBIDDEN'));
});
