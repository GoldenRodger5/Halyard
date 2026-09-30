import {describe,expect,it} from 'vitest';
import {classifyVisualFailure,normalizeVisualVerdict,visualFrameTimes}
  from './v4-visual-verdict';

const frames=visualFrameTimes(4,16).map(at=>({at,bytes:Buffer.from('frame')}));
const observations=frames.map(frame=>({at_seconds:frame.at,
  observation:`Visible action at source second ${frame.at}`}));
const base={frames,start:4,end:16,candidateId:'candidate',
  segmentSha:'a'.repeat(64),model:'test-model'};
const noNativeCaptions={source_caption_mode:'NO_BURNED_IN_SPEECH_SUBTITLES',
  source_caption_samples:[]};

describe('v4 visual verdict boundary',()=>{
  it('binds a PASS to exact labeled opening and payoff frames',()=>{
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Drawn characters and stylized motion appear',
      ...noNativeCaptions,observations}});
    expect(verdict.event).toBe('CANDIDATE_VERIFIED');
    expect(verdict.evidence.observations).toHaveLength(8);
    expect(verdict.evidence.segment_sha256).toBe('a'.repeat(64));
  });

  it('rejects invented frame times and a missing ending',()=>{
    expect(()=>normalizeVisualVerdict({...base,raw:{visual_verdict:'FAIL',
      reason:'The visible story has no payoff',
      observations:observations.slice(0,3).concat({at_seconds:99,
        observation:'Invented final frame'})}})).toThrow('VISUAL_OBSERVATIONS_INCOMPLETE');
  });

  it('refuses a PASS that guesses content class',()=>{
    expect(()=>normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'PODCAST_CONVERSATION',content_class_evidence:'',
      ...noNativeCaptions,observations}})).toThrow('VISUAL_PASS_EVIDENCE_INCOMPLETE');
  });

  it('binds trusted burned-in speech subtitles to exact sampled frames',()=>{
    const first=frames[0]!,later=frames[4]!;
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Drawn characters and stylized motion appear',
      source_caption_mode:'BURNED_IN_SPEECH_SUBTITLES',
      source_caption_samples:[
        {at_seconds:first.at,text:'But it still hurts'},
        {at_seconds:later.at,text:'You would have punched me'}],
      observations}});
    expect(verdict.event).toBe('CANDIDATE_VERIFIED');
    if(verdict.event!=='CANDIDATE_VERIFIED') throw new Error('expected verified');
    expect(verdict.evidence.source_caption_mode).toBe('BURNED_IN_SPEECH_SUBTITLES');
    expect(verdict.evidence.source_caption_samples).toHaveLength(2);
  });

  it('refuses burned-in subtitle classification without two grounded frames',()=>{
    expect(()=>normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Drawn characters and stylized motion appear',
      source_caption_mode:'BURNED_IN_SPEECH_SUBTITLES',
      source_caption_samples:[{at_seconds:frames[0]!.at,text:'Only one subtitle'}],
      observations}})).toThrow('VISUAL_SOURCE_CAPTION_EVIDENCE_INCOMPLETE');
  });

  it('refuses contradictory no-caption mode with subtitle samples',()=>{
    expect(()=>normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Drawn characters and stylized motion appear',
      source_caption_mode:'NO_BURNED_IN_SPEECH_SUBTITLES',
      source_caption_samples:[{at_seconds:frames[0]!.at,text:'Visible spoken subtitle'}],
      observations}})).toThrow('VISUAL_SOURCE_CAPTION_EVIDENCE_CONFLICT');
  });

  it('returns an evidence-backed AI rejection for a weak moment',()=>{
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'FAIL',
      reason:'The opening lacks context and the payoff is missing',
      observations}});
    expect(verdict.event).toBe('MOMENT_REJECTED');
    if(verdict.event!=='MOMENT_REJECTED') throw new Error('expected rejection');
    expect(verdict.evidence.failure_stage).toBe('AI_REVIEW');
  });

  it('retires an encoded clip shorter than campaign minimum',()=>{
    expect(classifyVisualFailure('ENCODED_SEGMENT_OUTSIDE_CAMPAIGN_SPEC'))
      .toEqual({failureClass:'MOMENT_BAD',terminal:true});
    expect(classifyVisualFailure('SOURCE_ASSET_OR_RIGHTS_INVALID').failureClass)
      .toBe('COMPLIANCE');
  });
});
