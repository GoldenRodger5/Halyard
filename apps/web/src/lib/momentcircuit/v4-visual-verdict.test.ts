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

  it('requires strong bounded attention estimates for a PASS',()=>{
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
    expect(verdict.evidence.attention.version).toBe('v4-breakout-gate-20261003');
    expect(verdict.evidence.attention.gate.pass).toBe(true);
    expect(verdict.evidence.attention.gate.score).toBeGreaterThanOrEqual(72);
  });

  it('rejects a technically coherent but scroll-stopping-weak opener',()=>{
    const boringAttention={...attention,
      hook_visual:20,hook_spoken:28,cold_comprehension:78,
      motion_reaction_density:20,surprise_tension_humor:12,
      payoff_strength:72,commentability:18,rewatchability:15,
      context_tax:20,hook_latency_seconds:0.4,
      attention_reason:'A calm setup is understandable but provides little immediate curiosity or tension.'};
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A parent calmly prepares food before a goodbye',
      payoff:'The characters eventually share an affectionate hug',
      first_second_reason:'The parent immediately mentions making sandwiches',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Animated characters have a calm conversation in a room',
      attention:boringAttention,observations}});
    expect(verdict.event).toBe('MOMENT_REJECTED');
    if(verdict.event!=='MOMENT_REJECTED') throw new Error('expected rejection');
    expect(verdict.evidence.failure_stage).toBe('ATTENTION_GATE');
    if(!('attention' in verdict.evidence)) throw new Error('attention evidence missing');
    expect(verdict.evidence.attention.gate.pass).toBe(false);
    expect(verdict.evidence.attention.gate.reasons).toContain('HOOK_STRENGTH_LT_75');
  });


  it('rejects a coherent relationship beat unless its opening is exceptional',()=>{
    const relationshipAttention={...attention,
      hook_visual:78,hook_spoken:76,cold_comprehension:84,
      motion_reaction_density:58,surprise_tension_humor:61,
      payoff_strength:78,commentability:54,rewatchability:52,
      context_tax:18,hook_latency_seconds:0.7,
      archetype:'RELATIONSHIP_MOMENT',
      attention_reason:'The relationship beat is understandable but lacks exceptional visible escalation.'};
    const verdict=normalizeVisualVerdict({...base,raw:{visual_verdict:'PASS',
      story_claim:'A parent supports a departure',payoff:'They hug before leaving',
      first_second_reason:'The trip is mentioned immediately',
      content_class:'ANIMATION_SCENE',
      content_class_evidence:'Animated family members talk and embrace',
      attention:relationshipAttention,observations}});
    expect(verdict.event).toBe('MOMENT_REJECTED');
    if(verdict.event!=='MOMENT_REJECTED') throw new Error('expected rejection');
    if(!('attention' in verdict.evidence)) throw new Error('attention evidence missing');
    expect(verdict.evidence.attention.gate.reasons)
      .toContain('LOW_EVENT_ARCHETYPE_NOT_EXCEPTIONAL');
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
