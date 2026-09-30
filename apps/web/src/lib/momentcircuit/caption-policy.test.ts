import {describe,expect,it} from 'vitest';
import {captionCuesForRender,sourceCaptionPolicy} from './caption-policy';

describe('MomentCircuit source caption policy',()=>{
  it('detects explicit official subbed source titles',()=>{
    const policy=sourceCaptionPolicy({title:"INVI_S4_Clip_Thragg_E7_OrganicSocialVertical_9x16_Subbed_Final.mp4"});
    expect(policy.sourceHasBakedCaptions).toBe(true);
    expect(policy.renderDynamicCaptions).toBe(false);
  });

  it('does not infer baked captions from unrelated metadata',()=>{
    const policy=sourceCaptionPolicy({title:'clean-master.mp4',notes:'verified transcript available'});
    expect(policy.sourceHasBakedCaptions).toBe(false);
    expect(policy.renderDynamicCaptions).toBe(true);
  });

  it('honors explicit baked-caption metadata',()=>{
    expect(sourceCaptionPolicy({burned_in_subtitles:true}).renderDynamicCaptions).toBe(false);
  });

  it('suppresses dynamic overlays when captions are not required while preserving source cues',()=>{
    const cues=[{start:0,end:1,text:'verified dialogue'}];
    expect(captionCuesForRender({captions_required:false,caption_cues:cues})).toEqual([]);
    expect(captionCuesForRender({captions_required:true,caption_cues:cues})).toEqual(cues);
  });
});
