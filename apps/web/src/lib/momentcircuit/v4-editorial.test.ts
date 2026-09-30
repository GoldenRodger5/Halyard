import {describe,it,expect} from 'vitest';
import {captionCuesFromSourceSpeech,normalizeEditorialCaption,
  normalizeEditorialDecision} from './v4-editorial';

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
