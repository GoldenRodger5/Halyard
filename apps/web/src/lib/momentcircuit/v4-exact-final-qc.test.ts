import {describe,expect,it} from 'vitest';
import {evaluateV4Final,normalizeV4FinalReview,type FinalReview}
  from './v4-exact-final-qc';

const times=[0.05,0.5,1,2,4,6,8,11.85];
function review(overrides:Partial<FinalReview>={}):FinalReview{
  return {
    story_match:true,caption_visual_quality:true,professional_quality:true,
    text_bounds_pass:true,cold_viewer_clarity:true,first_second_hook:true,
    payoff_complete:true,ending_complete:true,artifact_scan_pass:true,
    frames:times.map((at_seconds)=>({at_seconds,
      observation:'The exact export frame is visibly complete',
      visible_text:['A complete caption']})),defects:[],summary:'Complete',
    ...overrides,
  };
}

describe('v4 exact-final QC gate',()=>{
  it('requires an observation of every exact sampled frame',()=>{
    expect(()=>normalizeV4FinalReview(review({
      frames:review().frames?.slice(0,-1)}),times))
      .toThrow('QC_INCOMPLETE_FRAME_INSPECTION');
  });
  it('detects visible subtitle serialization even when AI says PASS',()=>{
    const frames=review().frames!;
    frames[3]={...frames[3],visible_text:['Dialogue: 0,0:00:01.00,0:00:02.00']};
    const normalized=normalizeV4FinalReview(review({frames}),times);
    expect(normalized.pass).toBe(false);
    expect(normalized.defects[0]?.class).toBe('caption_serialization_artifact');
    expect(()=>evaluateV4Final({review:normalized,captions:['A complete caption'],
      transcript:'A complete caption',technicalPass:true}))
      .toThrow('QC_GENERATION_SYSTEMIC');
  });
  it('passes only complete visual and spoken caption evidence',()=>{
    const normalized=normalizeV4FinalReview(review(),times);
    const result=evaluateV4Final({review:normalized,
      captions:['A complete caption'],transcript:'A complete caption',
      technicalPass:true});
    expect(result.verdict).toBe('PASS');
    expect(result.alignment.pass).toBe(true);
  });
  it('routes a wrong story to immediate retirement',()=>{
    const normalized=normalizeV4FinalReview(review({story_match:false,
      defects:[{class:'story_mismatch',severity:'critical',
        evidence:'Frames show a different scene'}]}),times);
    const result=evaluateV4Final({review:normalized,captions:[],
      transcript:'',technicalPass:true});
    expect(result.verdict).toBe('MOMENT_BAD');
  });
  it('opens the generation circuit for a final caption/audio mismatch',()=>{
    const normalized=normalizeV4FinalReview(review(),times);
    expect(()=>evaluateV4Final({review:normalized,
      captions:['The complete payoff arrives'],transcript:'unrelated audio',
      technicalPass:true})).toThrow('QC_GENERATION_SYSTEMIC');
  });
});
