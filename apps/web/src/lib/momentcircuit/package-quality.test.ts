import {describe,expect,it} from 'vitest';
import {assessPackageQuality,packageRevisionFeedback} from './package-quality';

describe('MomentCircuit package quality',()=>{
  it('passes only when specificity/native voice meet floors',()=>{
    expect(assessPackageQuality({specificity:.78,native_voice:.80}).pass).toBe(true);
    expect(assessPackageQuality({specificity:.77,native_voice:.90}).reasons).toContain('SPECIFICITY_BELOW_0_78');
    expect(assessPackageQuality({specificity:.90,native_voice:.79}).reasons).toContain('NATIVE_VOICE_BELOW_0_80');
  });
  it('keeps unsupported claims a hard failure',()=>{
    expect(assessPackageQuality({specificity:.95,native_voice:.95,unsupported_claims:['invented fact']}).pass).toBe(false);
  });
  it('produces targeted revision feedback rather than a blind retry',()=>{
    const q=assessPackageQuality({specificity:.60,native_voice:.70});
    const feedback=packageRevisionFeedback(q);
    expect(feedback).toContain('concrete and specific');
    expect(feedback).toContain('native short-form clip page');
  });
});