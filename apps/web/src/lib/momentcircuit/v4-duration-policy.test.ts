import {describe,expect,it} from 'vitest';
import {
  deriveV4DurationPolicy,effectiveV4CandidateMin,v4DurationPrompt,
  V4_DURATION_POLICY_VERSION,V4_RENDER_HEADROOM_SECONDS
} from './v4-duration-policy';

describe('v4 duration policy',()=>{
  it('derives a 100ms hard floor and 500ms preferred floor',()=>{
    const policy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:null});
    expect(policy).toMatchObject({
      version:V4_DURATION_POLICY_VERSION,
      contractMinSeconds:10,
      renderHeadroomSeconds:V4_RENDER_HEADROOM_SECONDS,
      renderSafeMinSeconds:10.1,
      preferredMinSeconds:10.5
    });
    expect(effectiveV4CandidateMin(policy,60)).toBe(10.5);
  });

  it('uses the entire narrow source when it clears the hard floor but cannot reach preferred margin',()=>{
    const policy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:null});
    expect(effectiveV4CandidateMin(policy,10.1)).toBe(10.1);
    expect(effectiveV4CandidateMin(policy,10.44)).toBe(10.44);
  });

  it('returns no feasible floor when the full source is shorter than renderer headroom',()=>{
    const policy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:null});
    expect(effectiveV4CandidateMin(policy,10.099)).toBeNull();
    expect(v4DurationPrompt(policy,10.05)).toContain('physically too short');
  });

  it('clamps preferred duration to a narrow legal maximum without crossing the hard floor',()=>{
    const policy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:10.3});
    expect(policy.renderSafeMinSeconds).toBe(10.1);
    expect(policy.preferredMinSeconds).toBe(10.3);
    expect(effectiveV4CandidateMin(policy,30)).toBe(10.3);
  });

  it('rejects a campaign range that cannot fit measured renderer headroom',()=>{
    expect(()=>deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:10.05}))
      .toThrow('MINER_DURATION_CONTRACT_UNRENDERABLE');
  });

  it('puts the constructive duration requirement into the miner prompt',()=>{
    const policy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:60});
    const prompt=v4DurationPrompt(policy,45);
    expect(prompt).toContain('Renderer-safe hard minimum: 10.1s');
    expect(prompt).toContain('Preferred candidate minimum for this source: 10.5s');
    expect(prompt).toContain('meaningful source-native footage');
    expect(prompt).toContain('Do not use silence');
  });
});
