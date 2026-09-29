import {describe,expect,it} from 'vitest';
import {layoutNeedsContext,shotDuration,sourcePreservingFilter,validateProtectedFocus} from './geometry';
import type {ShotPlan} from './edit-plan';

const shot=(patch:Partial<ShotPlan>={}):ShotPlan=>({start:0,end:4,focus_x:.5,layout:'SINGLE_SPEAKER',protected_region:{x1:.3,y1:.1,x2:.7,y2:.9},...patch});

describe('MomentCircuit geometry',()=>{
  it('guards focus against protected speaker regions',()=>{expect(()=>validateProtectedFocus(shot({focus_x:.5}))).not.toThrow();expect(()=>validateProtectedFocus(shot({focus_x:.9}))).toThrow('SHOT_FOCUS_MISSES_PROTECTED_SUBJECT');});
  it('keeps multi-person layouts context-preserving',()=>{for(const layout of ['TWO_SHOT','SPLIT_SCREEN','GAMEPLAY_PLUS_FACE'] as const){expect(layoutNeedsContext(layout)).toBe(true);const f=sourcePreservingFilter(layout,.5);expect(f).toContain('gblur');expect(f).not.toContain('color=black');}});
  it('treats INTERVIEW as a true full-bleed active-speaker crop',()=>{
    expect(layoutNeedsContext('INTERVIEW')).toBe(false);
    const f=sourcePreservingFilter('INTERVIEW',.56);
    expect(f).toContain('crop=1080:1920');
    expect(f).toContain('0.5600');
    expect(f).not.toContain('gblur');
    expect(f).not.toContain('overlay=');
    expect(f).not.toContain('color=black');
  });
  it('protects interview speaker focus regions',()=>{expect(()=>validateProtectedFocus(shot({layout:'INTERVIEW',focus_x:.5}))).not.toThrow();expect(()=>validateProtectedFocus(shot({layout:'INTERVIEW',focus_x:.9}))).toThrow('SHOT_FOCUS_MISSES_PROTECTED_SUBJECT');});
  it('allows native vertical to fill without template chrome',()=>{const f=sourcePreservingFilter('VERTICAL_NATIVE',.5);expect(f).toContain('crop=1080:1920');expect(f).not.toContain('drawbox');});
  it('uses requested speaker focus',()=>{expect(sourcePreservingFilter('SINGLE_SPEAKER',.25)).toContain('0.2500');expect(sourcePreservingFilter('SINGLE_SPEAKER',.75)).toContain('0.7500');});
  it('overscans horizontal single-speaker sources to remove baked frame edges',()=>{const f=sourcePreservingFilter('SINGLE_SPEAKER',.5);expect(f).toContain('crop=iw:ih*0.88:0:ih*0.06');expect(f).not.toContain('gblur');});
  it('computes shot duration and blocks invalid time',()=>{expect(shotDuration(shot({start:1.25,end:3.75}))).toBe(2.5);expect(()=>shotDuration(shot({start:4,end:4}))).toThrow();});
});
