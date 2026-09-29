import {describe,expect,it} from 'vitest';
import {adaptLegacySegment,validateCaptionCues,validateEditSegment} from './edit-plan';
import {assessCaptionAlignment} from './av-qc';
import {sourcePreservingFilter,validateProtectedFocus} from './geometry';
import {renderMomentCircuitOverlay} from './overlay';
import {audiovisualLayer,coldViewerLayer,exactFinalPass} from './quality-gates';

describe('MomentCircuit permanent production regression corpus',()=>{
  it('R01 blocks legacy caption_words from reentering vNext',()=>{
    expect(()=>adaptLegacySegment({duration:8,caption_words:[{start:0,end:1,text:'hello'}]})).toThrow('LEGACY_CAPTION_WORDS_FORBIDDEN');
  });
  it('R02 blocks raw ASS/SSA subtitle serialization',()=>{
    expect(()=>validateCaptionCues([{start:0,end:1,text:'Dialogue: 0,0:00:01.00,Cap,,hello'}],8,true)).toThrow('RAW_SUBTITLE_ARTIFACT_TOKEN');
  });
  it('R03 blocks overlapping caption transitions that created double subtitles',()=>{
    expect(()=>validateCaptionCues([{start:0,end:2,text:'first'},{start:1.95,end:3,text:'second'}],8,true)).toThrow('CAPTION_OVERLAP');
  });
  it('R04 blocks unsupported emoji/tofu glyph risk before render',async()=>{
    await expect(renderMomentCircuitOverlay({hook_line1:'Great clip 🔥'},'hook')).rejects.toThrow('OVERLAY_UNSUPPORTED_GLYPH');
  });
  it('R05 blocks a crop focus that misses the protected face region',()=>{
    expect(()=>validateProtectedFocus({start:0,end:5,focus_x:.9,layout:'SINGLE_SPEAKER',protected_region:{x1:.25,y1:.1,x2:.65,y2:.9}})).toThrow('SHOT_FOCUS_MISSES_PROTECTED_SUBJECT');
  });
  it('R06 preserves two-shot context without black template bars',()=>{
    const f=sourcePreservingFilter('TWO_SHOT',.5);
    expect(f).toContain('gblur'); expect(f).not.toContain('color=black'); expect(f).not.toContain('drawbox');
  });
  it('R07 fails a final audio transcript missing the payoff',()=>{
    const r=assessCaptionAlignment(['setup words','the final payoff lands here'],'setup words and then it cuts');
    expect(r.pass).toBe(false);
  });
  it('R08 fails cold-viewer output with missing payoff even if opening is clear',()=>{
    expect(coldViewerLayer({cold_viewer_clarity:true,first_second_hook:true,payoff_complete:false,ending_complete:true}).pass).toBe(false);
  });
  it('R09 requires all exact-final layers rather than visual PASS alone',()=>{
    expect(exactFinalPass({technical:{pass:true},audiovisual:{pass:false},visual:{pass:true},cold_viewer:{pass:true}})).toBe(false);
  });
  it('R10 rejects a headline treatment that has no actual headline',()=>{
    expect(()=>validateEditSegment({edit_plan_version:1,start:0,duration:6,presentation_mode:'HEADLINE_CARD_OPENING',source_layout:'SINGLE_SPEAKER',shots:[{start:0,end:6,focus_x:.5,layout:'SINGLE_SPEAKER'}],caption_cues:[],captions_required:false,disclosure_mode:'none'})).toThrow('HEADLINE_REQUIRED');
  });
  it('R11 rejects shot gaps/overlaps instead of hiding them in the renderer',()=>{
    expect(()=>validateEditSegment({edit_plan_version:1,start:0,duration:6,presentation_mode:'NATIVE_SOURCE_ONLY',source_layout:'SINGLE_SPEAKER',shots:[{start:0,end:2,focus_x:.5,layout:'SINGLE_SPEAKER'},{start:2.2,end:6,focus_x:.5,layout:'SINGLE_SPEAKER'}],caption_cues:[],captions_required:false,disclosure_mode:'none'})).toThrow('SHOT_PLAN_GAP_OR_OVERLAP');
  });
  it('R12 explicitly permits a source-only clip so templates are not mandatory',()=>{
    expect(validateEditSegment({edit_plan_version:1,start:0,duration:6,presentation_mode:'NATIVE_SOURCE_ONLY',source_layout:'VERTICAL_NATIVE',shots:[{start:0,end:6,focus_x:.5,layout:'VERTICAL_NATIVE'}],caption_cues:[],captions_required:false,disclosure_mode:'none'}).presentation_mode).toBe('NATIVE_SOURCE_ONLY');
  });
  it('R13 captions-required audio mismatch remains an independent hard gate',()=>{
    expect(audiovisualLayer({captions_required:true,transcript_nonempty:true,alignment_pass:false}).pass).toBe(false);
  });
});
