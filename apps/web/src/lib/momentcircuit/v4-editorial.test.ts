import {describe,it,expect} from 'vitest';
import {captionCuesFromSourceSpeech,generatedCaptionsRequired,
  normalizeEditorialCaption,normalizeEditorialDecision,
  trustedNativeSubtitlePolicy} from './v4-editorial';

describe('v4 editorial handoff',()=>{
  it('turns source-local timed speech into short segment-local cues',()=>{
    const cues=captionCuesFromSourceSpeech([{start:4,end:8,
      text:'One two three four five six seven eight nine ten eleven twelve'}],
      4,10,true);
    expect(cues).toEqual([
      {start:0,end:2,text:'One two three four five six'},
      {start:2,end:4,text:'seven eight nine ten eleven twelve'}]);
  });
  it('holds missing required captions',()=>{
    expect(()=>captionCuesFromSourceSpeech([],0,10,true))
      .toThrow('CAPTIONS_REQUIRED');
  });
  it('trusts native subtitles only with manifest and visual agreement',()=>{
    const trusted={trusted_native_subtitles:true,
      manifest_official_pre_subtitled:true,
      visual_source_caption_mode:'BURNED_IN_SPEECH_SUBTITLES',
      visual_source_caption_samples:[
        {at_seconds:.7,text:'But it still hurts'},
        {at_seconds:9.3,text:'for doing this'}]};
    expect(trustedNativeSubtitlePolicy(trusted)).toBe(true);
    expect(trustedNativeSubtitlePolicy({...trusted,
      visual_source_caption_samples:[trusted.visual_source_caption_samples[0]]})).toBe(false);
    expect(trustedNativeSubtitlePolicy({...trusted,
      manifest_official_pre_subtitled:false})).toBe(false);
  });
  it('does not burn generated subtitles over trusted official native subtitles',()=>{
    const requirements={caption:{language:'English',must_include_one_of:['Invincible']}};
    const trusted={trusted_native_subtitles:true,
      manifest_official_pre_subtitled:true,
      visual_source_caption_mode:'BURNED_IN_SPEECH_SUBTITLES',
      visual_source_caption_samples:[
        {at_seconds:.7,text:'But it still hurts'},
        {at_seconds:9.3,text:'for doing this'}]};
    expect(generatedCaptionsRequired(requirements,trusted)).toBe(false);
    expect(generatedCaptionsRequired(requirements,{...trusted,
      visual_source_caption_mode:'AMBIGUOUS'})).toBe(true);
    expect(generatedCaptionsRequired(requirements,null)).toBe(true);
  });
  it('puts paid disclosure first and includes campaign token',()=>{
    expect(normalizeEditorialCaption('The payoff lands.',{
      caption:{must_include_one_of:['Invincible']},
      disclosure:{required:true,accepted:['#ad','Ad']}},'tiktok'))
      .toBe('#ad The payoff lands. Invincible');
  });
  it('rejects disallowed disclosure words',()=>{
    expect(()=>normalizeEditorialCaption('Sponsored by a brand',{
      disclosure:{rejected:['Sponsored']}},'tiktok'))
      .toThrow('EDITORIAL_REJECTED_DISCLOSURE_WORD');
  });
  it('rejects a headline on native source treatment',()=>{
    expect(()=>normalizeEditorialDecision({presentation_mode:'NATIVE_SOURCE_ONLY',
      source_layout:'CINEMATIC',focus_x:.5,headline:'Forced headline',
      layout_evidence:'One centered subject'},true))
      .toThrow('EDITORIAL_NATIVE_HEADLINE_CONFLICT');
  });
});
