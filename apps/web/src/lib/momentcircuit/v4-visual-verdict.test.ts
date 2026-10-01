import {describe,expect,it} from 'vitest';
import {classifyVisualFailure,normalizeVisualVerdict,visualFrameTimes}
  from './v4-visual-verdict';

const frames=visualFrameTimes(4,16).map(at=>({at,bytes:Buffer.from('frame')}));
const observations=frames.map(frame=>({at_seconds:frame.at,
  observation:`Visible action at source second ${frame.at}`}));
const base={frames,start:4,end:16,candidateId:'candidate',
  segmentSha:'a'.repeat(64),model:'test-model'};
const attention={
  hook_visual:85,hook_spoken:78,cold_comprehension:90,
  motion_reaction_density:82,surprise_tension_humor:88,payoff_strength:84,
  commentability:80,rewatchability:72,context_tax:12,
  hook_latency_seconds:0.4,payoff_latency_seconds:9.8,
  archetype:'SURPRISE_REVEAL',requires_fandom_context:false,
  attention_reason:'Immediate visible conflict and a self-contained reversal land quickly.'
};

describe('v4 visual verdict boundary',()=>{
  it('binds a PASS to exact labeled opening and payoff frames',()=>{
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Drawn characters and stylized motion appear',
      attention,observations}});
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
      content_class:'PODCAST_CONVERSATION',content_class_evidence:'',attention,
      observations}})).toThrow('VISUAL_PASS_EVIDENCE_INCOMPLETE');
  });

  it('persists bounded attention estimates separately from PASS quality',()=>{
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete surprising encounter',payoff:'The reveal resolves the setup',
      first_second_reason:'Visible conflict is immediate',
      content_class:'STREAMER_REACTION',
      content_class_evidence:'A live-action creator reacts during a physical action',
      attention,observations}});
    expect(verdict.event).toBe('CANDIDATE_VERIFIED');
    if(verdict.event!=='CANDIDATE_VERIFIED') throw new Error('expected pass');
    expect(verdict.evidence.attention.hook_visual).toBe(85);
    expect(verdict.evidence.attention.context_tax).toBe(12);
    expect(verdict.evidence.attention.version).toBe('v4-attention-director-20261001');
  });

  it('rejects a PASS with an unbounded attention estimate',()=>{
    expect(()=>normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A complete animated conflict',payoff:'The threat is resolved',
      first_second_reason:'A threat appears immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Drawn characters and stylized motion appear',
      attention:{...attention,hook_visual:140},observations}}))
      .toThrow('ATTENTION_HOOK_VISUAL_INVALID');
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
